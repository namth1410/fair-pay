# Fair Pay — Tài Liệu Đặc Tả Kỹ Thuật

> **Phiên bản:** 2.0 — Draft  
> **Ngày cập nhật:** Tháng 4, 2026  
> **Nền tảng:** Android — CH Play  

---

## Mục lục

1. [Tech Stack](#1-tech-stack)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Mô hình dữ liệu — PostgreSQL Schema](#3-mô-hình-dữ-liệu--postgresql-schema)
4. [Thuật toán quyết toán](#4-thuật-toán-quyết-toán)
5. [Backend API / Edge Functions](#5-backend-api--edge-functions)
6. [FCM — Push Notification](#6-fcm--push-notification)
7. [Dark Mode](#7-dark-mode)
8. [Xử lý xung đột (Conflict Resolution)](#8-xử-lý-xung-đột-conflict-resolution)
9. [Supabase Row Level Security (RLS)](#9-supabase-row-level-security-rls)
10. [Yêu cầu phi chức năng](#10-yêu-cầu-phi-chức-năng)
11. [Thiết kế UI/UX](#11-thiết-kế-uiux)
12. [Tài liệu tham khảo](#12-tài-liệu-tham-khảo)

---

## 1. Tech Stack

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| Mobile Framework | **React Native (Expo SDK 51+)** | Dev web làm được ngay, Expo managed workflow giảm config native |
| Ngôn ngữ | **TypeScript** | Type safety, bắt lỗi sớm |
| Navigation | **React Navigation v6** | Chuẩn của RN ecosystem |
| UI Component Library | **HeroUI Native** (`heroui-native`) | Accessible, animation mượt, customizable, hỗ trợ Tailwind v4 qua Uniwind |
| Styling | **Uniwind (Tailwind v4)** | Đi kèm HeroUI Native, utility-first CSS-in-JS cho React Native |
| State Management | **Zustand** | Nhẹ hơn Redux, đủ mạnh cho app quy mô này |
| Local Database | **SQLite (expo-sqlite)** | Offline-first, persist data, transaction support |
| Authentication | **Supabase Auth** | Email/password + Google OAuth, JWT-based, free tier đủ dùng |
| Backend / Database | **Supabase (PostgreSQL) + VPS** | Supabase free tier cho DB + Auth + Realtime. VPS backup nếu vượt free tier hoặc cần custom logic |
| Realtime Sync | **Supabase Realtime** | PostgreSQL Changes → broadcast qua WebSocket đến các client trong cùng nhóm |
| Push Notification | **Firebase Cloud Messaging (FCM)** | Native push Android, gửi từ VPS hoặc Supabase Edge Functions |
| Offline Sync | **SQLite local + custom sync layer** | SQLite lưu local, sync queue đẩy lên Supabase khi có mạng |
| Analytics | **Supabase Analytics / PostHog** | Free tier đủ dùng, không phụ thuộc Firebase |
| Crash Reporting | **Sentry (expo-sentry)** | Free tier 5k events/tháng, không phụ thuộc Firebase |
| Export ảnh | **react-native-view-shot** | Chụp component thành ảnh, lưu về máy ngay |

### Lựa chọn Backend: Supabase vs VPS

| Tiêu chí | Supabase Free Tier | VPS (đã có sẵn) |
|----------|-------------------|------------------|
| Database | PostgreSQL managed, 500MB | PostgreSQL self-hosted, không giới hạn |
| Auth | Supabase Auth, 50k MAU | Tự triển khai hoặc dùng Supabase Auth |
| Realtime | Supabase Realtime (200 concurrent) | Tự triển khai WebSocket server |
| Edge Functions | 500k invocations/tháng | Không giới hạn |
| Chi phí | $0 | Chi phí VPS đã có |
| Độ phức tạp triển khai | Thấp | Cao hơn |

**Chiến lược:** Dùng Supabase free tier làm chính. VPS dự phòng khi cần mở rộng hoặc chạy custom logic nặng (cron job nhắc nợ, batch processing).

### 1.3 Password Reset Flow

Flow đặt lại mật khẩu qua email deep link (scheme `fairpay://`):

```
┌─────────────┐   1. resetPasswordForEmail    ┌──────────────┐
│   App       │──────────────────────────────▶│  Supabase    │
│ (forgot)    │                                │   Auth       │
└─────────────┘                                └──────┬───────┘
                                                      │ 2. Gửi email với link
                                                      ▼
                              https://<proj>.supabase.co/auth/v1/verify
                                  ?token=XXX&type=recovery
                                  &redirect_to=fairpay://reset-password
                                                      │
                                                      │ 3. User click trong email
                                                      ▼
                                       ┌──────────────────────────────┐
                                       │ Supabase verify token, redirect│
                                       │ fairpay://reset-password       │
                                       │   #access_token=...            │
                                       │   &refresh_token=...           │
                                       │   &type=recovery               │
                                       └──────────┬───────────────────┘
                                                  │ 4. OS mở app qua custom scheme
                                                  ▼
┌─────────────┐   5. setSession + updateUser(pw)  ┌──────────────┐
│   App       │◀──────────────────────────────────▶│  Supabase    │
│(reset-pwd)  │   6. router.replace('/(main)')     │              │
└─────────────┘                                    └──────────────┘
```

**Flow type**: client đang ở `implicit` (mặc định, `flowType` không set trong `supabase.ts`) → tokens trả về qua URL fragment `#`. Code `reset-password.tsx` parse defensive: thử `#fragment` trước, fallback `?code=` + `exchangeCodeForSession` nếu tương lai chuyển sang PKCE.

**AuthGate exception**: `src/app/_layout.tsx` KHÔNG redirect session active sang `(main)` khi `segments[1] === 'reset-password'`, để user hoàn tất đổi mật khẩu rồi mới về trang chính.

**Rate limiting**:
- Server-side: Supabase mặc định ~4 email reset/giờ.
- Client-side: cooldown 60s persistent trong `expo-secure-store` (`fair_pay:reset_last_sent`) qua 2 helper trong `src/services/auth.helper.ts`: `getResetCooldownRemaining()` + `markResetSent()`. Nút "Gửi lại" disabled trong cooldown, đóng/mở app không reset timer.

**Bảo mật / ghi chú vận hành**:
- `resetPasswordForEmail` KHÔNG trả lỗi khi email không tồn tại (chống user enumeration). UI luôn hiển thị "đã gửi", KHÔNG phân biệt case không tìm thấy email.
- Link email mặc định hết hạn sau 1 giờ (config Supabase).
- **Prerequisite deploy**: Supabase Dashboard → Authentication → URL Configuration → Redirect URLs phải whitelist `fairpay://reset-password`. Thiếu bước này, Supabase từ chối redirect và toàn bộ flow fail silent.
- Custom scheme `fairpay://` chỉ hoạt động trên dev-client / EAS build, **không trên Expo Go**.

---

## 2. Kiến trúc tổng thể

### 2.1 Mô hình Offline-First với SQLite + Supabase

App lưu toàn bộ dữ liệu vào SQLite local. Mọi thao tác đọc/ghi đều thực hiện trên SQLite trước (optimistic UI). Một **sync queue** chạy nền sẽ đẩy các thay đổi lên Supabase khi có mạng. Supabase Realtime broadcast thay đổi cho các thiết bị khác.

### 2.2 Luồng sync dữ liệu

```
┌──────────────────┐      ┌───────────────────┐      ┌──────────────────┐
│   User Device     │      │     Supabase       │      │  Other Devices    │
│ ┌──────────────┐ │      │ ┌───────────────┐  │      │ ┌──────────────┐ │
│ │   SQLite     │ │      │ │  PostgreSQL   │  │      │ │   SQLite     │ │
│ │   (local)    │ │      │ │  (cloud)      │  │      │ │   (local)    │ │
│ └──────┬───────┘ │      │ └───────┬───────┘  │      │ └──────┬───────┘ │
│        │         │      │         │          │      │        │         │
│ ┌──────▼───────┐ │      │ ┌───────▼───────┐  │      │ ┌──────▼───────┐ │
│ │  Sync Queue  │─┼─────▶│ │   Realtime    │──┼─────▶│ │  Sync Queue  │ │
│ │  (pending)   │ │      │ │  (WebSocket)  │  │      │ │  (apply)     │ │
│ └──────────────┘ │      │ └───────────────┘  │      │ └──────────────┘ │
└──────────────────┘      └───────────────────┘      └──────────────────┘
```

1. User thêm khoản chi → ghi vào SQLite local → UI cập nhật ngay (optimistic)
2. Sync queue phát hiện có pending change → gọi Supabase API (insert/update/delete)
3. Supabase Realtime broadcast thay đổi qua WebSocket channel (theo groupId)
4. Các thiết bị khác nhận event → cập nhật SQLite local → UI tự cập nhật
5. Nếu offline: pending changes tích lũy trong sync queue → đẩy hết khi có mạng

### 2.3 Sync Queue — Chi tiết

```
Table: sync_queue (SQLite local)
──────────────────────────────────────────────
| id | table_name | record_id | action   | payload (JSON) | status  | created_at |
|----|------------|-----------|----------|----------------|---------|------------|
| 1  | expenses   | uuid-123  | INSERT   | {...}          | pending | ...        |
| 2  | expenses   | uuid-456  | UPDATE   | {...}          | synced  | ...        |
| 3  | payments   | uuid-789  | INSERT   | {...}          | failed  | ...        |
```

- **pending**: chưa gửi lên server
- **synced**: đã gửi thành công, sẽ xóa sau 24h
- **failed**: gửi thất bại (conflict, network error), cần retry hoặc thông báo user

> **Rate limit (P0429)**: khi server reject vì rate limit (xem §9.10), queue đặt item về
> `failed` với fixed backoff **30 phút** và **KHÔNG tăng retry_count** → KHÔNG bao giờ
> dead-letter. Batch offline hợp lệ tự đồng bộ lại khi cửa sổ trượt trôi qua; queue của
> kẻ abuse chỉ retry ~1 lần/30' (vô hại). Xem `classifyError` + `markFailed` trong
> `src/sync/`.

---

## 3. Mô hình dữ liệu — PostgreSQL Schema

Supabase dùng PostgreSQL. Dưới đây là schema chính:

### 3.1 Table: `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL, -- Supabase Auth UID
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  photo_url TEXT,
  fcm_token TEXT,
  settings JSONB DEFAULT '{
    "dark_mode": "system",
    "notify_activity": true,
    "notify_payment": true,
    "notify_member": true,
    "notify_smart": true,
    "haptics_enabled": true,
    "animations_enabled": true
  }',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | UUID (PK) | Internal ID |
| `auth_id` | UUID (UNIQUE) | Supabase Auth UID |
| `display_name` | TEXT | Tên hiển thị |
| `email` | TEXT (UNIQUE) | Email đăng nhập |
| `photo_url` | TEXT? | Avatar URL |
| `fcm_token` | TEXT? | FCM device token (cập nhật mỗi lần login) |
| `settings` | JSONB | `{dark_mode, notify_activity, notify_payment, notify_member, notify_smart, haptics_enabled, animations_enabled}` — xem `src/services/user.service.ts:UserSettings` |
| `created_at` | TIMESTAMPTZ | Ngày tạo |

### 3.2 Table: `groups`

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id), -- Người tạo nhóm (đồng thời là Admin duy nhất)
  invite_code TEXT UNIQUE NOT NULL, -- 6 ký tự alphanumeric, sinh bằng function
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- Soft delete
);
```

> **Sinh mã mời (BR-08):**
> - Mã 6 ký tự từ bảng chữ cái `a-z, 0-9` (36^6 = ~2.1 tỷ tổ hợp)
> - Sinh bằng PostgreSQL function `generate_invite_code()` với retry loop (tối đa 10 lần)
> - Nếu collision (UNIQUE violation) → sinh lại. Không dùng UUID hex nữa.
> - Mã được sinh 1 lần khi tạo nhóm, không thể đổi.
>
> ```sql
> CREATE OR REPLACE FUNCTION generate_invite_code() RETURNS TEXT AS $$
> DECLARE
>   chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
>   result TEXT := '';
>   i INTEGER;
> BEGIN
>   FOR i IN 1..6 LOOP
>     result := result || substr(chars, floor(random() * 36 + 1)::int, 1);
>   END LOOP;
>   RETURN result;
> END;
> $$ LANGUAGE plpgsql;
> ```

### 3.3 Table: `group_members`

```sql
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID REFERENCES users(id), -- NULL nếu là member ảo
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  is_virtual BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ, -- Soft-remove: NULL = active, NOT NULL = đã rời nhóm
  UNIQUE(group_id, user_id) -- Mỗi user chỉ join 1 lần
);
```

> **Soft-remove (`left_at`):** Khi member rời nhóm hoặc bị kick, set `left_at = NOW()` thay vì xóa row.
> Data lịch sử (expense_splits, payments) vẫn trỏ đúng về member cũ.
> Khi rejoin qua invite code → reset `left_at = NULL`, giữ nguyên member ID → kế thừa toàn bộ data cũ.

### 3.4a Table: `join_requests` (BR-09) — Yêu cầu tham gia nhóm

```sql
CREATE TABLE join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id), -- Admin đã duyệt
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(group_id, user_id, status) -- Mỗi user chỉ có 1 pending request / group
);
```

> **Luồng:** User nhập mã mời → INSERT `join_requests` (pending) → Admin nhận notification → approve → INSERT `group_members` + UPDATE status = approved. Reject → UPDATE status = rejected.

### 3.4b Table: `group_invitations` (BR-11) — Lời mời qua email

```sql
CREATE TABLE group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  invited_user_id UUID NOT NULL REFERENCES users(id),
  invited_by UUID NOT NULL REFERENCES users(id), -- Admin gửi lời mời
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(group_id, invited_user_id, status)
);
```

> **Luồng:** Admin tìm user theo email → INSERT `group_invitations` (pending) → user nhận notification → accept = INSERT `group_members`, decline = UPDATE status.

### 3.4 Table: `trips`

```sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('travel', 'meal', 'event', 'other')) DEFAULT 'other',
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ -- Soft delete
);
```

### 3.5 Table: `expenses`

```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  group_id UUID NOT NULL REFERENCES groups(id), -- Denormalized
  title TEXT NOT NULL,
  raw_amount BIGINT NOT NULL CHECK (raw_amount > 0), -- Số tiền gốc người dùng nhập (đồng)
  amount BIGINT NOT NULL CHECK (amount > 0), -- Số tiền sau khi làm tròn (đồng), luôn bội 1000đ
  category TEXT NOT NULL CHECK (category IN ('food', 'transport', 'accommodation', 'fun', 'shopping', 'other')),
  paid_by UUID[] NOT NULL, -- Mảng member IDs (hỗ trợ nhiều người trả)
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'ratio', 'custom')),
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  version INT NOT NULL DEFAULT 1, -- Optimistic lock
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- Soft delete
);
```

### 3.6 Table: `expense_splits`

```sql
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES group_members(id),
  amount BIGINT NOT NULL CHECK (amount >= 0) -- Phần phải trả (đồng)
);
```

**Participation per-expense (chia tập-con thành viên):** `expense_splits` của một khoản chi có thể chỉ gồm **một tập con** thành viên nhóm — người không tham gia đơn giản không có row (không bị tính nợ). Form Thêm khoản chi (`ExpenseFormScreen`) dùng `participants: Set<string>` (mặc định tích hết) trực giao với `split_type`; cả 3 mode (`equal`/`ratio`/`custom`) chia cho người được tích. Toàn bộ tầng đọc đều subset-safe: `computeBalances` lặp theo split rows, `create_expense` RPC chèn đúng các row trong `p_splits` (không suy ra từ toàn bộ member, chỉ validate `paid_by` active + `SUM(splits)=amount`). Parse ratio qua `resolveRatio()` (`src/utils/split.ts`): rỗng→1, "0" giữ 0. `validateSplits` chạy ở cả UI form lẫn `createExpense` service (hardening cho caller không qua form: preset 1-tap, queue replay).

### 3.7 Table: `payments`

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  group_id UUID NOT NULL REFERENCES groups(id), -- Denormalized
  from_member_id UUID NOT NULL REFERENCES group_members(id),
  to_member_id UUID NOT NULL REFERENCES group_members(id),
  amount BIGINT NOT NULL CHECK (amount > 0), -- Số tiền thực tế (đồng)
  note TEXT,
  recorded_by UUID NOT NULL REFERENCES users(id),
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ -- Soft delete, chỉ Admin
);
```

### 3.8 Table: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  trip_id UUID REFERENCES trips(id),
  action TEXT NOT NULL, -- 'expense.create', 'expense.edit', 'expense.delete', 'payment.create', 'payment.delete', 'member.role_change'
  actor_id UUID NOT NULL REFERENCES users(id),
  target_id UUID NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.9 Table: `settlements` (read-only, generated)

```sql
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  from_member_id UUID NOT NULL REFERENCES group_members(id),
  to_member_id UUID NOT NULL REFERENCES group_members(id),
  amount BIGINT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.10 Table: `notifications` — Trung tâm Thông báo

Mô hình **per-user fan-out** (mỗi user nhận có 1 row riêng) — tối ưu cho query "unread của tôi" + mark-as-read đơn giản. Tham chiếu BR-NOTIF-01..07 trong business-requirements.md §8.

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES trips(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,           -- e.g. 'expense.created'
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,           -- VN string render sẵn ở write-time
  body        TEXT,
  data        JSONB NOT NULL DEFAULT '{}',  -- { count, target_ids, trip_id, amount, ... }
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notif_user_all
  ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_group
  ON notifications(group_id, created_at DESC);

-- TTL cleanup function — aggressive cho 500MB free tier
CREATE OR REPLACE FUNCTION cleanup_notifications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM notifications
  WHERE (read_at IS NOT NULL AND read_at < now() - interval '30 days')
     OR (read_at IS NULL     AND created_at < now() - interval '60 days');
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_notifications() FROM anon, authenticated;

-- Schedule daily at 20:00 UTC (= 03:00 ICT)
SELECT cron.schedule(
  'cleanup-notifications', '0 20 * * *',
  'SELECT cleanup_notifications()'
);
```

| Field | Type | Mô tả |
|-------|------|-------|
| `user_id` | UUID FK users.id | Recipient — user được fan-out tới |
| `group_id` | UUID FK groups.id | Group context (NULL nếu system-wide) |
| `trip_id` | UUID FK trips.id | Trip context (NULL nếu không liên quan trip) |
| `type` | TEXT | `expense.created` / `payment.received` / `member.join_*` / `trip.closed` / `trip.reminder_settle` (xem BR §11.5) |
| `actor_id` | UUID FK users.id | User thực hiện action (NULL nếu hệ thống/cron) |
| `title` | TEXT | VN string render sẵn — không i18n runtime |
| `data` | JSONB | `{count, target_ids, amount, from_name, to_name, group_name, trip_id, ...}` — dùng để dedup và deeplink |
| `read_at` | TIMESTAMPTZ? | Set khi user mark-as-read |

**RLS:**

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON notifications
  FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY notif_update_own ON notifications
  FOR UPDATE
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY notif_delete_own ON notifications
  FOR DELETE
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- INSERT: authenticated users (services validate authorization trước khi insert).
-- TODO Phase 4: chuyển sang Edge Function service-role và xoá policy này.
CREATE POLICY notif_insert_auth ON notifications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

**Storage estimate:** ~500 byte/row × 5 user/group × 10 events/day × 60 ngày = ~1.5MB/group active. Free tier 500MB → đủ ~300 group active đồng thời.

### 3.10b Table: `group_avatar_uploads` — Quota tracking cho avatar nhóm (BR-AVATAR-02)

Mỗi row = 1 lần upload avatar thành công. Dùng để query COUNT theo `(group_id, 7d)` và `(uploaded_by, 1d)` cho quota check trong Postgres function `commit_group_avatar`. Xem section 5.4 cho pipeline chi tiết.

```sql
CREATE TABLE group_avatar_uploads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_key    TEXT NOT NULL,             -- key trong R2: "groups/{groupId}/{ts}-{hash}.jpg"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gau_group_created
  ON group_avatar_uploads(group_id, created_at DESC);
CREATE INDEX idx_gau_user_created
  ON group_avatar_uploads(uploaded_by, created_at DESC);

ALTER TABLE group_avatar_uploads ENABLE ROW LEVEL SECURITY;
-- KHÔNG grant policy nào → chỉ service_role (Edge Function) ghi/đọc được.
```

| Field | Type | Mô tả |
|-------|------|-------|
| `group_id` | UUID FK | Nhóm được đổi avatar |
| `uploaded_by` | UUID FK users.id | Admin thực hiện upload |
| `file_key` | TEXT | Key R2 đã upload — dùng cho cron orphan cleanup (xem section 5.4) |

**Quota:** ghi nhận khi `commit_group_avatar` thành công (KHÔNG ghi cho `remove_group_avatar` — xóa không tính quota để admin có thể "rollback" mà không tốn slot). Xóa-rồi-upload-lại vẫn tính 1 slot upload mới.

**Cleanup quota table:** không cần TTL — bảng nhẹ (~50 byte/row × 3 row/group/tuần ≈ vô nghĩa cho free tier). Xóa cứng theo cascade khi group bị hard delete.

### 3.11 Indexes

```sql
-- Query theo group
CREATE INDEX idx_trips_group ON trips(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_trip ON expenses(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_group ON expenses(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_trip ON payments(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_audit_logs_group ON audit_logs(group_id);

-- Invite code lookup
CREATE UNIQUE INDEX idx_groups_invite ON groups(invite_code) WHERE deleted_at IS NULL;

-- Rate limiting (sliding-window COUNT) — composite (actor|group, created_at).
-- NON-partial (KHÔNG filter deleted_at) vì rate-limit đếm cả row đã soft-delete.
-- Cũng clear cảnh báo "unindexed foreign key" cho created_by/recorded_by.
CREATE INDEX idx_expenses_created_by_created_at  ON expenses(created_by, created_at);
CREATE INDEX idx_expenses_group_created_at       ON expenses(group_id, created_at);
CREATE INDEX idx_payments_recorded_by_created_at ON payments(recorded_by, created_at);
CREATE INDEX idx_trips_created_by_created_at     ON trips(created_by, created_at);
CREATE INDEX idx_groups_created_by_created_at    ON groups(created_by, created_at);
CREATE INDEX idx_group_members_group_joined_virtual
  ON group_members(group_id, joined_at) WHERE is_virtual = true;
```

---

## 4. Thuật toán quyết toán

### 4.1 Công thức tính số dư

```
balance[member] =
  Σ expense.amount (khoản chi member đã trả)
  - Σ split.amount (phần member phải chịu trong các khoản chi)
  + Σ payment.amount WHERE payment.to_member_id = member (đã nhận)
  - Σ payment.amount WHERE payment.from_member_id = member (đã trả đi)
```

**Quy ước dấu cho balance (toàn dự án — DB + UI):**
- `balance > 0` → member ĐƯỢC NỢ — UI hiển thị **`+`** + tone `success` (xanh) + label "được nhận".
- `balance < 0` → member ĐANG NỢ — UI hiển thị **`-`** + tone `danger` (đỏ) + label "cần trả".
- `balance = 0` → settled — UI ẩn dấu/badge hoặc hiện chữ "cân bằng".

Lý do: dấu phản ánh **góc nhìn của user** ("tôi nợ" = âm, "được nợ" = dương), không phải bookkeeping kế toán. Đảo lại sẽ gây hiểu nhầm khi user nhìn vào card/balance.

Triển khai UI: `<Money value={balance} showSign />` — pass **RAW signed balance**, KHÔNG `Math.abs`. [Money.tsx](src/components/ui/Money.tsx) tự gắn dấu đúng theo dấu của value. Pass `Math.abs(balance)` cùng `showSign` sẽ luôn ra `+` → SAI convention (bug đã có trong [GroupArcCard.tsx](src/components/home/GroupArcCard.tsx), [GroupRow.tsx](src/components/home/GroupRow.tsx) trước khi sửa 2026-05-14).

### 4.2 Thuật toán tối giản giao dịch (Greedy Simplification)

```
Input:  expenses[], payments[], members[]
Output: suggestedTransactions[]

1. Tính balance[] cho tất cả thành viên
2. Tách thành:
   - creditors[] (balance > 0 — đang được nợ)
   - debtors[]   (balance < 0 — đang nợ)
3. Sắp xếp giảm dần theo giá trị tuyệt đối
4. Lặp:
   a. Lấy debtor có |balance| lớn nhất
   b. Lấy creditor có balance lớn nhất
   c. amount = min(|debtor.balance|, creditor.balance)
   d. Tạo suggestedTransaction: debtor → creditor, amount
   e. Cập nhật balance cả 2
   f. Loại bỏ ai có balance = 0 (cho phép sai số ±1000đ)
5. Lặp đến khi tất cả balance ≈ 0
6. Lưu kết quả vào table settlements (DELETE + INSERT mỗi lần tính lại)
```

> **Nhắc lại:** Kết quả thuật toán là **GỢI Ý**, không phải lệnh. Số dư thực tế chỉ thay đổi khi có Payment được ghi nhận. Thuật toán chạy server-side qua Edge Function / VPS API `calculateSettlement` để đảm bảo nhất quán.

### 4.3 SQL View tính số dư

```sql
CREATE OR REPLACE VIEW member_balances AS
SELECT
  gm.id AS member_id,
  gm.group_id,
  e.trip_id,
  gm.display_name,
  -- Tổng đã trả cho khoản chi
  COALESCE(SUM(CASE WHEN gm.id = ANY(e.paid_by) THEN e.amount ELSE 0 END), 0)
  -- Trừ phần phải chịu
  - COALESCE(SUM(es.amount), 0)
  -- Cộng tiền đã nhận từ Payment
  + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.to_member_id = gm.id AND p.trip_id = e.trip_id AND p.deleted_at IS NULL), 0)
  -- Trừ tiền đã trả qua Payment
  - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.from_member_id = gm.id AND p.trip_id = e.trip_id AND p.deleted_at IS NULL), 0)
  AS balance
FROM group_members gm
LEFT JOIN expenses e ON e.group_id = gm.group_id AND e.deleted_at IS NULL
LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.member_id = gm.id
GROUP BY gm.id, gm.group_id, e.trip_id, gm.display_name;
```

### 4.4 Giải thích bước chia tiền (F-21 — Nice to have)

Tính năng cho phép người dùng xem **từng bước** thuật toán chia tiền, giúp hiểu rõ tại sao họ phải trả số tiền cụ thể.

#### Luồng hoạt động

1. User tạo expense → app chia tiền tự động
2. User nhấn "Xem chi tiết chia" trên khoản chi
3. App hiển thị:
   - **Bước 1:** Tổng X đồng ÷ N người = Y đồng/người
   - **Bước 2:** Làm tròn Y → Z đồng (bội 1.000đ)
   - **Bước 3:** Phần dư K đồng → gán cho người cuối
   - **Kiểm tra:** Z₁ + Z₂ + ... + Zₙ = X đồng ✓

#### Lưu trữ minh bạch

DB lưu cả 2 giá trị:
- `raw_amount`: số tiền gốc người dùng nhập
- `amount`: số tiền thực tế sau khi chia (đã round)

User có thể xem cả 2 để kiểm chứng tính minh bạch.

---

## 5. Backend API / Edge Functions

### 5.1 Supabase Edge Functions

| Function | Trigger | Mô tả | Phase |
|----------|---------|-------|-------|
| `group-avatar-presign` | HTTP POST (callable, JWT verify) | Verify admin role + soft quota check → trả presigned PUT URL R2 (TTL 60s, Content-Length signed). | V1 ✓ |
| `group-avatar-commit` | HTTP POST (callable, JWT verify) | HEAD R2 verify file (size/type) → `rpc('commit_group_avatar', ...)` atomic UPDATE+INSERT+audit → DELETE file R2 cũ best-effort. | V1 ✓ |
| `group-avatar-remove` | HTTP POST (callable, JWT verify) | `rpc('remove_group_avatar', ...)` set `avatar_url = NULL` → DELETE file R2 cũ. | V1 ✓ |
| `group-avatar-cleanup` | `pg_cron` weekly Sunday 03:00 ICT | LIST R2 prefix `groups/` → diff với `groups.avatar_url` + `group_avatar_uploads` < 24h → DELETE orphan. | V1 ✓ |
| `cron-settle-suggest` | `pg_cron` daily 09:00 ICT | Tính balance cho mỗi trip mở; nếu cặp (debtor, creditor) nợ > 200k VND > 3 ngày → INSERT `notifications.trip.reminder_settle` cho debtor (cooldown 7 ngày). | Phase 3 |
| `send-push` | AFTER INSERT trên `notifications` (qua `pg_net`) | Resolve user FCM token + check DND/preferences → gọi FCM HTTP v1. Skip nếu không có `fcm_token`. | Phase 4 |
| `cron-cleanup-notifications` | `pg_cron` daily 03:00 ICT | Xóa notif đã đọc > 30 ngày, chưa đọc > 60 ngày (đã tích hợp trực tiếp qua function `cleanup_notifications()` — không cần Edge Function). | V1 ✓ |
| `calculate-settlement` | HTTP POST (callable) | Tính toán và lưu kết quả thuật toán quyết toán vào table `settlements` | — |

> **V1 (in-app only):** không có Edge Function. `notification.service.ts` (`src/services/notification.service.ts`) gọi insert trực tiếp từ client với policy `notif_insert_auth` — services validate authorization (`assertRole`, ownership check) trước khi gọi.

### 5.1.1 In-app notification API (V1)

| Function | File | Trách nhiệm |
|----------|------|-------------|
| `createNotifications()` | `src/services/notification.service.ts` | Fan-out + dedup 10 phút (BR-NOTIF-05). Bọc try/catch im lặng — không block main flow |
| `getGroupRecipients()` | same | Resolve recipients qua `group_members` (lọc actor, virtual, left, opt-out setting) |
| `notifyExpenseEvent()` / `notifyPaymentRecorded()` / `notifyJoinRequested()` / `notifyJoinResolved()` / `notifyRoleChange()` / `notifyTripClosed()` | same | High-level helpers — gọi từ `trip.store.ts`, `group.service.ts` sau mỗi mutation |
| `fetchNotifications()` / `markAsRead()` / `markAllAsRead()` / `deleteNotification()` / `getUnreadCount()` | same | Reads cho UI |

### 5.2 VPS API (dự phòng / mở rộng)

Nếu cần xử lý logic nặng hoặc vượt free tier Supabase Edge Functions:

```
VPS (Node.js / Express hoặc Deno)
├── POST /api/settlement/:tripId    → Tính quyết toán
├── POST /api/notify/send           → Gửi FCM notification
├── CRON 20:00 daily                → Gửi nhắc nợ
└── WebSocket /ws/sync/:groupId     → Realtime sync (backup cho Supabase Realtime)
```

### 5.3 Cron Job nhắc nợ (pg_cron)

```sql
-- Supabase: Bật pg_cron extension
SELECT cron.schedule(
  'send-debt-reminders',
  '0 20 * * *', -- Mỗi ngày lúc 20:00 UTC+7
  $$
    SELECT net.http_post(
      url := 'https://<project>.supabase.co/functions/v1/send-debt-reminder',
      headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
    );
  $$
);
```

### 5.4 Group avatar pipeline — Cloudflare R2 + Edge Functions (F-29)

Tham chiếu nghiệp vụ: BR-AVATAR-01..04 trong `business-requirements.md` §8 + UC-04 §9.

#### 5.4.1 Vì sao chọn R2 thay vì Supabase Storage

| Tiêu chí | Cloudflare R2 (free) | Supabase Storage (free) |
|---|---|---|
| Storage | 10 GB | 1 GB |
| Egress (bandwidth ra) | **0₫ unlimited** | tính vào quota Supabase |
| Class A ops/tháng | 1M (PUT/DELETE/LIST) | tính chung Supabase |
| Class B ops/tháng | 10M (GET/HEAD) | — |
| Setup phức tạp | Custom domain + Sigv4 | Built-in |

R2 hấp dẫn vì egress free + 10× storage so Supabase. Trade-off: phải tự setup Sigv4 signing trong Edge Function.

#### 5.4.2 Architecture flow

```
[Client RN]                          [Edge Function]                [R2]                [DB]
  │                                          │                        │                   │
  │ 1. ImagePicker crop 1:1 → quality 1      │                        │                   │
  │ 2. Progressive compress 5 attempts        │                        │                   │
  │    (q=0.95 dim gốc → q=0.80 dim 512)     │                        │                   │
  │ 3. POST /group-avatar-presign             │                        │                   │
  │    { groupId, sizeBytes }                │                        │                   │
  │─────────────────────────────────────────▶│                        │                   │
  │                                          │ JWT → app_user_id       │                  │
  │                                          │ assertRole admin        │                  │
  │                                          │ check quota soft (3/7d, 20/1d) ────────────▶│
  │                                          │ Sigv4 PUT URL          │                   │
  │                                          │   Content-Length pinned ▶│                  │
  │ ◀─{ uploadUrl, fileKey, publicUrl }──────│                        │                   │
  │                                          │                        │                   │
  │ 4. PUT uploadUrl (ArrayBuffer body)──────────────────────────────▶│                   │
  │                                          │                        │                   │
  │ 5. POST /group-avatar-commit             │                        │                   │
  │    { groupId, fileKey }                  │                        │                   │
  │─────────────────────────────────────────▶│                        │                   │
  │                                          │ JWT → app_user_id      │                   │
  │                                          │ HEAD R2 verify────────▶│                   │
  │                                          │ size/type check; nếu fail: DELETE + 413/415│
  │                                          │ rpc('commit_group_avatar')──────────────────▶│
  │                                          │   ATOMIC: lock row, recheck quota,         │
  │                                          │   UPDATE groups, INSERT tracking, audit    │
  │                                          │   RETURN old_avatar_url                    │
  │                                          │ DELETE oldFileKey ────▶│                   │
  │ ◀─{ avatar_url }─────────────────────────│                        │                   │
```

#### 5.4.3 Postgres functions atomic

`commit_group_avatar(p_group_id, p_user_id, p_new_file_key, p_new_public_url, p_quota_per_group_per_week, p_quota_per_user_per_day)`:
- `SELECT ... FROM groups WHERE id = $1 FOR UPDATE` — chặn 2 device cùng admin race.
- Verify `group_members.role = 'admin' AND left_at IS NULL`. RAISE `NOT_ADMIN` nếu fail.
- COUNT `group_avatar_uploads` trong cửa sổ → nếu vượt → return `retry_after_seconds` (giây tới khi row cũ nhất rơi khỏi window).
- `UPDATE groups SET avatar_url = ...` + `INSERT INTO group_avatar_uploads(...)` + `INSERT INTO audit_logs (action='group.avatar_updated', ...)`.
- RETURN `(old_avatar_url, retry_after_seconds=0)`.
- `SECURITY DEFINER` + `REVOKE FROM PUBLIC` + `GRANT EXECUTE TO service_role` — chỉ Edge Function gọi được.

`remove_group_avatar(p_group_id, p_user_id)`:
- Cùng pattern lock + check role.
- Nếu `avatar_url IS NULL` → no-op return.
- `UPDATE groups SET avatar_url = NULL` + `INSERT audit_logs (action='group.avatar_removed', ...)`.
- KHÔNG ghi vào `group_avatar_uploads` (xóa không tính quota — xem BR-AVATAR-02).

#### 5.4.4 Sigv4 presign chi tiết

Edge Function dùng `aws4fetch` (Deno-compatible, 8KB) để ký URL với:
- `service: 's3', region: 'auto'` (R2 endpoint).
- Sign **header `Content-Length` + `Content-Type`** vào URL → R2 reject nếu client PUT body khác size đã sign.
- TTL 60s (`X-Amz-Expires=60`) — đủ cho upload 2MB trên 4G chậm, không quá lâu để bị abuse.

#### 5.4.5 Client-side image processing

Trong `src/utils/imageProcessing.ts` — quality-first progressive degradation, dừng ở attempt đầu tiên đạt ≤ 2 MB:

| Attempt | Dimension | JPEG quality | Use case |
|---|---|---|---|
| 1 | nguyên gốc | 0.95 | Ảnh < 4MP — gần lossless |
| 2 | nguyên gốc | 0.85 | Ảnh chi tiết cao |
| 3 | min(gốc, 2048) | 0.85 | DSLR/panorama lớn |
| 4 | min(gốc, 1024) | 0.85 | Bậc dự phòng |
| 5 | 512 | 0.80 | Last resort |

Cap dimension max 2048 vì avatar render max ~150px (header chi tiết nhóm, GroupCarousel home). Lớn hơn lãng phí storage R2.

**Lưu ý RN 0.83 + new architecture**: KHÔNG dùng `fetch(file://uri).blob()` (broken trên RN). Dùng `new File(uri).arrayBuffer()` từ `expo-file-system` rồi PUT body = ArrayBuffer. KHÔNG set header `Content-Length` thủ công — RN fetch tự set, conflict với value đã sign sẽ làm R2 reject.

#### 5.4.6 Bucket access — public domain qua Cloudflare CDN

R2 bucket bật public access qua custom domain (vd `https://avatars.fairpay.app`) — KHÔNG dùng presigned GET cho mỗi load avatar (sẽ tốn Class B ops + invocations Edge Function). App load trực tiếp `groups.avatar_url` qua `<Image source={{ uri }} />` → free egress + Cloudflare CDN cache.

Trade-off: avatar URL public, ai biết URL có thể view. Avatar nhóm không nhạy cảm → chấp nhận.

#### 5.4.7 Cron cleanup orphan

`group-avatar-cleanup` Edge Function chạy weekly (Sunday 03:00 ICT) qua `pg_cron`:
1. LIST R2 objects prefix `groups/` (paginated, cap 50 pages = 50K keys).
2. SELECT `avatar_url` từ `groups WHERE avatar_url IS NOT NULL` → set referenced keys.
3. SELECT `file_key` từ `group_avatar_uploads WHERE created_at > now() - 24h` → protect recent uploads (race window).
4. DELETE các R2 key không thuộc 2 set trên.

Lý do cần cron: trường hợp client presign nhưng KHÔNG commit (mất mạng giữa 2 step) → file R2 thành orphan. 24h buffer đảm bảo không xóa file đang in-flight.

```sql
SELECT cron.schedule(
  'cleanup-group-avatars-weekly',
  '0 20 * * 0', -- 20:00 UTC Saturday = 03:00 ICT Sunday
  $$
  SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/group-avatar-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

#### 5.4.8 Secrets quản lý

5 secret cần set qua Supabase Dashboard → Edge Functions → Secrets (KHÔNG bundle vào client):

| Secret | Source | Ghi chú |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare → R2 → S3 API URL | phần trước `.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 → Manage R2 API Tokens → Create | quyền Object Read & Write, scope 1 bucket |
| `R2_SECRET_ACCESS_KEY` | same | hiện 1 lần khi tạo, copy ngay |
| `R2_BUCKET_NAME` | tên bucket (vd `fairpay-group-avatars`) | |
| `R2_PUBLIC_BASE_URL` | r2.dev hoặc custom domain | dùng cho `getPublicUrl()` + `extractFileKey()` |

Client chỉ cần `EXPO_PUBLIC_R2_PUBLIC_BASE_URL` (= cùng giá trị `R2_PUBLIC_BASE_URL`) cho `extractFileKey()` ở `src/utils/r2.ts`.

#### 5.4.9 Cost projection (free tier 10GB / 1M Class A / 10M Class B)

| Metric | Tính | Ước tính 1000 DAU |
|---|---|---|
| Storage | ~5K avatar × 200KB | ~1 GB → **10%** free |
| Class A | 20 upload/user/ngày × 1K user × 30 ngày + delete cũ | ~1.2M → **vượt nhẹ** ở 1K DAU |
| Class B | 1K user × 50 nhóm × 30 ngày load | ~1.5M → **15%** free |
| Egress | unlimited free trên R2 | — |

Nếu Class A vượt: $4.50/triệu ops thêm. Tùy chọn giảm cost: hạ `GROUP_AVATAR_QUOTA_PER_USER_PER_DAY` từ 20 → 10.

---

## 6. Notifications & Push

Tham chiếu nghiệp vụ: `docs/business-requirements.md` §11.5 + §8 (BR-NOTIF-01..07).

### 6.1 Loại thông báo (11 types)

| Key | Setting gate | Scope | Phase |
|-----|--------------|-------|-------|
| `expense.created` | `notify_activity` | Group (trừ actor) | V1 ✓ |
| `expense.edited` | `notify_activity` | Group (trừ actor) | V1 (khi UI edit thêm) |
| `expense.deleted` | `notify_activity` | Group (trừ actor) | V1 ✓ |
| `payment.recorded` | `notify_payment` | Personal (from + to, trừ actor) | V1 ✓ |
| `payment.received` | `notify_payment` | Personal (to_member) | V1 ✓ |
| `member.join_requested` | `notify_member` | Personal (admin) | V1 ✓ |
| `member.join_approved` | `notify_member` | Personal (requester) | V1 ✓ |
| `member.join_rejected` | `notify_member` | Personal (requester) | V1 ✓ |
| `member.role_change` | `notify_member` | Personal (target) | V1 (khi Transfer Admin có UI) |
| `trip.closed` | `notify_activity` | Group (trừ actor) | V1 ✓ |
| `trip.reminder_settle` | `notify_smart` | Personal (debtor) | Phase 3 (cron) |

Mapping `type → setting key` được encode pure trong `src/utils/notificationFormat.ts:getSettingKeyForType()` — không hardcode trùng lặp ở UI hay service.

### 6.2 In-app fan-out (V1) — service-layer pattern

KHÔNG dùng Postgres trigger. Mỗi service mutation sau khi action OK gọi `createNotifications()` song song với `logAction()`:

```typescript
// src/stores/trip.store.ts (excerpt)
const profile = useAuthStore.getState().profile;
await Promise.all([
  logAction({ groupId, tripId, action: 'expense.create', targetId: result.id, afterData: {...} }),
  profile && notifyExpenseEvent('expense.created', {
    groupId, tripId,
    actorId: profile.id, actorName: profile.display_name,
    expenseId: result.id, expenseTitle: title, amount,
  }),
]);
```

`createNotifications()` flow:
1. Compute dedup key `(user_id, group_id, type, actor_id)` cho từng recipient.
2. Query notif chưa đọc match dedup key trong 10 phút qua (`NOTIF_DEDUP_WINDOW_MS`).
3. Recipient đã có row → UPDATE (gộp `count`, push `target_ids`, refresh `created_at`).
4. Recipient chưa có row → INSERT row mới.
5. Bọc try/catch im lặng (giống `logAction`) — fail không break main flow.

### 6.3 Realtime subscription (V2 — Phase 3)

```typescript
// Pseudo-code, src/stores/notification.store.ts (Phase 3)
const channel = supabase
  .channel(`notifications:user_id=eq.${myUserId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myUserId}` },
    (payload) => {
      get().addItem(payload.new);
      get().refreshUnreadCount();
    })
  .subscribe();
```

- Subscribe khi app foreground, unsubscribe khi background (`AppState.addEventListener`).
- Free tier 200 concurrent → đủ ~200 user online đồng thời.
- V1 dùng pull-on-focus (`useFocusEffect` ở home screen) — đơn giản, đủ tốt.

### 6.4 Push FCM (V3 — Phase 4)

Postgres trigger AFTER INSERT trên `notifications` → gọi `pg_net` → Edge Function `send-push`:

```sql
CREATE OR REPLACE FUNCTION trigger_send_push() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Skip nếu user không có fcm_token (tránh tốn invocation)
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND fcm_token IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id', NEW.id),
    headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
  );
  RETURN NEW;
END $$;

CREATE TRIGGER notif_send_push
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION trigger_send_push();
```

Edge Function `send-push`:
- Fetch `notification` + `user (fcm_token, settings)`.
- Check DND (Phase 4 settings: `dnd_enabled`, `dnd_start`, `dnd_end`).
- Build FCM payload: `{ title, body, data: { deeplink, notification_id } }`.
- Gửi qua FCM HTTP v1.

**Free tier guard:** 500k invocations/tháng → ~16k/day. Group ~5 user × ~10 events/day × 300 group = 15k/day OK. Trigger skip nếu không có fcm_token (giảm ~50% invocation cho user chưa cài app/từ chối push).

### 6.5 Smart features

**6.5.1 Dedup 10 phút (V1 ✓):** logic trong `createNotifications()`. Cùng `(user, group, type, actor)` chưa đọc → UPDATE thay vì INSERT mới. Title chuyển sang "{Actor} đã thêm 5 khoản chi" (đếm từ `data.count`).

**6.5.2 Settle suggest (Phase 3):** Edge Function `cron-settle-suggest` chạy daily 09:00 ICT, threshold `SETTLE_SUGGEST_MIN_AMOUNT=200_000`, age `SETTLE_SUGGEST_AGE_DAYS=3`, cooldown `SETTLE_SUGGEST_COOLDOWN_DAYS=7` (xem `src/config/constants.ts`).

### 6.6 Roadmap phases

| Phase | Scope | Files chính |
|-------|-------|-------------|
| **V1 ✓** | DB + service-layer + UI screen + filter + bell badge + 4 toggle settings + pull-on-focus | `src/services/notification.service.ts`, `src/stores/notification.store.ts`, `src/app/(main)/notifications.tsx`, `src/components/notifications/*`, `src/app/(main)/settings.tsx` |
| **V2 / Phase 3** | Supabase realtime channel, per-group mute (`group_members.notification_enabled`), Edge Function cron settle suggest | `notification.store.ts` (subscribe), migration cho `group_members`, `supabase/functions/cron-settle-suggest` |
| **V3 / Phase 4** | `expo-notifications` + FCM, Edge Function `send-push`, Postgres trigger, DND time picker | `src/services/push.service.ts`, `supabase/functions/send-push`, migration trigger, `app.json` config |

### 6.7 Cấu hình FCM trong Expo (Phase 4)

```json
// app.json
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      "expo-notifications"
    ],
    "android": { "googleServicesFile": "./google-services.json" }
  }
}
```

> **Lưu ý:** FCM vẫn dùng Firebase (free, không giới hạn) chỉ cho push notification. Toàn bộ backend in-app dùng Supabase.

---

## 7. Dark Mode

### 7.1 Cách hoạt động

HeroUI Native hỗ trợ dark mode thông qua provider config. Styling dùng Uniwind (Tailwind v4 cho React Native).

```tsx
// App.tsx — Detect và apply system color scheme
import { useColorScheme } from 'react-native';
import { HeroUIProvider } from 'heroui-native';

export default function App() {
  const colorScheme = useColorScheme(); // 'light' | 'dark'
  return (
    <HeroUIProvider colorMode={colorScheme}>
      {/* App content */}
    </HeroUIProvider>
  );
}
```

### 7.2 Design Tokens

| Token | Light mode | Dark mode | Dùng cho |
|-------|-----------|-----------|---------|
| `background` | `#FFFFFF` | `#0F172A` | Nền màn hình |
| `surface` | `#F8FAFC` | `#1E293B` | Card, surface |
| `surface-2` | `#F1F5F9` | `#334155` | Input, hover state |
| `foreground` | `#1A252F` | `#F1F5F9` | Nội dung chính |
| `foreground-secondary` | `#64748B` | `#94A3B8` | Nhãn phụ |
| `primary` | `#1D6FA8` | `#38BDF8` | CTA, link, active |
| `success` | `#16A34A` | `#4ADE80` | Số dư dương |
| `danger` | `#DC2626` | `#F87171` | Số dư âm |
| `divider` | `#E2E8F0` | `#334155` | Divider, viền card |
| `warning` | `#D97706` | `#FCD34D` | Cảnh báo xung đột sync |

---

## 8. Xử lý xung đột (Conflict Resolution)

| Tình huống | Chiến lược | Chi tiết |
|-----------|-----------|---------|
| 2 người thêm khoản chi cùng lúc | **Không conflict** | Mỗi expense là row riêng với UUID. Cả 2 đều được INSERT thành công. |
| 2 người sửa cùng 1 khoản chi | **Optimistic lock + version field** | Mỗi row có column `version`. UPDATE chỉ thành công khi `WHERE version = expected_version`. Nếu thất bại → reload row, hiện diff cho user chọn. |
| Sửa khoản chi khi offline, server đã có thay đổi | **Server-wins với thông báo** | Khi sync queue xử lý pending UPDATE, nếu version mismatch → server version thắng, app thông báo: "Khoản chi này đã được cập nhật bởi [tên]. Thay đổi của bạn đã bị hủy." |
| Xóa khoản chi trong khi người khác đang xem | **Soft delete + Realtime thông báo** | Row được set `deleted_at`. Supabase Realtime broadcast UPDATE → client ẩn row và hiện thông báo "Khoản chi đã bị xóa bởi [tên]". |

### Optimistic Lock Implementation

```sql
-- UPDATE chỉ thành công nếu version khớp
UPDATE expenses
SET title = $1, amount = $2, version = version + 1
WHERE id = $3 AND version = $4 AND deleted_at IS NULL
RETURNING *;
-- Nếu RETURNING rỗng → conflict detected
```

---

## 9. Supabase Row Level Security (RLS)

```sql
-- Bật RLS cho tất cả tables
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- Helper functions
-- ══════════════════════════════════════════════

-- Lấy user internal ID từ Supabase Auth UID
CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Kiểm tra user có phải member của group không
CREATE OR REPLACE FUNCTION is_member(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = auth_user_id()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Kiểm tra user có phải admin của group không
CREATE OR REPLACE FUNCTION is_admin(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth_user_id()
      AND role = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════
-- Groups policies
-- ══════════════════════════════════════════════
CREATE POLICY "Members can view their groups"
  ON groups FOR SELECT USING (is_member(id));

CREATE POLICY "Authenticated users can create groups"
  ON groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update groups"
  ON groups FOR UPDATE USING (is_admin(id));

-- ══════════════════════════════════════════════
-- Group Members policies
-- ══════════════════════════════════════════════
CREATE POLICY "Members can view group members"
  ON group_members FOR SELECT USING (is_member(group_id));

CREATE POLICY "Admins can manage members"
  ON group_members FOR ALL USING (is_admin(group_id));

-- ══════════════════════════════════════════════
-- Trips policies
-- ══════════════════════════════════════════════
CREATE POLICY "Members can view trips"
  ON trips FOR SELECT USING (is_member(group_id));

-- Mọi member tạo được trip (đổi từ is_admin → is_member, migration 20260604140000).
-- Quản lý trip (UPDATE: đổi tên/đóng/mở) vẫn chỉ admin.
CREATE POLICY "Members can create trips"
  ON trips FOR INSERT WITH CHECK (is_member(group_id));

CREATE POLICY "Admins can update trips"
  ON trips FOR UPDATE USING (is_admin(group_id));
-- DELETE: disabled, soft delete only via UPDATE

-- ══════════════════════════════════════════════
-- Expenses policies
-- ══════════════════════════════════════════════
CREATE POLICY "Members can view expenses"
  ON expenses FOR SELECT USING (is_member(group_id));

CREATE POLICY "Members can create expenses"
  ON expenses FOR INSERT WITH CHECK (is_member(group_id));

CREATE POLICY "Creator or admin can update expenses"
  ON expenses FOR UPDATE USING (
    created_by = auth_user_id() OR is_admin(group_id)
  );
-- DELETE: disabled, soft delete only via UPDATE

-- ══════════════════════════════════════════════
-- Payments policies
-- ══════════════════════════════════════════════
CREATE POLICY "Members can view payments"
  ON payments FOR SELECT USING (is_member(group_id));

CREATE POLICY "Members can create payments"
  ON payments FOR INSERT WITH CHECK (is_member(group_id));

CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE USING (is_admin(group_id));
-- DELETE: disabled, soft delete only via UPDATE

-- ══════════════════════════════════════════════
-- Notifications policies (per-user fan-out)
-- ══════════════════════════════════════════════
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON notifications
  FOR SELECT USING (user_id = auth_user_id());

CREATE POLICY notif_update_own ON notifications
  FOR UPDATE USING (user_id = auth_user_id())
  WITH CHECK (user_id = auth_user_id());

CREATE POLICY notif_delete_own ON notifications
  FOR DELETE USING (user_id = auth_user_id());

-- INSERT: authenticated users (services validate authorization).
-- Phase 4 sẽ chuyển sang Edge Function service-role và xoá policy này.
CREATE POLICY notif_insert_auth ON notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

> ⚠️ **Đã siết ở migration `20260604120000_security_hardening_release`**: policy
> `notif_insert_auth` ở trên ĐÃ BỎ (client không insert noti trực tiếp — chỉ qua RPC
> definer; policy cũ cho phép spoof recipient/actor → phishing). Tương tự, INSERT
> `audit_logs` siết về `actor_id = auth_user_id()`. Khối SQL trên giữ lại để truy vết lịch sử.

### 9.10 Rate limiting & chống abuse (migration `20260604130000_rate_limit_triggers`)

Vì anon key nằm trong APK, attacker/account bị chiếm có thể gọi DB trực tiếp bằng JWT hợp
lệ (bỏ qua code RN). RLS chỉ chặn "ai được ghi", KHÔNG chặn "ghi bao nhiêu lần". Giải pháp:
**BEFORE INSERT trigger** trên 5 bảng domain — choke point thật, fire bất kể insert qua RPC
hay trực tiếp.

- **Thuật toán**: sliding window — `COUNT(*) WHERE actor|group = X AND ts > now() - interval`.
  Đếm **CẢ row đã soft-delete** → chặn bypass create→delete→create. Hàm `SECURITY DEFINER`
  + `search_path` để COUNT bypass RLS, đếm chính xác toàn nhóm.
- **Ngưỡng** (hào phóng — không phạt oan batch offline): expenses 300/user/1h + 500/group/1h;
  payments 200/user/1h; trips 60/user/1d; groups 30/user/1d; group_members ảo 100/group/1d.
- **Errcode `P0429`** (`rate_limit_exceeded`) → client: queue retry fixed-backoff 30' KHÔNG
  dead-letter (§2.3); UI toast tiếng Việt (`src/utils/error.ts`).
- **Spoof guard** (đính kèm): trigger RAISE `42501` (`actor_spoof`) nếu `created_by`/
  `recorded_by` ≠ `auth_user_id()`, CHỈ khi `auth_user_id()` IS NOT NULL (miễn trừ
  service_role). Đóng lỗ hổng RLS INSERT expenses/payments không ép actor = người gọi.
- **Auth (login/signup/reset/OTP)**: KHÔNG ở Postgres — cấu hình Supabase Dashboard → Auth
  → Rate Limits + Captcha.

---

## 10. Yêu cầu phi chức năng

| Loại | Yêu cầu | Chỉ số |
|------|---------|--------|
| Hiệu năng | Cold start time | < 2 giây |
| Hiệu năng | Sync latency khi online | < 500ms để thấy update từ người khác |
| Hiệu năng | Tính toán số dư | < 200ms cho chuyến 20 người, 200 khoản chi |
| Offline | Core features hoạt động offline | 100% — xem, thêm chi, ghi nhận thanh toán |
| Bảo mật | Authentication | Supabase Auth (JWT), token refresh tự động |
| Bảo mật | Authorization | Supabase RLS kiểm tra role trước mọi thao tác |
| Bảo mật | Data isolation | User chỉ đọc được group mà họ là thành viên |
| Tương thích | Android version tối thiểu | Android 8.0 (API 26) |
| Dark mode | Theo system preference | Tự động, không cần set thủ công |
| Dung lượng | APK size | < 30MB (nhẹ hơn nhờ bỏ Firebase SDK nặng) |

---

## 11. Thiết kế UI/UX

### 11.1 Design Principles

1. **Tối giản** — mỗi màn hình làm một việc duy nhất
2. **Tiếng Việt hoàn toàn** — không có từ tiếng Anh trên UI người dùng
3. **Phản hồi tức thì** — optimistic UI update, không chờ server confirm
4. **Dark mode first** — thiết kế dark mode cùng lúc với light mode, không phải sau
5. **Rõ ràng về trạng thái** — luôn hiển thị: đang online/offline, đang sync, sync thành công

### 11.2 Export ảnh — Lưu về máy

App dùng `react-native-view-shot` để chụp component kết quả chuyến thành ảnh. Ảnh được lưu về thư viện ảnh của thiết bị ngay lập tức qua `expo-media-library`. Không upload lên server.

```tsx
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

const exportToImage = async (viewRef: React.RefObject<View>) => {
  const uri = await captureRef(viewRef, { format: 'png', quality: 1 });
  await MediaLibrary.saveToLibraryAsync(uri);
  // Hiện toast: "Đã lưu ảnh vào thư viện"
};
```

### 11.3 Wireframe — Trang Thông báo (`(main)/notifications.tsx`)

```
┌──────────────────────────────────────────────┐
│  ←  Thông báo                  [Đọc tất cả] │  ← header (action chỉ hiện khi unread > 0)
├──────────────────────────────────────────────┤
│  [Tất cả] [Chưa đọc] [Theo nhóm]            │  ← ChipPicker filter
│  • Phượt Đà Nẵng                  Bỏ lọc    │  ← scope row (chỉ khi đã chọn group)
├──────────────────────────────────────────────┤
│  HÔM NAY                                     │  ← section header
│  ┌──────────────────────────────────────┐   │
│  │ [👤]🧾  Nam đã thêm khoản chi …  ●   │   │  ← unread: bg surface, dot primary
│  │         Phượt · 3 phút trước          │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │ [👤]💳  An đã trả bạn 200.000đ        │   │  ← read: bg background, no dot
│  │         Phượt · 1 giờ trước          │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  HÔM QUA                                     │
│  ┌──────────────────────────────────────┐   │
│  │ [👤]✏️  Lan đã sửa khoản chi Cà phê   │   │
│  │         Bữa trưa · hôm qua           │   │
│  └──────────────────────────────────────┘   │
│  …                                           │
└──────────────────────────────────────────────┘

Per-row swipe trái → nút [🗑 Xóa] (đỏ) → DELETE row.
Tap row → mark-as-read (optimistic) + router.push deeplink theo data.trip_id.
```

**States:**
- **Loading lần đầu** (`isRefreshing && items.length === 0`): `ListSkeleton count={8}`.
- **Empty:** `EmptyState title="Chưa có thông báo nào" subtitle="Hoạt động trong nhóm sẽ xuất hiện ở đây."`.
- **Pull-to-refresh:** `RefreshControl` reload page 1.
- **Infinite scroll:** `onEndReached` → `loadMore()` (cursor `created_at`, page size 30).

**Bell icon (`NotificationBell.tsx`):**
- Icon Bell từ lucide, badge tròn đỏ overlay góc trên-phải, max "9+".
- Trong `headerRight` của route `index` (home) — bên cạnh Avatar, dùng `flexDirection: 'row'`.
- `useFocusEffect` ở home → gọi `refreshUnreadCount()` mỗi lần screen focus (polling on focus, không setInterval).

**Settings (`settings.tsx` → section "THÔNG BÁO"):** 4 `SettingRow` toggle cho 4 nhóm setting (`notify_activity`, `notify_payment`, `notify_member`, `notify_smart`). Tắt → server skip insert recipient (recipient resolver filter ở `getGroupRecipients()` + per-helper).

### 11.4 Trạng thái Sync — Visual Indicator

| Trạng thái | Indicator | Mô tả |
|-----------|-----------|-------|
| Online, synced | Không có indicator (default) | Trạng thái bình thường, không làm phiền user |
| Offline | Badge nhỏ góc trên: "Ngoại tuyến" | Màu warning, không cản trở thao tác |
| Đang sync | Spinner nhỏ bên cạnh tên chuyến | Khi sync queue đang xử lý pending changes |
| Sync conflict | Banner warning trong màn hình | "Có thay đổi mới từ [tên người]. Dữ liệu của bạn đã được cập nhật." |
| Sync lỗi | Snackbar đỏ | "Không thể đồng bộ. Kiểm tra kết nối mạng." |

### 11.5 Design Tokens & Theme

Hệ thống màu sắc tập trung tại `src/config/theme.ts`. Mọi screen và component truy cập qua hook `useAppTheme()` — **không hardcode hex**.

| Token | Light | Dark | Công dụng |
|-------|-------|------|-----------|
| `background` | `#FFFFFF` | `#0F172A` | Nền chính |
| `surface` | `#F8FAFC` | `#1E293B` | Nền card, form |
| `surfaceAlt` | `#F0F9FF` | `#1E293B` | Nền summary banner |
| `foreground` | `#1A252F` | `#F1F5F9` | Text chính |
| `muted` | `#64748B` | `#94A3B8` | Text phụ, placeholder |
| `primary` | `#1D6FA8` | `#38BDF8` | Accent chính |
| `success` | `#16A34A` | `#4ADE80` | Được nợ, thành công |
| `danger` | `#DC2626` | `#F87171` | Đang nợ, lỗi |
| `warning` | `#D97706` | `#FCD34D` | Cảnh báo, offline |
| `divider` | `#E2E8F0` | `#334155` | Đường kẻ, border |
| `successSoft` | `#DCFCE7` | `#14532D` | Badge nền xanh nhạt |
| `dangerSoft` | `#FFE4E6` | `#4C0519` | Badge nền đỏ nhạt |
| `accentSoft` | `#EFF6FF` | `#1E3A5F` | Banner nền xanh nhạt |

```tsx
// Cách dùng trong mọi screen/component:
import { useAppTheme } from '../hooks/useAppTheme';

const c = useAppTheme();
// c.background, c.surface, c.foreground, c.muted, c.primary, ...
```

**Quy tắc:** Không dùng `isDark ? '#hex' : '#hex'` trong screen files. Tất cả ternary màu phải qua theme tokens.

### 11.5 Component Library

Shared components tại `src/components/ui/`. Ưu tiên dùng component có sẵn, không tạo pattern inline.

| Component | File | Props chính | Thay thế cho |
|-----------|------|-------------|-------------|
| `AppTextField` | `ui/AppTextField.tsx` | `placeholder, value, onChangeText, error?, secureTextEntry?` | Raw `<TextInput>` |
| `AppCard` | `ui/AppCard.tsx` | `title, subtitle?, onPress?, trailing?, borderLeft?` | Card row pattern |
| `ChipPicker` | `ui/ChipPicker.tsx` | `options: {key, label}[], selected, onSelect, activeColor?` | Chip selector rows |
| `SectionTabs` | `ui/SectionTabs.tsx` | `items: {key, label, badge?, hidden?}[], selected, onSelect` | Custom tab bars |
| `FormReveal` | `ui/FormReveal.tsx` | `isOpen, children` | `{show && <View>...}` pattern |
| `EmptyState` | `ui/EmptyState.tsx` | `title, subtitle?, icon?, action?` | Empty list text |
| `SettingRow` | `ui/SettingRow.tsx` | `label, hint?, value, onValueChange` | Switch setting rows |
| `AnimatedEntrance` | `ui/AnimatedEntrance.tsx` | `children, delay?, direction?` | Staggered entrance |
| `ListSkeleton` | `ui/ListSkeleton.tsx` | `count?` | Loading placeholder |

HeroUI Native components dùng trực tiếp: `Button`, `Skeleton`, `TextField`, `Input`, `Label`, `FieldError`.

### 11.6 Typography

| Thuộc tính | Giá trị |
|-----------|---------|
| Font family | **Be Vietnam Pro** (Google Font, thiết kế cho tiếng Việt) |
| Package | `@expo-google-fonts/be-vietnam-pro` |
| Weights loaded | 400 Regular, 500 Medium, 600 SemiBold, 700 Bold |
| Config file | `src/config/fonts.ts` |

```tsx
// Mapping fontWeight → fontFamily:
import { fonts } from '../config/fonts';

// fonts.regular  = 'BeVietnamPro_400Regular'   → body text
// fonts.medium   = 'BeVietnamPro_500Medium'     → labels, card titles
// fonts.semibold = 'BeVietnamPro_600SemiBold'   → headings, section titles
// fonts.bold     = 'BeVietnamPro_700Bold'       → amounts, emphasis
```

Font được load trong `src/app/_layout.tsx` qua `useFonts()`. App hiển thị `LoadingScreen` cho đến khi font sẵn sàng.

### 11.7 Iconography

| Thuộc tính | Giá trị |
|-----------|---------|
| Library | `lucide-react-native` |
| Style | Stroke-based, nhất quán |
| Tree-shaking | Có — chỉ bundle icon import |

**Quy ước kích thước:**

| Context | Size | Ví dụ |
|---------|------|-------|
| Button inline | 18-20px | `LogOut` trong nút đăng xuất |
| Tab bar | System default | `Users`, `Settings` |
| Empty state | 48px | `Receipt`, `MapPin`, `Clock` |

**Mapping feature → icon:**

| Feature | Icon |
|---------|------|
| Tab Nhóm | `Users` |
| Tab Cài đặt | `Settings` |
| Empty nhóm | `Users` |
| Empty chuyến đi | `MapPin` |
| Empty khoản chi | `Receipt` |
| Empty số dư | `Scale` |
| Empty thanh toán | `Wallet` |
| Empty lịch sử | `Clock` |
| Đăng xuất | `LogOut` |

### 11.8 Animation Guidelines

| Thuộc tính | Giá trị |
|-----------|---------|
| Library | `react-native-reanimated` v4.2.1 |
| Babel plugin | `react-native-reanimated/plugin` (cuối cùng trong plugins) |

**Patterns:**

| Pattern | Cách dùng | Duration |
|---------|-----------|----------|
| Staggered entrance | `<AnimatedEntrance delay={index * 50}>` (max 500ms) | 350ms + spring |
| Form reveal | `FormReveal` tự động: `FadeInDown` entering, `FadeOutUp` exiting | 250ms / 200ms |
| Auth screens | Cascade: title→subtitle→fields→button (0→80→150→220→290→360ms) | 350ms mỗi element |

**Quy tắc:**
- Mọi animation dùng `springify()` cho cảm giác tự nhiên
- Cap stagger delay ở 500ms để không chậm scroll
- Tôn trọng Reduce Motion setting (Reanimated tự xử lý)

### 11.9 Accessibility Standards

**Checklist bắt buộc cho mọi interactive element:**

| Thuộc tính | Khi nào dùng | Ví dụ |
|-----------|-------------|-------|
| `accessibilityRole` | Mọi Pressable, Button | `"button"`, `"radio"`, `"alert"` |
| `accessibilityLabel` | Mọi element cần mô tả | `"Đổi tên hiển thị"` |
| `accessibilityState` | Chip/radio selection | `{ selected: true }` |
| `accessibilityLiveRegion` | Alert/banner | `"polite"` |
| `hitSlop` | Pressable < 44pt | `{ top: 8, bottom: 8, left: 8, right: 8 }` |

**Touch target:** Tối thiểu 44pt. Dùng `hitSlop` nếu visual size nhỏ hơn.

**Screen reader testing:** Bật TalkBack trên Android emulator, navigate toàn bộ app, đảm bảo mọi action đọc được.

---

## 12. Tài liệu tham khảo

| Tài liệu | URL |
|-----------|-----|
| React Native + Expo | https://docs.expo.dev |
| HeroUI Native | https://heroui.com/docs/native/getting-started |
| HeroUI Native Components | https://heroui.com/docs/native/components |
| Supabase Docs | https://supabase.com/docs |
| Supabase Auth | https://supabase.com/docs/guides/auth |
| Supabase Realtime | https://supabase.com/docs/guides/realtime |
| Supabase RLS | https://supabase.com/docs/guides/auth/row-level-security |
| Supabase Edge Functions | https://supabase.com/docs/guides/functions |
| Firebase Cloud Messaging (Android) | https://firebase.google.com/docs/cloud-messaging/android/client |
| expo-sqlite | https://docs.expo.dev/versions/latest/sdk/sqlite/ |
| CH Play Developer Policy | https://play.google.com/about/developer-content-policy |

---

*Fair Pay v2.0 Project Spec — Tài liệu kỹ thuật — Cập nhật tháng 4/2026*
