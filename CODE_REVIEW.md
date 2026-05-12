# CODE REVIEW — Fair Pay (trước Closed Test Play Store)

> **Ngày review:** 2026-05-12
> **Scope:** Toàn bộ dự án, ưu tiên **bảo mật** và **kịch bản user phá hoại**
> **Đối tượng publish:** Google Play Console — Closed Test
> **Stack:** Expo 55 + React Native 0.83 + Supabase + Cloudflare R2 + Zustand

---

## 1. Tổng quan

Fair Pay là app chia tiền nhóm với kiến trúc tốt: RLS bật cho **15/15 bảng**, 7 RPC `SECURITY DEFINER` + `SET search_path` đúng pattern, audit log + notification có dedup, validation client-side với regex chống control char/zero-width, deep link reset password có timeout + cooldown. Test suite 85+ tests (utils thuần).

Tuy vậy, **chưa sẵn sàng publish closed test**. Có **6 lỗ hổng BLOCKING** ở tầng RLS/Edge Function cho phép leo quyền hoặc phá hoại dữ liệu. Tổng cộng review tìm thấy **~30 finding** chia theo severity dưới đây.

**Khuyến nghị tổng:** ⛔ **KHÔNG publish** cho đến khi fix toàn bộ `[blocking]` (mục §4). Ước tính ~6–10h dev để khoá toàn bộ.

---

## 2. Bảng điểm theo module

| Module | Điểm | Severity cao nhất | Ghi chú |
|---|---|---|---|
| Supabase RLS (policies) | **4/10** | `[blocking]` | 3 lỗ hổng leo quyền/spoofing đang LIVE trên DB |
| Supabase RPC (SECURITY DEFINER) | **8/10** | `[important]` | Pattern tốt, nhưng `create_notifications_batch` thiếu check group |
| Edge Functions (R2) | **5/10** | `[blocking]` | `group-avatar-cleanup` không auth; presign IDOR |
| Service layer (TypeScript) | **6/10** | `[important]` | Defense-in-depth yếu: 3 service không gọi `assertRole()` ở TS |
| Auth flow | **6/10** | `[important]` | OAuth + reset password ổn nhưng cooldown chỉ client-side |
| Input validation | **7/10** | `[important]` | `validateName` tốt; thiếu length check trên `note`, `body` SQL CHECK |
| Build config & manifest | **5/10** | `[important]` | Quyền dư thừa, `SYSTEM_ALERT_WINDOW` Play Store flag |
| Secrets management | **6/10** | `[important]` | `.env.local` ở `.gitignore`, nhưng R2 secret nằm cùng file dev |
| Testing | **7/10** | `[suggestion]` | Tốt cho utils; thiếu integration test RLS/RPC |
| Code quality / TS | **8/10** | `[nit]` | TS strict, services tách lớp tốt |
| **Trung bình** | **6.2/10** | | **Phải fix blocking trước khi closed test** |

---

## 3. TL;DR — 6 vector phá hoại nguy hiểm nhất

1. **Leo quyền lên admin của BẤT KỲ nhóm nào** — chỉ cần biết UUID group (qua leak/screenshot/MITM): policy `Admins can insert members` không filter role → user tự INSERT mình với `role='admin'`. **CRITICAL — explit ngắn 1 dòng SQL.**
2. **Giả mạo thông báo** — policy `notif_insert_auth` cho phép bất kỳ user nào INSERT notification với `user_id=victim`, `actor_id=anyone`, `deep_link=https://phishing.com`. Phishing in-app dễ dàng.
3. **Giả mạo audit log** — policy `System can insert audit logs` cho phép user INSERT row giả vào `audit_logs` (ai làm gì cũng đè được). Tampering với forensic trail.
4. **Edge Function `group-avatar-cleanup` public** — không kiểm JWT/service-role. Bất kỳ ai cũng có thể POST endpoint → quét xoá file R2.
5. **IDOR upload ảnh expense** — `expense-image-presign` không kiểm group ownership của `expenseId` → user A presign ảnh đè/chèn vào expense của group B.
6. **Member thường tạo payment giữa 2 user khác** — `payment.service.ts:61` `assertRole(['admin','member'])` + RLS `is_member` đủ để member B trong group X tạo payment "A trả C 5tr" → bóp méo settlement của người khác, chỉ admin xoá được.

---

## 4. Findings — phân theo severity

### 4.1 🔴 `[blocking]` — PHẢI FIX TRƯỚC CLOSED TEST

#### B1. RLS leo quyền lên admin bất kỳ group nào
**File:** Supabase policy `group_members.Admins can insert members`
**Vấn đề:** WITH CHECK hiện tại: `(is_admin(group_id) OR (user_id = auth_user_id()))`. Vế phải cho phép user tự INSERT mình với role tuỳ chọn, **không filter `role = 'member'`**. CHECK constraint `role IN ('admin','member')` để hợp lệ giá trị, nhưng KHÔNG ép phải `'member'`.

**Exploit POC (1 dòng SQL từ authenticated client):**
```sql
INSERT INTO group_members (group_id, user_id, role)
VALUES ('<bất kỳ group UUID nào>', auth_user_id_local, 'admin');
-- RLS WITH CHECK: user_id=self → pass. INSERT thành công.
-- Giờ user đã là admin → toàn quyền sửa/xoá trips, expenses, members.
```

**Cách lấy UUID group:** invite_code dễ enumerate (8 ký tự alphanum, 36^8 ≈ 2.8T tổ hợp, nhưng không có rate limit ở `joinGroupByCode`), screenshot, leak khi user share, hoặc reverse-engineer client log. UUID hiện trong response của `groups.SELECT` khi join.

**Fix:**
```sql
DROP POLICY "Admins can insert members" ON group_members;
CREATE POLICY "Admins manage members" ON group_members
  FOR INSERT WITH CHECK (is_admin(group_id));
-- Self-join phải đi qua RPC approve_join_request (SECURITY DEFINER) — đã có.
```

---

#### B2. Spoofing notification (phishing in-app)
**File:** Supabase policy `notifications.notif_insert_auth`
**Vấn đề:** WITH CHECK chỉ `auth.uid() IS NOT NULL`. Client trực tiếp INSERT row với `user_id=<bất kỳ ai>`, `actor_id=<bất kỳ ai>`, `title="Admin yêu cầu xác minh"`, `deep_link="https://phishing.example/login"`.

CLAUDE.md có comment "Phase 4 sẽ chuyển sang Edge Function service-role" — nhưng đang ở V1 → chưa fix.

**Fix tạm (ngay):**
```sql
DROP POLICY notif_insert_auth ON notifications;
CREATE POLICY notif_insert_service ON notifications
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```
Toàn bộ TS code đã đi qua RPC `create_notifications_batch` (SECURITY DEFINER) → chuyển RLS này sang service-role không làm vỡ flow hiện tại.

**Hoặc:** Thêm BEFORE INSERT trigger ép `NEW.actor_id = auth_user_id()`. Nhưng `user_id` vẫn cần force theo recipient list → khó qua trigger; ưu tiên đóng INSERT policy.

---

#### B3. Spoofing audit_logs
**File:** Supabase policy `audit_logs.System can insert audit logs`
**Vấn đề:** WITH CHECK chỉ `auth.uid() IS NOT NULL`. User INSERT row giả: `actor_id=<X>`, `group_id=<Y>`, `action='expense.delete'`, `before_data='{...}'`. Audit log mất tính khách quan.

**Fix:** Cùng kiểu B2.
```sql
DROP POLICY "System can insert audit logs" ON audit_logs;
CREATE POLICY audit_insert_service ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```
Toàn bộ insert audit đã đi qua `_log_action()` (SECURITY DEFINER, gọi từ RPC) → an toàn.

---

#### B4. Edge Function `group-avatar-cleanup` — endpoint public không auth
**File:** [supabase/functions/group-avatar-cleanup/index.ts](supabase/functions/group-avatar-cleanup/index.ts)
**Vấn đề:** `Deno.serve` không gọi `getAppUserId()` hay check `Authorization: Bearer <SERVICE_ROLE_KEY>`. Bất kỳ ai có URL function (đoán được từ project URL) gửi POST → cleanup chạy.

**Exploit:**
```bash
curl -X POST https://<project>.supabase.co/functions/v1/group-avatar-cleanup \
  -H "apikey: <ANON_KEY công khai trong app>"
```
→ Xoá hàng loạt object R2 đang được reference nhưng vừa qua window 24h.

**Fix:**
```typescript
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
Deno.serve(withErrorHandling(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || token !== SERVICE_ROLE_KEY) {
    throw new HttpError(401, 'Unauthorized');
  }
  // ... rest
}));
```
Sau đó schedule qua `pg_cron` + `pg_net.http_post` với header service_role.

---

#### B5. IDOR ở `expense-image-presign`
**File:** [supabase/functions/expense-image-presign/index.ts](supabase/functions/expense-image-presign/index.ts)
**Vấn đề:** Endpoint nhận `expenseId` + `tripId` từ body. Không cross-validate `expense.group_id == trip.group_id == <group caller thuộc về>`. User A (member group G1) presign ảnh cho `expenseId` thuộc group G2 (nếu lấy được ID).

**Fix:** Trước khi presign:
```typescript
// Edit flow: expenseId tồn tại → check group
const { data: expense } = await supabaseAdmin
  .from('expenses')
  .select('group_id')
  .eq('id', expenseId)
  .is('deleted_at', null)
  .maybeSingle();

if (expense) {
  const isMember = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', expense.group_id)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();
  if (!isMember.data) throw new HttpError(403, 'Không thuộc nhóm này');
}
// Create flow: chỉ check trip → group → caller
```

---

#### B6. R2 Access Key/Secret trong `.env.local`
**File:** [.env.local](.env.local) (không tracked)
**Vấn đề:** File chứa cả `Access Key ID` và `Secret Access Key` của Cloudflare R2 plaintext (line 9–10 + line 13–14). Mặc dù `.gitignore` loại trừ `.env.local`, nhưng file vẫn ở disk dev → backup OneDrive, screen-share, accidental commit (file `.env` không phải `.local` không bị loại trừ — kiểm tra `.gitignore` line 28–29: chỉ `.env.local` và `.env.*.local` — file `.env` thường vẫn track).

**Hành động:**
1. **Rotate R2 keys ngay** sau review — coi như đã leak (file để mở trên máy dev có truy cập web).
2. **Why:** Closed test = mở internet → tokens cũ có thể bị quét.
3. **How to apply:** Cloudflare Dashboard → R2 → Manage API Tokens → Roll secret. Re-set bằng `supabase secrets set R2_*`. Cập nhật `.env.local` mới (KHÔNG paste API token plaintext vào hover-readable file — dùng password manager / 1Password CLI).
4. Thêm vào `.gitignore`: `.env` (không có suffix) — chống commit nhầm.

---

### 4.2 🟡 `[important]` — fix trước v1.0 release (sau closed test cũng OK)

#### I1. UPDATE policies thiếu `WITH CHECK` → cross-tenant tampering
**Files:** policies trên `expenses`, `expense_splits`, `trips`, `payments`, `group_members`
**Vấn đề:** Mọi UPDATE policy hiện chỉ có `USING (...)`, không có `WITH CHECK (...)`. Postgres mặc định lấy `USING` làm cả CHECK, nhưng KHÔNG bảo vệ giá trị **sau** update.

Ví dụ: user là creator của expense ở group G1, UPDATE `SET group_id='G2', created_by='<victim>'` — USING pass (pre-row OK), không có WITH CHECK → row chuyển sang group G2 với "creator" mới.

**Fix:** Thêm `WITH CHECK` mirror `USING`:
```sql
ALTER POLICY "Creator or admin can update expenses" ON expenses
  USING (created_by = auth_user_id() OR is_admin(group_id))
  WITH CHECK (created_by = auth_user_id() OR is_admin(group_id));
```
Áp dụng cho 5 bảng nêu trên.

---

#### I2. `payments.INSERT` cho member thường + flip from/to
**File:** [src/services/payment.service.ts:61](src/services/payment.service.ts#L61) + RLS `payments.Members can create payments`
**Vấn đề:** Member tạo payment giữa 2 user khác (`from_member_id = userX, to_member_id = userY`, cả 2 không phải caller). Settlement bị bóp méo, chỉ admin xoá được — admin overhead.

**Fix:** Hai lựa chọn:
- **A (chặt):** RLS chỉ admin tạo payment: WITH CHECK `is_admin(group_id)`. TS `assertRole(['admin'])`.
- **B (vừa):** Member chỉ tạo payment mà `from_member_id` hoặc `to_member_id` là chính họ (tự ghi nhận đã trả/đã nhận). WITH CHECK:
  ```sql
  is_member(group_id) AND (
    (SELECT user_id FROM group_members WHERE id = from_member_id) = auth_user_id()
    OR (SELECT user_id FROM group_members WHERE id = to_member_id) = auth_user_id()
    OR is_admin(group_id)
  )
  ```
Khuyến nghị B (BR cho phép member ghi "tôi trả bạn X" tự do).

---

#### I3. `create_notifications_batch` không check recipient có thuộc group
**File:** [supabase/migrations/20260511160300_create_notifications_batch_rpc.sql](supabase/migrations/20260511160300_create_notifications_batch_rpc.sql)
**Vấn đề:** RPC nhận `p_recipients uuid[]` từ client. RPC force `actor_id = auth_user_id()` (chống spoof actor) — OK. Nhưng KHÔNG validate `recipients` đều thuộc `p_group_id`. Client malicious gọi RPC với recipient là user lạ → notification spam.

**Fix:** Trong RPC body:
```sql
IF p_group_id IS NOT NULL THEN
  PERFORM 1 FROM unnest(p_recipients) r(user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = p_group_id AND user_id = r.user_id AND left_at IS NULL
    );
  IF FOUND THEN
    RAISE EXCEPTION 'recipient_not_in_group' USING ERRCODE = 'P0001';
  END IF;
END IF;
```

---

#### I4. Service TS không gọi `assertRole()` cho `approveJoinRequest`, `createExpense`
**Files:**
- [src/services/group.service.ts:225-243](src/services/group.service.ts#L225)
- [src/services/expense.service.ts:63-129](src/services/expense.service.ts#L63)
**Vấn đề:** Defense-in-depth yếu. RPC có check `is_admin/is_member` bên DB, nhưng nếu RPC bị sửa nhầm hoặc client gọi raw SQL → không có lớp chặn TS. Inconsistent với `rejectJoinRequest`, `deleteExpense` (đều có `assertRole`).

**Fix:** Thêm 1 dòng ở đầu mỗi hàm:
```typescript
// approveJoinRequest
await assertRole(groupId, ['admin']);
// createExpense
await assertRole(params.groupId, ['admin', 'member']);
```

---

#### I5. Thiếu CHECK length trên text columns → DoS payload
**Bảng:** `groups.name`, `trips.name`, `expenses.title`, `expenses.note`, `users.display_name`, `payments.note`, `group_members.display_name`, `expense_presets.title`, `notifications.title`, `notifications.body`
**Vấn đề:** Không có `CHECK (length(...) <= N)` ở SQL. Client có validate, nhưng client malicious gửi 10MB title → INSERT thành công → DB bloat, query chậm, notification render vỡ UI.

**Fix:** Bulk migration:
```sql
ALTER TABLE groups ADD CONSTRAINT groups_name_len CHECK (length(name) <= 100);
ALTER TABLE trips ADD CONSTRAINT trips_name_len CHECK (length(name) <= 100);
ALTER TABLE expenses ADD CONSTRAINT expenses_title_len CHECK (length(title) <= 200);
ALTER TABLE expenses ADD CONSTRAINT expenses_note_len CHECK (note IS NULL OR length(note) <= 1000);
ALTER TABLE users ADD CONSTRAINT users_display_name_len CHECK (length(display_name) <= 30);
ALTER TABLE payments ADD CONSTRAINT payments_note_len CHECK (note IS NULL OR length(note) <= 200);
ALTER TABLE group_members ADD CONSTRAINT gm_display_name_len CHECK (length(display_name) <= 50);
ALTER TABLE expense_presets ADD CONSTRAINT preset_title_len CHECK (length(title) <= 100);
ALTER TABLE notifications ADD CONSTRAINT notif_title_len CHECK (length(title) <= 200);
ALTER TABLE notifications ADD CONSTRAINT notif_body_len CHECK (body IS NULL OR length(body) <= 1000);
```

---

#### I6. Virtual member spam
**File:** [src/services/group.service.ts](src/services/group.service.ts) — `addVirtualMember`
**Vấn đề:** Không giới hạn số virtual member trong 1 group. Admin spam 10.000 virtual member → settlement O(n²) lag, balance API trả 10k row. Có thể là vector phá hoại nội bộ (admin nhóm khó tính, hoặc admin lén nhường account cho người ngoài).

**Fix:** Service-side counter:
```typescript
const { count } = await supabase
  .from('group_members')
  .select('id', { count: 'exact', head: true })
  .eq('group_id', groupId)
  .eq('is_virtual', true)
  .is('left_at', null);
if ((count ?? 0) >= 50) throw new Error('Tối đa 50 thành viên ảo / nhóm');
```
Hoặc tốt hơn — DB trigger BEFORE INSERT.

---

#### I7. Join request không pre-check pending → spam admin
**File:** [src/services/group.service.ts:177-204](src/services/group.service.ts#L177)
**Vấn đề:** `joinGroupByCode` dùng `upsert` với `onConflict: 'group_id,user_id'` — mỗi lần user click "Join" lại trigger UPSERT + `notifyJoinRequested()`. Spam click 100 lần → admin nhận 100 notification (có dedup 10 phút nhưng vẫn nhiễu).

**Fix:** Trước upsert, query pending:
```typescript
const { data: pending } = await supabase
  .from('join_requests')
  .select('id')
  .eq('group_id', group.id)
  .eq('user_id', userId)
  .eq('status', 'pending')
  .maybeSingle();
if (pending) {
  return { type: 'pending', group, requestId: pending.id };
}
```

---

#### I8. AndroidManifest — permissions dư thừa & deprecated flags
**File:** [android/app/src/main/AndroidManifest.xml](android/app/src/main/AndroidManifest.xml)
**Vấn đề:**
- `READ_MEDIA_AUDIO`, `READ_MEDIA_VIDEO` — app chỉ dùng ảnh (avatar, hoá đơn) → KHÔNG cần audio/video. Play Console Data Safety sẽ flag overpermission.
- `SYSTEM_ALERT_WINDOW` — quyền nguy hiểm (overlay). Play Store yêu cầu justification riêng, thường refuse hoặc audit.
- `requestLegacyExternalStorage="true"` — deprecated từ SDK 30. App Bundle target SDK 33+ → ignore on Android 11+. Bỏ.
- `allowBackup="true"` — Android backup user data lên Google Drive. Token Supabase nếu nằm trong backup → leak nếu account Google compromise. Cân nhắc `allowBackup="false"` cho v1.0.

**Fix:** Loại bỏ `READ_MEDIA_AUDIO`, `READ_MEDIA_VIDEO`, `SYSTEM_ALERT_WINDOW`, `requestLegacyExternalStorage`. Cấu hình `app.json` `android.permissions: [...]` minimal whitelist.

---

#### I9. Deep link không filter path
**File:** [android/app/src/main/AndroidManifest.xml:27-33](android/app/src/main/AndroidManifest.xml#L27)
**Vấn đề:** `<data android:scheme="fairpay"/>` không có `android:host` hoặc `android:pathPrefix`. App nhận MỌI `fairpay://*` URI. Malicious app có thể trigger app open với payload tuỳ ý → tăng surface tấn công deep-link parsing.

**Fix:** Whitelist path:
```xml
<data android:scheme="fairpay" android:host="reset-password"/>
<data android:scheme="fairpay" android:host="oauth-callback"/>
```
Đồng bộ với `app.json` scheme + custom Linking config.

---

#### I10. Cooldown reset password chỉ client-side
**File:** [src/services/auth.helper.ts](src/services/auth.helper.ts), [src/stores/auth.store.ts:144-163](src/stores/auth.store.ts#L144)
**Vấn đề:** Cooldown 60s lưu ở SecureStore — clear app data, debugger bypass dễ. Supabase quota mặc định ~4 email/h/user, nhưng attacker dùng nhiều account → spam email cho 1 victim (vẫn qua Supabase quota per-target-email, nhưng UX tệ + quota mòn).

**Fix:**
- Thêm DB-side rate limit: `password_reset_attempts` table với `(email, last_sent_at)` — RPC check trước khi gọi `resetPasswordForEmail`.
- Hoặc dùng Cloudflare Turnstile / hCaptcha trước nút "Gửi email reset".

---

#### I11. Email enumeration ở register
**File:** [src/utils/error.ts:10](src/utils/error.ts#L10), [src/stores/auth.store.ts:85-98](src/stores/auth.store.ts#L85)
**Vấn đề:** `signUp` throw "User already registered" → map → "Email này đã được đăng ký". Attacker enumerate ai có account.

**Fix:** Normalize lỗi đăng ký thành generic:
```typescript
if (error.message.includes('User already registered')) {
  // Vẫn gửi confirmation email ở backend (Supabase auto handle nếu confirmations bật)
  throw new Error('Nếu email hợp lệ, chúng tôi sẽ gửi xác thực.');
}
```
Cần config Supabase Dashboard: Auth → Email Templates → "Confirm Signup" enabled + bật "Confirm email change".

---

#### I12. Logout không clear SQLite cache + push token
**File:** [src/stores/auth.store.ts:179-199](src/stores/auth.store.ts#L179)
**Vấn đề:** Đã reset Zustand stores ✓. Nhưng:
- SQLite `fairpay.db` không bị truncate → nếu user khác login trên cùng device, query cache cũ.
- Push token (nếu sau này thêm FCM) không revoke.
- SecureStore tokens supabase phụ thuộc SDK clear (thường OK, nhưng không guaranteed nếu SDK crash giữa chừng).

**Fix:** Thêm `resetDatabase()` trong `db/database.ts`:
```typescript
export async function resetDatabase(): Promise<void> {
  if (!db) return;
  const tables = ['expenses','expense_splits','trips','groups','group_members',
                  'notifications','audit_logs','sync_queue'];
  for (const t of tables) await db.execAsync(`DELETE FROM ${t}`);
}
```
Gọi trong `signOut()`. Force `SecureStore.deleteItemAsync('supabase.auth.token')` thủ công.

---

#### I13. Password min length 6 — quá yếu cho production
**Files:** [src/app/(auth)/register.tsx:47](src/app/(auth)/register.tsx#L47), [src/app/(auth)/reset-password.tsx:142](src/app/(auth)/reset-password.tsx#L142)
**Vấn đề:** 6 ký tự cho phép "123456", "password", "qwerty". Brute force online ~ms nếu rate limit yếu.

**Fix:**
- Min 8 ký tự (NIST 800-63B), khuyến nghị 12.
- Có thể check blacklist 100 passwords phổ biến: `if (COMMON_PASSWORDS.has(password)) throw ...`.
- Đồng bộ ở Supabase Dashboard → Auth → Password requirements.

---

#### I14. CHECK constraint thiếu trên `expense_splits.amount >= 0` — đã có ✓ nhưng `expenses.amount > 0` không hoàn toàn an toàn
**Confirmed:** `expenses_amount_check CHECK ((amount > 0))` đã có ✓. `payments_amount_check CHECK ((amount > 0))` ✓. `expense_splits_amount_check CHECK ((amount >= 0))` ✓.

**Tuy nhiên:** Không có **upper bound** trên amount. User tạo expense `amount = 9223372036854775807` (bigint max). Settlement calc dùng JS `number` (53-bit precision) → overflow → balance sai.

**Fix:**
```sql
ALTER TABLE expenses ADD CONSTRAINT expenses_amount_max
  CHECK (amount <= 999999999999); -- 999 tỷ VND, đủ thực tế
ALTER TABLE payments ADD CONSTRAINT payments_amount_max
  CHECK (amount <= 999999999999);
```

---

#### I15. Số lượng split không giới hạn → DoS
**File:** [src/services/expense.service.ts](src/services/expense.service.ts) → RPC `create_expense`
**Vấn đề:** `p_splits jsonb` — không cap số phần tử. User tạo expense với 100.000 splits → RPC insert 100k row, blow DB và memory client.

**Fix:** Trong RPC body:
```sql
IF jsonb_array_length(p_splits) > 200 THEN
  RAISE EXCEPTION 'too_many_splits' USING ERRCODE = 'P0001';
END IF;
```
(BR-NF: max 20 người/trip — nhưng UI không enforce ở server-side.)

---

### 4.3 🟢 `[nit]` / 💡 `[suggestion]`

#### N1. Edge Function commit chấp nhận mọi `image/*`
**File:** [supabase/functions/expense-image-commit/index.ts](supabase/functions/expense-image-commit/index.ts), tương tự `group-avatar-commit`
**Vấn đề:** Sau khi HEAD object trên R2, chỉ check `content-type.startsWith('image/')`. Client có thể upload PNG/GIF/WebP/SVG dù presign config jpeg. SVG đặc biệt nguy hiểm: chứa `<script>` → XSS nếu render trong WebView/preview.

**Fix:** Strict whitelist `['image/jpeg','image/png','image/webp']`. Block `image/svg+xml`.

#### N2. CORS `*` trong Edge Function
**File:** [supabase/functions/_shared/auth.ts:53](supabase/functions/_shared/auth.ts#L53)
**Nhận xét:** Mobile-only OK. Nếu sau này có web client → tighten origin.

#### N3. Helper SQL `is_member/is_admin` thiếu `SET search_path`
**File:** `docs/technical-specification.md:1012-1029`
**Nhận xét:** Best practice; không exploitable trong Supabase (RLS chỉ public schema). Thêm cho hygiene.

#### N4. Thiếu index dedup notification
**Vấn đề:** Query dedup `WHERE user_id=? AND type=? AND actor_id=? AND read_at IS NULL AND created_at >= ?` — index hiện chỉ `(user_id, created_at)` filtered. Khi user có nhiều unread notif (>100), dedup chậm.
**Fix:** `CREATE INDEX idx_notif_dedup ON notifications(user_id, type, actor_id, created_at DESC) WHERE read_at IS NULL;`

#### N5. `expense-image-commit` không strict TTL trên presign window
**Nhận xét:** TTL 60s ở r2.ts:40 ✓. Nhưng commit phase không re-verify object age. Nếu attacker delay commit > 60s, presign URL hết hạn — nhưng object đã upload, vẫn commit. Acceptable.

#### N6. Quota presign `group-avatar-presign` chỉ check khi commit → race
**File:** [supabase/functions/group-avatar-presign/index.ts](supabase/functions/group-avatar-presign/index.ts)
**Fix:** Insert quota row ngay khi presign, không chờ commit.

#### N7. Test coverage cho RLS/RPC = 0
**Nhận xét:** 85 test cases ở utils thuần — tốt. Nhưng RLS/RPC chưa có integration test. Trước GA nên thêm `supabase test db` với pgTAP.

#### N8. React 19.2 + RN 0.83.4 + new arch — bleeding edge
**Nhận xét:** Có thể có incompatibility chưa được audit (đặc biệt `react-native-reanimated 4.2.1` + new arch). Test kỹ trên Android 9 (lowest target).

#### N9. `version: "1.0.0"` không phù hợp closed test
**File:** [app.json:5](app.json#L5)
**Fix:** Bump `"1.0.0-beta.1"` hoặc `"0.9.0"` để Play Console phân biệt internal vs production track.

#### N10. SecureStore key `fair_pay_reset_last_sent`
**Nhận xét:** Tên hợp lệ (alphanumeric + underscore) ✓ — đúng CLAUDE.md.

#### N11. Wordlist check display_name (profanity)
**Suggestion:** Đối với closed test thì OK (10–100 user thân). Trước public launch cần wordlist filter (display_name "Đụ con mẹ admin" sẽ là tiêu đề notification của tất cả thành viên khác).

#### N12. Không có "Delete Account" flow
**Play Store policy (từ 2024):** App yêu cầu account → BẮT BUỘC có in-app delete account + URL ngoài. Hiện chưa có.
**Fix:** Thêm trong Settings → "Xoá tài khoản" → confirm → call RPC `delete_user_data()` (soft delete users, groups admin → cancel, audit log retained).

#### N13. Data Safety Form Play Console
**Cần khai báo:**
- Email (collected, encrypted in transit, account management)
- Display name (collected, encrypted in transit)
- Financial info (group expense amounts — qualified as "Financial info" → đòi mã hoá in transit + tại rest, có public privacy policy)
- Photos (avatar group, expense images — "Photos and videos")
- App activity (audit logs)
- Device or other IDs (auth.uid)

**Yêu cầu:** Privacy Policy URL công khai (Notion/Github Pages OK).

#### N14. HTML export `escapeHtml` đúng ✓
**File:** [src/utils/exportHtml.ts:76-83](src/utils/exportHtml.ts#L76) — escape `&<>"'`. Đủ cho PDF render qua expo-print WebView. ✓

#### N15. `extractParams` reset password parse fragment trước query
**File:** [src/app/(auth)/reset-password.tsx:28-42](src/app/(auth)/reset-password.tsx#L28) — Robust, handle cả `?` và `#`. ✓ Praise.

#### N16. `validateName` regex cover control + zero-width
**File:** [src/utils/validate.ts:9-10](src/utils/validate.ts#L9) — 🎉 `[praise]` Tốt, chống name spoofing (ZWSP).

---

## 5. Đánh giá tích cực (`[praise]`)

- **🎉 RLS bật toàn bộ 15/15 bảng** — đa số dự án junior không bật → đã làm đúng default.
- **🎉 RPC pattern chuẩn:** `SECURITY DEFINER` + `SET search_path = public, pg_temp` + REVOKE PUBLIC + GRANT authenticated + `COMMENT ON FUNCTION` ghi errcode → đây là pattern industry standard, hiếm dự án solo dev làm chỉn chu vậy.
- **🎉 Actor luôn `auth.uid()` ở RPC** — không nhận `p_actor_id` từ client → chống spoofing actor.
- **🎉 Atomic mutations qua RPC** thay vì Promise.all client-side — đúng tinh thần ACID.
- **🎉 Notification dedup 10 phút** + setting opt-in per-type — UX cao cấp.
- **🎉 Cron cleanup notifications scheduled qua pg_cron** — không phụ thuộc client.
- **🎉 `validateName` cover zero-width + control char** — tinh tế.
- **🎉 `escapeHtml` ở exportHtml** — XSS-aware export.
- **🎉 `getAuthUserId()` cache 30s + clear khi logout** — perf + correctness.
- **🎉 Migration set có header comment + describes intent** — maintainable.
- **🎉 IME tiếng Việt fix trong BottomSheet (CLAUDE.md note)** — đầu tư UX chi tiết.
- **🎉 Test suite 85+ pure-function tests** — đủ cover utils thuần.

---

## 6. Hành động ưu tiên (sắp xếp theo P0/P1/P2)

### P0 — bắt buộc fix trước upload bundle lên Play Console
1. **B1** — Đóng policy `Admins can insert members` (DROP + recreate). [SQL migration mới, 5 phút.]
2. **B2** — Đóng policy `notif_insert_auth`. [Migration, 2 phút.]
3. **B3** — Đóng policy `System can insert audit logs`. [Migration, 2 phút.]
4. **B4** — Thêm auth check `SUPABASE_SERVICE_ROLE_KEY` cho `group-avatar-cleanup`. [Edge function deploy, 10 phút.]
5. **B5** — IDOR fix cho `expense-image-presign`. [Edge function deploy, 20 phút.]
6. **B6** — Rotate R2 keys + cập nhật `supabase secrets set`. [Cloudflare + CLI, 15 phút.]

**Tổng:** ~1h dev. Test lại flow upload + approve join + create expense sau khi fix.

### P1 — fix trong tuần đầu closed test
7. **I1** — Thêm `WITH CHECK` cho 5 UPDATE policies.
8. **I2** — Tighten `payments.INSERT` (self-only hoặc admin-only).
9. **I3** — `create_notifications_batch` validate recipient ∈ group.
10. **I4** — Thêm `assertRole()` ở `approveJoinRequest`, `createExpense`.
11. **I5** — Migration length CHECK cho 10 text columns.
12. **I8** — Bỏ permissions dư + `SYSTEM_ALERT_WINDOW`.
13. **N12** — Thêm "Delete Account" trong Settings (Play Store policy).
14. **N13** — Publish Privacy Policy URL + fill Data Safety form.

**Tổng:** ~6h dev.

### P2 — trước GA (v1.0 public)
15. I6, I7, I9, I10, I11, I12, I13, I14, I15
16. Wordlist profanity filter
17. Add pgTAP integration tests cho RLS/RPC
18. Bump password min → 8/12
19. Strict image MIME whitelist

---

## 7. Test cases bắt buộc sau fix

```bash
# 1. RLS leo quyền
# (User B, không phải admin/member group G1)
INSERT INTO group_members (group_id, user_id, role) VALUES ('<G1>', '<B>', 'admin');
# EXPECTED: ERROR — policy violation.

# 2. Notification spoof
INSERT INTO notifications (user_id, actor_id, type, group_id, title)
VALUES ('<victim>', '<fake>', 'expense.created', '<G>', 'phishing');
# EXPECTED: ERROR — RLS violation.

# 3. Audit spoof
INSERT INTO audit_logs (group_id, actor_id, action) VALUES ('<G>', '<X>', 'fake');
# EXPECTED: ERROR.

# 4. Group avatar cleanup auth
curl -X POST $FN_URL/group-avatar-cleanup -H "apikey: <ANON>"
# EXPECTED: 401.

# 5. Expense image IDOR
# (User A in G1 presign cho expenseId thuộc G2)
POST /expense-image-presign { expenseId: '<G2 expense>', tripId: '<G2 trip>' }
# EXPECTED: 403.

# 6. Payment manipulation
# (Member B tạo payment from C to D, all in group G — B không phải C/D)
INSERT INTO payments (group_id, from_member_id, to_member_id, amount) VALUES (...);
# EXPECTED (sau fix I2): ERROR.

npx jest        # 85 tests phải pass
npx tsc --noEmit  # zero TS error
```

---

## 8. Checklist Play Console — Closed Test submission

- [ ] **P0 fixes** hoàn tất (B1–B6)
- [ ] Bump version → `1.0.0-beta.1`
- [ ] Bỏ `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_AUDIO/VIDEO` khỏi manifest
- [ ] Whitelist `fairpay://reset-password`, `fairpay://oauth-callback` ở Supabase Dashboard → Auth → URL Configuration
- [ ] Tạo Privacy Policy URL (Notion/Github Pages, public)
- [ ] Điền Data Safety form (email, display name, financial info, photos, app activity, device ID)
- [ ] Thêm "Delete Account" flow trong Settings + URL ngoài (Play Console policy 2024)
- [ ] Test trên thiết bị thật (min Android 9, target Android 14)
- [ ] Test flow reset password thật end-to-end (gửi email → click link trên cùng phone → đổi password → login lại)
- [ ] Test logout → login user khác — kiểm tra không leak data cũ qua SQLite
- [ ] Smoke test toàn bộ Play Store internal track (10 phút manual QA)
- [ ] Tạo app icon hi-res 512×512 cho Play Console listing
- [ ] Screenshots 4–8 ảnh phone + 2 ảnh tablet

---

## 9. Kết luận

Fair Pay là dự án **kỹ thuật chỉn chu**, kiến trúc RLS + RPC pattern đúng tinh thần production. Tuy vậy có **3 lỗ hổng RLS LIVE trên DB** và **2 Edge Function bug** đủ nghiêm trọng để chặn closed test. Toàn bộ P0 fix được trong ~1h — sau đó app đủ an toàn cho 10–100 closed tester.

**Phán quyết:** 🔄 **Request Changes** — fix toàn bộ §4.1 trước khi upload bundle. Mời ping lại khi hoàn tất, sẽ verify lại policies trên Supabase.

---

> Báo cáo này được sinh bởi `/code-review-excellence`. Tham chiếu chi tiết: xem CLAUDE.md, `docs/technical-specification.md`, và `supabase/migrations/`.
