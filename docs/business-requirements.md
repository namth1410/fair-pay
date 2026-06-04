# Fair Pay — Tài Liệu Nghiệp Vụ

> **Phiên bản:** 2.0 — Draft  
> **Ngày cập nhật:** Tháng 4, 2026  
> **Nền tảng:** Android — CH Play  

---

## Mục lục

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Đối tượng người dùng](#2-đối-tượng-người-dùng)
3. [Phạm vi dự án](#3-phạm-vi-dự-án)
4. [Mục tiêu kinh doanh](#4-mục-tiêu-kinh-doanh)
5. [Mô hình dữ liệu nghiệp vụ](#5-mô-hình-dữ-liệu-nghiệp-vụ)
6. [Nghiệp vụ thanh toán thực tế](#6-nghiệp-vụ-thanh-toán-thực-tế)
7. [Phân quyền trong nhóm](#7-phân-quyền-trong-nhóm)
8. [Business Rules](#8-business-rules)
9. [Use Cases](#9-use-cases)
10. [Danh sách chức năng](#10-danh-sách-chức-năng)
11. [Màn hình chính](#11-màn-hình-chính)
12. [Kế hoạch phát triển](#12-kế-hoạch-phát-triển)
13. [Rủi ro và giảm thiểu](#13-rủi-ro-và-giảm-thiểu)
14. [Kế hoạch kiểm thử](#14-kế-hoạch-kiểm-thử)
15. [Thuật ngữ](#15-thuật-ngữ)

---

## 1. Tổng quan dự án

### 1.1 Giới thiệu

**Fair Pay** là ứng dụng di động giúp nhóm bạn bè, gia đình, đồng nghiệp dễ dàng ghi lại và chia sẻ chi phí trong các chuyến đi, bữa ăn, hoặc bất kỳ hoạt động nhóm nào. Ứng dụng hoạt động theo mô hình **offline-first** — người dùng có thể dùng ngay không cần mạng, dữ liệu sẽ tự đồng bộ lên server khi có kết nối để cả nhóm cùng xem được.

### 1.2 Vấn đề cần giải quyết

| # | Vấn đề |
|---|--------|
| 1 | Khó theo dõi ai đã trả tiền gì trong nhóm đông người |
| 2 | Tính toán chia đều / chia theo tỷ lệ mất thời gian và dễ nhầm |
| 3 | App chỉ dùng được offline — không chia sẻ được data với cả nhóm |
| 4 | Thanh toán thực tế không theo đúng kịch bản thuật toán — cần ghi nhận thanh toán tự do |
| 5 | Không có cơ chế nhắc nhở người còn nợ → Đã giải quyết bởi **Trung tâm Thông báo** (§11.5) + gợi ý settle thông minh (BR-NOTIF-06) |
| 6 | Một người tham gia nhiều nhóm bạn, mỗi nhóm nhiều chuyến — cần tài khoản để quản lý |
| 7 | Nhiều người cùng chỉnh sửa dữ liệu chuyến → cần phân quyền và xử lý xung đột |

---

## 2. Đối tượng người dùng

### Persona 1 — Minh, 24 tuổi, hay đi phượt nhóm

- Đi 2–3 chuyến/tháng với nhóm bạn 5–10 người
- Thường là người trả tiền trước rồi nhờ mọi người trả lại
- **Mong muốn:** ghi nhanh khoản chi, không cần giải thích với cả nhóm, nhắc tự động được người chưa trả

### Persona 2 — Lan, 30 tuổi, đồng nghiệp hay ăn trưa nhóm

- Ăn trưa nhóm 3–5 người, chia bill hàng ngày
- Thuộc nhiều nhóm: nhóm phòng, nhóm dự án, nhóm gia đình
- **Mong muốn:** app nhanh, không mất nhiều bước, xem ngay ai đang nợ mình

---

## 3. Phạm vi dự án

### Trong phạm vi (In scope)

Quản lý chuyến đi, ghi chi phí, chia tiền, ghi nhận thanh toán thực tế, đồng bộ server (Supabase/VPS), phân quyền nhóm, push notification qua FCM, dark mode, export ảnh lưu về máy. Nền tảng: **Android**.

### Ngoài phạm vi (Out of scope) — v1.0

Tích hợp cổng thanh toán thật (chuyển khoản trong app), quảng cáo (Ads), mua hàng trong app (IAP), ứng dụng iOS, web app, chế độ đa tiền tệ, OCR nhận diện hóa đơn, lưu ảnh hóa đơn lên server.

---

## 4. Mục tiêu kinh doanh

| Mục tiêu | Chỉ số đo lường | Thời hạn |
|----------|-----------------|----------|
| 10.000 lượt tải | CH Play Downloads | 6 tháng sau launch |
| Rating 4.5+ sao | CH Play Rating | 3 tháng sau launch |
| DAU/MAU ratio > 20% | Analytics (PostHog / Supabase) | 6 tháng sau launch |
| Day-7 Retention > 35% | Cohort retention | Liên tục đo lường |
| Số nhóm active / tuần tăng trưởng 10% | Server metrics | Từ tháng 2 sau launch |

---

## 5. Mô hình dữ liệu nghiệp vụ

Cấu trúc phân cấp của dữ liệu trong hệ thống:

```
User (tài khoản đăng nhập)
 └── Group (nhóm bạn bè: nhóm phượt, nhóm đồng nghiệp, nhóm gia đình...)
      └── Trip (chuyến đi / sự kiện trong nhóm đó)
           ├── Expense (các khoản chi trong chuyến)
           │    └── ExpenseSplit (cách chia cho từng thành viên)
           └── Payment (thanh toán thực tế do thành viên ghi nhận)
```

> **Lý do cần cấu trúc này:** Một người dùng thuộc nhiều nhóm bạn khác nhau, mỗi nhóm có nhiều chuyến đi. Tách Group và Trip giúp quản lý thành viên nhóm một lần, dùng cho nhiều chuyến — không phải thêm lại thành viên mỗi chuyến.

### Công thức tính số dư từng người

```
balance[member] =
  Σ expense.amount (khoản chi member đã trả)
  - Σ split.amount (phần member phải chịu trong các khoản chi)
  + Σ payment.amount WHERE payment.toMemberId = member (đã nhận)
  - Σ payment.amount WHERE payment.fromMemberId = member (đã trả đi)
```

> **Kết quả:** Số dư mỗi người = (tổng tiền họ đã trả cho khoản chi) - (phần họ phải trả trong các khoản chi) + (tổng tiền họ đã nhận từ Payment) - (tổng tiền họ đã chuyển đi qua Payment).

---

## 6. Nghiệp vụ thanh toán thực tế

### Luồng thanh toán

1. Thuật toán tính toán và đề xuất: "A nên trả B 150.000đ" — đây **chỉ là GỢI Ý**
2. Trong thực tế, A có thể trả B 100.000đ (chưa đủ), trả 200.000đ (dư), hoặc trả C thay vì B
3. Một thành viên (bất kỳ, nếu có quyền) vào app → chọn **"Ghi nhận thanh toán"**
4. Nhập: người trả, người nhận, số tiền thực tế, ngày giờ, ghi chú (tùy chọn)
5. App ghi lại giao dịch này vào bảng Payments và tính toán lại số dư của cả 2
6. Push notification gửi đến người nhận tiền để xác nhận

> **Điểm quan trọng:** App KHÔNG tự động cập nhật số dư khi 2 người chuyển tiền cho nhau bên ngoài. App chỉ cập nhật khi có người (bất kỳ thành viên có quyền) vào app và GHI NHẬN lại thanh toán đó. Đây là giao dịch thực tế, tách biệt hoàn toàn với đề xuất quyết toán của thuật toán.

---

## 7. Phân quyền trong nhóm

Hệ thống 2 cấp quyền:

| Vai trò | Mô tả | Quyền hạn |
|---------|-------|-----------|
| **Admin** (Quản trị) | Người tạo nhóm, tự động được gán. **Mỗi nhóm có đúng 1 Admin.** | Tất cả quyền Member + thêm/xóa thành viên + sửa/xóa mọi khoản chi + **quản lý chuyến (đổi tên/đóng/mở lại/reset/xóa)** + xóa ghi nhận thanh toán + xóa nhóm |
| **Member** (Thành viên) | Mặc định khi tham gia nhóm. | Xem tất cả + thêm khoản chi mới + ghi nhận thanh toán + **tạo chuyến đi** + sửa/xóa khoản chi do chính mình tạo + tự rời nhóm |

### Quy tắc phân quyền bổ sung

- Mỗi nhóm chỉ có tối đa **1 Admin**. Chưa hỗ trợ chuyển quyền Admin (sẽ bổ sung sau dưới dạng "Transfer Admin" — atomic swap).
- Admin không thể tự rời nhóm và không thể bị xóa khỏi nhóm. Nếu Admin không muốn tiếp tục, họ phải xóa nhóm.
- Member có thể tự rời nhóm hoặc bị Admin xóa.
- **Mọi member TẠO được chuyến đi** (trip). Nhưng **quản lý** chuyến — đổi tên / đóng / mở lại / reset / xóa — **vẫn chỉ Admin** (tránh member xóa/reset nhầm làm mất khoản chi cả nhóm).
- Khi xóa khoản chi, nếu đã có Payment liên quan → cảnh báo, không tự động xóa Payment.
- Mọi hành động sửa/xóa đều được ghi lại trong **audit log** (ai làm gì, lúc nào).

---

## 8. Business Rules

| Mã | Quy tắc | Chi tiết |
|----|---------|----------|
| BR-01 | Số tiền luôn là số nguyên, bội của 1.000đ | **Input:** App chỉ cho nhập số tiền là bội của 1.000đ (validate trước khi lưu). **Lưu trữ:** DB lưu cả `raw_amount` (số tiền gốc người dùng nhập) và `amount` (số tiền sau khi chia, đã làm tròn đến 1.000đ). Mục đích: hiển thị minh bạch cho người dùng biết số tiền gốc vs số tiền thực tế sau khi chia. **Chia đều:** Round đến 1.000đ, phần lẻ gán cho người cuối cùng trong danh sách. Không bao giờ dùng float. |
| BR-02 | Tổng split = tổng khoản chi | Tổng số tiền trong expense_splits phải luôn bằng expenses.amount. Validate trước khi lưu (UI form + `createExpense` service). Khi chia cho tập-con thành viên: tổng tính trên những người **được chọn** — người không tham gia không có split row, không bị tính nợ. |
| BR-03 | Payment là giao dịch tự do | Số tiền Payment không bị ràng buộc vào số dư hiện tại — người dùng có thể trả nhiều hơn hoặc ít hơn số đang nợ. |
| BR-04 | Không xóa cứng (Soft delete / Soft-remove) | Mọi record bị xóa chỉ set `deleted_at`, không xóa khỏi database. Cần cho audit log và sync. Riêng `group_members`: dùng `left_at` (rời nhóm) thay vì `deleted_at`. Khi rejoin → reset `left_at = NULL`, giữ nguyên member ID → kế thừa data lịch sử. |
| BR-05 | Chuyến đã đóng vẫn đọc được | Sau khi đóng chuyến: không thêm expense mới, nhưng vẫn có thể ghi nhận Payment và xem lịch sử. |
| BR-06 | Một User = nhiều Group | User tham gia Group qua invite link hoặc mã nhóm. Cần xác thực tài khoản trước khi tham gia. |
| BR-07 | Đề xuất quyết toán chỉ là gợi ý | Thuật toán tối ưu giao dịch được hiển thị để tham khảo, không ảnh hưởng đến dữ liệu thực cho đến khi Payment được ghi nhận. |
| BR-08 | Mã mời nhóm không trùng lặp | Mã mời 6 ký tự (`a-z, 0-9`) được sinh 1 lần duy nhất khi tạo nhóm. Sử dụng bảng chữ cái rộng (36^6 = ~2.1 tỷ tổ hợp) thay vì hex, kèm retry logic khi collision. Mã không thể đổi sau khi tạo. Column có UNIQUE constraint. |
| BR-09 | Join nhóm cần Admin duyệt | Khi người dùng nhập mã mời, hệ thống tạo "yêu cầu tham gia" (join request) ở trạng thái `pending`. Admin nhận notification và duyệt/từ chối. Chỉ khi được duyệt (`approved`) thì người dùng mới trở thành member. Áp dụng cho **mọi trường hợp** — kể cả user đã từng ở nhóm và rời đi. Mục đích: bảo vệ khi mã mời bị lộ. |
| BR-10 | Badge tổng nợ trên Home | Màn hình Home hiển thị tổng hợp số dư của user qua tất cả nhóm/chuyến. Hiển thị: "Bạn đang nợ X" (đỏ) hoặc "Bạn được nợ X" (xanh). Tính từ tổng balance âm/dương của user trên mọi chuyến đang mở. |
| BR-11 | Tìm và mời user qua email | Admin có thể tìm user đã đăng ký bằng email và gửi lời mời trực tiếp vào nhóm. User nhận notification và chấp nhận/từ chối. Không cần biết mã mời. |
| BR-NOTIF-01 | Notif chỉ gửi cho thành viên active | Mọi thông báo nhóm chỉ fan-out cho member có `left_at IS NULL` tại thời điểm event. Member rời nhóm trước event → không nhận. |
| BR-NOTIF-02 | Actor không nhận notif về chính mình | Người thực hiện action (thêm chi, ghi payment, đóng trip…) bị loại khỏi danh sách recipients. |
| BR-NOTIF-03 | Thành viên ảo không nhận notif | `is_virtual=true` hoặc `user_id IS NULL` → bỏ qua khi resolve recipients (không có auth session để xem). |
| BR-NOTIF-04 | TTL notifications | Notif đã đọc giữ 30 ngày, chưa đọc 60 ngày, sau đó cron `cleanup_notifications()` xóa cứng. Lý do: Supabase free tier 500MB. |
| BR-NOTIF-05 | Dedup 10 phút | Nếu user đã có notif chưa đọc cùng `(group, type, actor)` trong 10 phút qua → gộp thành 1 notif "X đã thêm N khoản chi" thay vì spam. |
| BR-NOTIF-06 | Gợi ý settle thông minh | Khi 1 cặp (debtor, creditor) nợ > 200.000đ kéo dài > 3 ngày trong trip mở → gửi notif `trip.reminder_settle` cho debtor. Cooldown 7 ngày để không spam cùng cặp. (Phase 3 — cron Edge Function) |
| BR-NOTIF-07 | Per-user opt-out | User tắt được 4 nhóm thông báo trong Cài đặt: **Hoạt động** (expense + trip), **Thanh toán**, **Thành viên**, **Gợi ý thông minh**. Setting áp dụng phía server (recipient resolver) — đã tắt → KHÔNG insert notif. |
| BR-AVATAR-01 | Chỉ admin đổi avatar nhóm | Mỗi nhóm có 1 admin duy nhất; chỉ admin mới thấy entry "Sửa" trên avatar và mới được upload/xóa. Member tap vào avatar không có tương tác. Edge Function tự verify role qua `assertRole` + `commit_group_avatar` lock row → 2 lớp bảo vệ. |
| BR-AVATAR-02 | Quota để bảo vệ free tier R2 | Free tier R2 (10 GB storage, 1M Class A ops/tháng): mỗi **nhóm** đổi tối đa **3 lần / 7 ngày**, mỗi **user** upload tối đa **20 lần / ngày** trên toàn app. Vượt quota → hiển thị "Thử lại sau X giờ/ngày" với `retryAfter` chính xác. Quota check atomic trong Postgres function (FOR UPDATE) — không bypass được khi 2 thiết bị upload đồng thời. |
| BR-AVATAR-03 | Ảnh tỉ lệ 1:1, max 2 MB sau xử lý | App buộc crop 1:1 trong picker. Sau crop, app tự nén progressive (q=0.95 → q=0.85 → resize 2048/1024/512) cho đến khi ≤ 2 MB. Dimension cap 2048 vì avatar render max ~150px. Ảnh không thể nén dưới 2 MB (rất hiếm) → báo lỗi "thử ảnh khác". |
| BR-AVATAR-04 | File cũ xóa ngay khi đổi | Khi update avatar mới thành công, file R2 cũ bị xóa best-effort. Cron `group-avatar-cleanup` chạy weekly quét orphan (file R2 không có trong `groups.avatar_url` và `group_avatar_uploads` < 24h) — bảo vệ trường hợp delete fail giữa chừng hoặc presign-không-commit (mất mạng). |
| BR-RATELIMIT-01 | Giới hạn tần suất chống spam/bloat | Anon key nằm trong APK nên kẻ xấu/account bị chiếm có thể gọi server trực tiếp. Giới hạn ở tầng DB (BEFORE INSERT trigger, sliding-window đếm cả bản ghi đã xoá mềm để chống reset): **khoản chi 300/người/giờ + 500/nhóm/giờ**, **thanh toán 200/người/giờ**, **chuyến 60/người/ngày**, **nhóm 30/người/ngày**, **thành viên ảo 100/nhóm/ngày**. Vượt ngưỡng → báo "Bạn thao tác quá nhanh, thử lại sau ít phút"; thao tác offline **tự đồng bộ lại** khi cửa sổ trôi qua (KHÔNG mất dữ liệu). Mục đích: bảo vệ DB free tier 500MB + chống dội thông báo/push. Errcode `P0429`. Auth (đăng nhập/đăng ký/reset) giới hạn riêng ở Supabase Dashboard. |
| BR-SEC-01 | Chống giả mạo người ghi (actor) | Cột người-ghi (`created_by` khoản chi / `recorded_by` thanh toán) bị ép = người đang đăng nhập ở tầng DB → không thể đổ tội/ghi danh người khác kể cả khi gọi server trực tiếp. KHÔNG cản nghiệp vụ "member thêm khoản chi/thanh toán hộ nhóm": người trả (`paid_by`) và cách chia không bị ảnh hưởng. Errcode `42501`. |

---

## 9. Use Cases

### UC-01: Đăng ký / Đăng nhập

| Trường | Nội dung |
|--------|---------|
| **Actor** | Người dùng mới |
| **Tiền điều kiện** | App đã cài đặt |
| **Luồng đăng ký** | 1. Nhập số điện thoại hoặc email → 2. Nhận OTP / xác nhận email → 3. Đặt tên hiển thị và avatar (tùy chọn) → 4. Vào màn hình Home |
| **Luồng đăng nhập** | 1. Nhập email/SĐT + mật khẩu → 2. Hoặc đăng nhập Google (OAuth) → 3. Vào màn hình Home, tải danh sách nhóm |
| **Offline** | Nếu đã từng đăng nhập, app cho vào nhưng data chỉ là local cache |

### UC-02: Tạo nhóm và thêm thành viên

| Trường | Nội dung |
|--------|---------|
| **Actor** | User đã đăng nhập (sẽ trở thành Admin của nhóm mới) |
| **Luồng chính** | 1. Tạo nhóm: nhập tên, chọn avatar nhóm → 2. App sinh mã mời 6 ký tự (alphanumeric, UNIQUE, không đổi) → 3. Chia sẻ mã/link qua Zalo/Messenger/copy → 4. Thành viên nhập mã → hệ thống tạo **join request** (`pending`) → 5. Admin nhận notification → duyệt hoặc từ chối → 6. Nếu duyệt → thành viên mới là `member`, danh sách cập nhật real-time |
| **Luồng phụ 1** | Admin có thể thêm thành viên "ảo" (không có tài khoản) để ghi chi phí — họ không nhận được notification |
| **Luồng phụ 2 — Mời qua email** | Admin vào "Thêm thành viên" → nhập email → hệ thống tìm user đã đăng ký → gửi lời mời (invitation) → user nhận notification → chấp nhận = join nhóm, từ chối = hủy |
| **Quyền** | Mọi thành viên (Admin + Member) đều tạo được chuyến trong nhóm. Quản lý chuyến (đổi tên/đóng/mở lại/reset/xóa) vẫn chỉ Admin. |

### UC-03: Ghi nhận thanh toán thực tế

| Trường | Nội dung |
|--------|---------|
| **Actor** | Thành viên có quyền (Member trở lên) |
| **Tiền điều kiện** | Chuyến đang tồn tại (open hoặc closed), User là thành viên nhóm |
| **Luồng chính** | 1. Vào tab "Thanh toán" trong chuyến → 2. Nhấn "Ghi nhận thanh toán mới" → 3. Chọn: người đã trả — người đã nhận — số tiền — ngày giờ → 4. Thêm ghi chú tùy chọn (VD: "chuyển khoản Momo") → 5. Xác nhận → số dư 2 người được cập nhật → 6. Push notification gửi đến người nhận |
| **Lưu ý UX** | Hiển thị số dư hiện tại của 2 người TRƯỚC và SAU khi ghi nhận để người dùng kiểm tra |
| **Ngoại lệ** | Số tiền âm hoặc bằng 0 → không cho lưu |

### UC-04: Đổi avatar nhóm

| Trường | Nội dung |
|--------|---------|
| **Actor** | Admin của nhóm (mỗi nhóm có đúng 1 admin) |
| **Tiền điều kiện** | Nhóm tồn tại, User là admin hiện tại |
| **Luồng chính** | 1. Vào màn chi tiết nhóm → 2. Tap avatar (có badge "Sửa" — chỉ admin thấy) → 3. BottomSheet hiện 2 actions: "Chụp ảnh" / "Chọn từ thư viện" → 4. Picker mở với crop 1:1 bắt buộc → 5. App tự xử lý ảnh (compress + resize tối ưu) → 6. Preview hiện ảnh kèm metadata `{dim}×{dim} • {KB}` → 7. User bấm "Lưu" → app upload trực tiếp lên R2 qua presigned URL → 8. Edge Function commit DB + xóa file cũ → 9. Avatar hiển thị mới ở header và GroupCarousel home |
| **Luồng phụ — Xóa avatar** | Tại BottomSheet step 3, nếu nhóm đã có avatar tùy chỉnh → hiện thêm action "Xóa avatar" → confirm → fallback về initials gradient mặc định |
| **Quyền** | Member tap avatar → Pressable disabled, không có phản ứng. Curl trực tiếp Edge Function với JWT của member → 403. |
| **Ngoại lệ — Quota** | Vượt 3 lần/nhóm/7 ngày HOẶC 20 lần/user/ngày → 429 "Vượt giới hạn đổi avatar. Thử lại sau X giờ/ngày" (BR-AVATAR-02) |
| **Ngoại lệ — Ảnh quá lớn** | Sau 5 attempts compress mà file vẫn > 2 MB → "Ảnh không thể nén dưới 2 MB, thử ảnh khác" (rất hiếm — chỉ ảnh raw rất phức tạp) |
| **Ngoại lệ — Mất mạng giữa chừng** | Nếu app crash sau presign nhưng trước commit → file R2 thành orphan, cron weekly tự dọn (BR-AVATAR-04) |

---

## 10. Danh sách chức năng

| Mã | Chức năng | Ưu tiên | Phiên bản |
|----|-----------|---------|-----------|
| F-01 | Đăng ký / Đăng nhập (Email, Google OAuth) | Must have | v1.0 |
| F-02 | Tạo / chỉnh sửa / xóa nhóm (Group) | Must have | v1.0 |
| F-03 | Invite thành viên qua link | Must have | v1.0 |
| F-04 | Phân quyền Admin / Member | Must have | v1.0 |
| F-05 | Tạo / đóng chuyến đi trong nhóm | Must have | v1.0 |
| F-06 | Thêm khoản chi — chia đều (toàn nhóm hoặc chỉ người được chọn) | Must have | v1.0 |
| F-07 | Thêm khoản chi — chia theo tỷ lệ / số tiền tùy chỉnh (áp trên người được chọn) | Must have | v1.0 |
| F-08 | Xem số dư từng thành viên | Must have | v1.0 |
| F-09 | Xem đề xuất quyết toán (thuật toán tối ưu) | Must have | v1.0 |
| F-10 | Ghi nhận thanh toán thực tế (tự do, không theo thuật toán) | Must have | v1.0 |
| F-11 | Lịch sử toàn bộ khoản chi và thanh toán | Must have | v1.0 |
| F-12 | Đồng bộ dữ liệu lên server (offline-first) | Must have | v1.0 |
| F-13 | Giải quyết xung đột khi sync (conflict resolution) | Must have | v1.0 |
| F-14 | Push notification qua FCM (nhắc thanh toán, thông báo khoản mới) | Must have | v1.0 |
| F-15 | Dark mode (theo system preference) | Must have | v1.0 |
| F-16 | Audit log: lịch sử thay đổi ai làm gì | Should have | v1.0 |
| F-17 | Export kết quả chuyến ra ảnh (lưu về máy ngay) | Should have | v1.1 |
| F-19 | Thống kê chi tiêu theo danh mục | Nice to have | v1.2 |
| F-20 | Chế độ đa tiền tệ | Nice to have | v2.0 |
| F-21 | Giải thích bước chia tiền | Nice to have | v1.2 |
| F-22 | Badge tổng nợ/được nợ trên Home | Must have | v1.0 |
| F-23 | Join nhóm cần duyệt (Join Request) | Must have | v1.0 |
| F-24 | Tìm và mời user qua email | Should have | v1.0 |
| F-25 | Sinh mã mời collision-proof (alphanumeric 6 ký tự) | Must have | v1.0 |
| F-26 | Trang Thông báo (Notifications) — list events theo nhóm/ngày, filter, mark-as-read, swipe delete, deeplink | Must have | v1.0 |
| F-27 | Smart dedup notifications (10 phút) | Should have | v1.0 |
| F-28 | Gợi ý settle thông minh (cron daily, ngưỡng 200.000đ × 3 ngày) | Should have | v1.1 |
| F-29 | Avatar nhóm tùy chỉnh (Cloudflare R2 + Supabase Edge Functions) | Should have | v1.0 |

---

## 11. Màn hình chính

### Màn hình 1: Home — Danh sách nhóm

- Danh sách các Group người dùng tham gia
- Mỗi Group card: tên, avatar, số thành viên, tóm tắt số chuyến đang mở
- **Badge tổng nợ** (BR-10): header hiển thị tổng nợ/được nợ qua tất cả nhóm. Mỗi group card hiển thị số dư riêng của user trong nhóm đó. Màu đỏ = nợ, xanh = được nợ.
- **Join request badge**: hiện số lượng yêu cầu tham gia đang chờ duyệt (chỉ Admin thấy)
- Nút tạo nhóm mới, nút nhập mã mời

### Màn hình 2: Chi tiết nhóm

- **Tab Chuyến đi:** danh sách trips trong nhóm (đang mở và đã đóng)
- **Tab Thành viên:** danh sách member kèm role badge
- **Tab Cài đặt** (chỉ Admin): đổi tên, xóa nhóm

### Màn hình 3: Chi tiết chuyến

- **Tab Chi phí:** danh sách expense, lọc theo ngày / danh mục / người
- **Tab Số dư:** card từng người, màu xanh (đang được nợ) / đỏ (đang nợ)
- **Tab Quyết toán:** đề xuất tối ưu + danh sách Payment đã ghi nhận

### Màn hình 4: Ghi nhận thanh toán

- Dropdown chọn người trả — người nhận (từ danh sách thành viên nhóm)
- Input số tiền (numpad VND)
- Preview: số dư trước và sau khi ghi nhận
- Ngày giờ (auto, có thể chỉnh)
- Ghi chú tùy chọn

### Màn hình 5: Trung tâm Thông báo

**Entry point:** icon chuông trong header Home (cạnh Avatar). Badge đỏ hiển thị số notif chưa đọc, max "9+". Tap → route `/notifications`.

**Layout:**
- Header: tiêu đề "Thông báo" + action "Đọc tất cả" (chỉ hiện khi có unread).
- Filter top bar (`ChipPicker`): `Tất cả | Chưa đọc | Theo nhóm`. Chip "Theo nhóm" mở dropdown chọn group → filter `group_id`.
- List `SectionList` chia section theo ngày: **Hôm nay / Hôm qua / Tuần này / Cũ hơn** (group client-side).
- Pull-to-refresh + infinite scroll (`onEndReached`, page size 30).
- Empty state: "Chưa có thông báo nào".

**Notification row:**
- Avatar actor (hoặc icon by type nếu hệ thống) + dấu chấm icon nhỏ ở góc dưới phải.
- Title bold (nếu unread) + thời gian relative ("3 phút trước") + tên nhóm (nếu có).
- Dấu chấm xanh bên phải nếu chưa đọc.
- **Tap** → mark-as-read (optimistic) + deeplink theo `data.trip_id`/`data.group_id`.
- **Swipe phải** → nút Xóa (đỏ) → DELETE row khỏi DB.

**Loại thông báo (11 types):**

| Key | Label VN | Scope | Trigger |
|---|---|---|---|
| `expense.created` | "{Actor} đã thêm khoản chi {title} ({amount})" | Group (trừ actor) | Sau `createExpense` |
| `expense.edited` | "{Actor} sửa khoản chi {title}" | Group (trừ actor) | Sau `updateExpense` |
| `expense.deleted` | "{Actor} đã xóa khoản chi {title}" | Group (trừ actor) | Sau `deleteExpense` |
| `payment.recorded` | "{Recorder} ghi nhận {From} → {To} trả {amount}" | Personal (from + to, trừ actor) | Sau `createPayment` |
| `payment.received` | "{Payer} đã trả bạn {amount}" | Personal (to_member) | Sau `createPayment` (variant POV người nhận) |
| `member.join_requested` | "{Tên} muốn tham gia nhóm {group}" | Personal (admin) | Sau `joinGroupByCode` |
| `member.join_approved` | "Bạn đã được duyệt vào nhóm {group}" | Personal (requester) | Sau `approveJoinRequest` |
| `member.join_rejected` | "Yêu cầu vào nhóm {group} bị từ chối" | Personal (requester) | Sau `rejectJoinRequest` |
| `member.role_change` | "Bạn được chuyển sang {role}" | Personal (target) | Sau transfer admin (Phase 3+) |
| `trip.closed` | "Chuyến đi {name} đã được đóng" | Group | Sau `closeTrip` |
| `trip.reminder_settle` | "Bạn còn nợ {Tên} {amount} trong {trip}" | Personal (debtor) | Cron daily (Phase 3) |

**Use case 1 — Minh xem hoạt động hôm qua:**
- Sáng mở app → bell badge "3" → tap → vào trang Thông báo.
- Thấy 3 notif "Lan đã thêm 2 khoản chi" và "An đã trả bạn 200.000đ" trong section "Hôm qua".
- Tap row "An đã trả bạn" → navigate `/trips/abc` xem detail. Notif tự mark-as-read.
- Quay lại trang Thông báo → notif đã chuyển grey, badge giảm về 1.

**Use case 2 — Debtor nhận gợi ý settle:**
- Sáng 09:05, cron daily phát hiện Minh nợ Lan 350.000đ trong trip "Đà Nẵng" đã 4 ngày.
- Notif `trip.reminder_settle` xuất hiện: "Bạn còn nợ Lan 350.000đ trong Đà Nẵng".
- Minh tap → app deeplink mở payment modal pre-fill `from=Minh, to=Lan, amount=350000` → submit là xong.
- 7 ngày sau Minh chưa trả → cron mới gửi tiếp 1 notif (cooldown 7 ngày).

**Cài đặt liên quan (`(main)/settings.tsx` → section "THÔNG BÁO"):** 4 toggle — Hoạt động nhóm / Thanh toán / Thành viên / Gợi ý thông minh. Mặc định ON. Tắt → server skip insert (BR-NOTIF-07).

---

## 12. Kế hoạch phát triển

### Roadmap

| Phase | Thời gian | Nội dung | Deliverable |
|-------|-----------|---------|-------------|
| **Phase 0** — Setup | Tuần 1 | Expo project, TypeScript, HeroUI Native, Supabase setup (Auth + DB + Realtime), SQLite local, navigation skeleton, dark mode config | Project chạy được, login/logout hoạt động |
| **Phase 1** — Auth & Group | Tuần 2 | Màn hình đăng ký/đăng nhập, tạo nhóm, invite link, quản lý thành viên, phân quyền cơ bản | Luồng tạo nhóm và mời người hoàn chỉnh |
| **Phase 2** — Core Expense | Tuần 3–4 | Tạo chuyến, thêm khoản chi (chia đều + tỷ lệ), hiển thị số dư, SQLite + Supabase sync realtime | MVP: thêm chi và xem số dư |
| **Phase 3** — Payment | Tuần 5 | Ghi nhận thanh toán thực tế, tính lại số dư, thuật toán quyết toán (Edge Function), màn hình quyết toán | Core flow hoàn chỉnh |
| **Phase 4** — FCM & Notify | Tuần 6 | Tích hợp FCM, Edge Functions / VPS cho notification, màn hình cài đặt thông báo, nhắc nợ cron | Push notification hoạt động |
| **Phase 5** — Polish | Tuần 7 | Offline indicator, conflict UI, audit log, export ảnh lưu về máy, animation, test thiết bị thật | Beta ready |
| **Phase 6** — Launch | Tuần 8 | Store listing, icon, screenshots, ASO, Supabase RLS review, submit CH Play | Published |

---

## 13. Rủi ro và giảm thiểu

| Rủi ro | Mức độ | Kế hoạch giảm thiểu |
|--------|--------|---------------------|
| Chi phí Supabase vượt free tier | Trung bình | Supabase free: 500MB DB, 50k MAU, 200 concurrent realtime. Với app mới là đủ. VPS đã có sẵn làm backup. Monitor chặt, tối ưu query. |
| Conflict sync gây mất dữ liệu | Cao nếu không xử lý | Soft delete toàn bộ, không bao giờ xóa cứng. Audit log ghi lại mọi thay đổi. Test kỹ kịch bản offline + conflict. |
| FCM notification không đến | Thấp | FCM khá tin cậy trên Android. Fallback: hiển thị badge trong app khi user mở lại. |
| Supabase RLS có lỗ hổng | Cao nếu không test | Viết test cho RLS policies, kiểm tra với nhiều role khác nhau trước khi deploy. Audit RLS + RPC grants định kỳ (verify trực tiếp `pg_proc`/`pg_policies`, không tin docs). |
| Spam/abuse từ account hợp lệ (phình DB, dội thông báo) | Trung bình | Anon key trong APK → mọi enforcement đặt ở DB. Rate-limit trigger sliding-window (BR-RATELIMIT-01) + spoof guard (BR-SEC-01) + Auth rate limits + Captcha (Dashboard). Monitor usage alerts free tier. |
| Tính toán số tiền sai do float | Cao nếu không xử lý | Lưu 100% là BIGINT (đồng). Validate tổng splits = tổng amount trước khi ghi. Test BR-01 và BR-02 tự động. |
| App bị reject vì permission thừa | Thấp | Chỉ xin permission thực sự cần: POST_NOTIFICATIONS (FCM), INTERNET. Không xin CAMERA, CONTACTS, LOCATION. |

---

## 14. Kế hoạch kiểm thử

### Test Cases nghiệp vụ quan trọng

| Mã | Mô tả | Input | Expected |
|----|-------|-------|----------|
| TC-01 | Chia đều không chia hết | 500.000đ / 3 người | 167.000 + 167.000 + 166.000 = 500.000đ |
| TC-02 | Số dư sau expense | An trả 300k, chia đều 3 người | An: +200k, Bình: -100k, Chi: -100k |
| TC-03 | Payment tự do, trả dư | Bình trả An 120k (nợ 100k) | An: +80k, Bình: +20k (Bình giờ được nợ lại 20k) |
| TC-04 | Payment tự do, trả không đúng người thuật toán gợi ý | Thuật toán: An trả B. Thực tế: An trả C | Ghi nhận An→C, số dư An và C cập nhật đúng. Số dư B không đổi. |
| TC-05 | Tổng số dư nhóm = 0 | Bất kỳ combination expense + payment nào | Σ balance[] = 0 trong mọi trường hợp |
| TC-06 | Conflict khi 2 người sửa cùng expense | A và B cùng sửa expense lúc offline | Server version thắng, A hoặc B nhận thông báo conflict |
| TC-07 | Phân quyền: Member không xóa expense của người khác | Member cố xóa expense của admin | Supabase RLS từ chối, hiện lỗi permission |
| TC-08 | Offline: thêm expense khi không có mạng | Tắt wifi, thêm expense | Expense hiển thị ngay (optimistic), sync khi có mạng |
| TC-09 | FCM gửi đến đúng người | An thêm expense trong nhóm 5 người | 4 người còn lại nhận notification, An không nhận |
| TC-10 | Soft delete: expense đã xóa không hiện | Admin xóa expense | Expense biến mất khỏi list, số dư cập nhật, audit log ghi lại |

### Test môi trường

- **Supabase local (Docker):** test RLS policies, Edge Functions, database locally
- **Thiết bị thật:** Samsung Galaxy A (Android 12), Xiaomi Redmi (Android 11), Realme (Android 13)
- **Máy ảo:** Android 8.0, 10, 12, 14
- **Test kịch bản offline:** Airplane mode, wifi yếu, timeout

---

## 15. Thuật ngữ

| Thuật ngữ | Định nghĩa |
|-----------|-----------|
| **Group / Nhóm** | Tập hợp người dùng có quan hệ (bạn bè, gia đình, đồng nghiệp) — container chứa nhiều chuyến đi |
| **Trip / Chuyến** | Một sự kiện cụ thể (chuyến đi, bữa ăn) trong một nhóm — nơi ghi chép chi phí |
| **Expense / Khoản chi** | Một lần thanh toán thực tế: ai trả, bao nhiêu, chia cho ai |
| **Payment / Thanh toán** | Giao dịch thực tế giữa 2 thành viên được ghi nhận thủ công trong app |
| **Balance / Số dư** | Số tiền ròng mỗi người (dương = được nợ, âm = đang nợ), tính từ expenses + payments |
| **Settlement / Quyết toán** | Danh sách giao dịch tối ưu do thuật toán đề xuất — chỉ là gợi ý |
| **Offline-first** | App hoạt động đầy đủ không cần mạng, tự động sync khi có kết nối |
| **Soft delete** | Xóa bằng cách set trường `deleted_at`, không xóa document khỏi database |
| **Optimistic UI** | UI cập nhật ngay lập tức khi user thao tác, không chờ server confirm |
| **FCM** | Firebase Cloud Messaging — dịch vụ push notification của Google |
| **Conflict** | Tình huống 2 thiết bị sửa cùng 1 document trong khi offline, gây mâu thuẫn khi sync |

---

## Phụ lục: Thay đổi so với v1.0

| Hạng mục | v1.0 | v2.0 (hiện tại) |
|----------|------|-----------------|
| Authentication | Không có — offline only | Bắt buộc đăng nhập (Supabase Auth) |
| Cấu trúc dữ liệu | User → Trip (không có Group) | User → Group → Trip (hỗ trợ đa nhóm) |
| Thanh toán | Đánh dấu "đã thanh toán" theo gợi ý thuật toán | Ghi nhận thanh toán tự do: ai trả ai, bao nhiêu, bất kỳ số tiền nào |
| Đồng bộ dữ liệu | Không có — SQLite local only | SQLite local + Supabase Realtime sync |
| Phân quyền | Không có | 2 cấp: Admin / Member |
| Thông báo | Không có | FCM push notification: khoản mới, thanh toán, nhắc nợ |
| Database | SQLite (local) | PostgreSQL (Supabase cloud) + SQLite (local cache) |
| UI Library | NativeWind | HeroUI Native |
| Dark mode | Không có | Có, theo system preference |
| Monetization | AdMob + IAP | Không có trong v1.0 |
| Conflict resolution | Không cần (local only) | Server-wins + thông báo user |

---

*Fair Pay v2.0 Project Spec — Tài liệu nghiệp vụ — Cập nhật tháng 4/2026*
