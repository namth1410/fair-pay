# SplitVN — Tài Liệu Đặc Tả Kỹ Thuật

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
  settings JSONB DEFAULT '{"dark_mode": "system", "notify_expense": true, "notify_reminder": true}',
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
| `settings` | JSONB | `{dark_mode, notify_expense, notify_reminder}` |
| `created_at` | TIMESTAMPTZ | Ngày tạo |

### 3.2 Table: `groups`

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
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
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
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
  reviewed_by UUID REFERENCES users(id), -- Owner/Admin đã duyệt
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(group_id, user_id, status) -- Mỗi user chỉ có 1 pending request / group
);
```

> **Luồng:** User nhập mã mời → INSERT `join_requests` (pending) → Owner/Admin nhận notification → approve → INSERT `group_members` + UPDATE status = approved. Reject → UPDATE status = rejected.

### 3.4b Table: `group_invitations` (BR-11) — Lời mời qua email

```sql
CREATE TABLE group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  invited_user_id UUID NOT NULL REFERENCES users(id),
  invited_by UUID NOT NULL REFERENCES users(id), -- Owner/Admin gửi lời mời
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(group_id, invited_user_id, status)
);
```

> **Luồng:** Owner/Admin tìm user theo email → INSERT `group_invitations` (pending) → user nhận notification → accept = INSERT `group_members`, decline = UPDATE status.

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
  deleted_at TIMESTAMPTZ -- Soft delete, chỉ Admin/Owner
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

### 3.10 Indexes

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

| Function | Trigger | Mô tả |
|----------|---------|-------|
| `on-expense-created` | Database Webhook (INSERT on expenses) | Gửi FCM notification đến tất cả thành viên trong chuyến (trừ người tạo) |
| `on-payment-recorded` | Database Webhook (INSERT on payments) | Gửi FCM đến người nhận tiền: "X xác nhận đã chuyển tiền Z cho bạn" |
| `on-member-invited` | Database Webhook (INSERT on group_members) | Gửi notification đến người được mời |
| `calculate-settlement` | HTTP POST (callable) | Tính toán và lưu kết quả thuật toán quyết toán vào table `settlements` |
| `send-debt-reminder` | Supabase Cron (`pg_cron`) hoặc VPS cron | Mỗi tối 20h: gửi nhắc nhở cho người có số dư âm trong chuyến đang mở |

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

---

## 6. FCM — Push Notification

### 6.1 Các loại notification

| Loại | Trigger | Nội dung thông báo | Có thể tắt? |
|------|---------|-------------------|-------------|
| Khoản chi mới | Expense được thêm vào trip | "[Tên người] vừa thêm [Tên khoản chi] — [số tiền]" | Có |
| Thanh toán mới | Payment được ghi nhận, gửi đến người nhận | "[Tên người] vừa ghi nhận đã trả bạn [số tiền]" | Không |
| Nhắc nợ | Cron hàng ngày, gửi đến người có số dư âm | "Bạn đang nợ [tổng] trong [N] chuyến. Nhấn để xem chi tiết" | Có |
| Thành viên mới | User mới join group | "[Tên người] vừa tham gia nhóm [tên nhóm]" | Có |
| Chuyến bị đóng | Trip chuyển sang closed | "Chuyến [tên] đã được đóng bởi [tên người]" | Có |

### 6.2 Gửi FCM từ Edge Function

```typescript
// supabase/functions/on-expense-created/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const { record } = await req.json(); // expense record from webhook

  // Lấy FCM tokens của các thành viên trong trip (trừ người tạo)
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, users(fcm_token, settings)')
    .eq('group_id', record.group_id)
    .neq('user_id', record.created_by);

  // Gửi FCM qua Firebase Admin SDK hoặc HTTP v1 API
  const tokens = members
    .filter(m => m.users?.fcm_token && m.users?.settings?.notify_expense)
    .map(m => m.users.fcm_token);

  await sendFCMMulticast(tokens, {
    title: 'Khoản chi mới',
    body: `${record.created_by_name} vừa thêm ${record.title} — ${formatVND(record.amount)}`,
  });
});
```

### 6.3 Cấu hình FCM trong Expo

```json
// app.json
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/messaging"
    ],
    "android": {
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

> **Lưu ý:** FCM vẫn dùng Firebase (free, không giới hạn) chỉ cho push notification. Toàn bộ backend còn lại dùng Supabase/VPS.

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

-- Kiểm tra user có phải admin/owner của group không
CREATE OR REPLACE FUNCTION is_admin(p_group_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth_user_id()
      AND role IN ('owner', 'admin')
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

CREATE POLICY "Admins can create trips"
  ON trips FOR INSERT WITH CHECK (is_admin(group_id));

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
```

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

### 11.3 Trạng thái Sync — Visual Indicator

| Trạng thái | Indicator | Mô tả |
|-----------|-----------|-------|
| Online, synced | Không có indicator (default) | Trạng thái bình thường, không làm phiền user |
| Offline | Badge nhỏ góc trên: "Ngoại tuyến" | Màu warning, không cản trở thao tác |
| Đang sync | Spinner nhỏ bên cạnh tên chuyến | Khi sync queue đang xử lý pending changes |
| Sync conflict | Banner warning trong màn hình | "Có thay đổi mới từ [tên người]. Dữ liệu của bạn đã được cập nhật." |
| Sync lỗi | Snackbar đỏ | "Không thể đồng bộ. Kiểm tra kết nối mạng." |

### 11.4 Design Tokens & Theme

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

*SplitVN v2.0 Project Spec — Tài liệu kỹ thuật — Cập nhật tháng 4/2026*
