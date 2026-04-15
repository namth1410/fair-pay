# Đánh Giá Thiết Kế Frontend: SplitVN

> Ngày đánh giá: 2026-04-15

## Tổng Quan

SplitVN là ứng dụng Expo/React Native chia tiền nhóm, hỗ trợ dark/light theme, sử dụng HeroUI Native + Uniwind (Tailwind cho RN). Ứng dụng có logic nghiệp vụ và kiến trúc vững chắc, nhưng phần trình bày frontend hiện tại **đủ chức năng nhưng thiếu bản sắc thị giác** — trông giống prototype kỹ thuật hơn là sản phẩm hoàn thiện.

---

## 1. Typography (Kiểu chữ) — Điểm: D

### Vấn đề: Chỉ dùng font hệ thống, không có nhận diện thị giác

Toàn bộ ứng dụng render bằng font mặc định platform (SF Pro trên iOS, Roboto trên Android). Không có cá tính typography nào.

| Vấn đề | Vị trí | Ảnh hưởng |
|--------|--------|-----------|
| Không load custom font nào | Toàn bộ app | App trông như template trống |
| Title "SplitVN" chỉ là `fontWeight: '700'` font hệ thống | `src/app/(auth)/login.tsx:169` | Thương hiệu không có điểm nhấn thị giác |
| Dải font-weight đơn điệu (400-700) | Tất cả màn hình | Không có phân cấp typography ngoài font-size |
| Không tinh chỉnh letter-spacing hay line-height | Tất cả `StyleSheet` | Chữ thiếu tinh tế |

### Khuyến nghị
Load font display đặc trưng cho tiêu đề (ví dụ: **Be Vietnam Pro** — phù hợp đối tượng người Việt, **Bricolage Grotesque**, hoặc **Outfit**) qua `expo-font`. Kết hợp với body font sạch. Chỉ thay đổi này đã đủ nâng cấp chất lượng cảm nhận toàn bộ app.

---

## 2. Màu Sắc & Theme — Điểm: C+

### Vấn đề: Bảng màu an toàn nhưng dễ quên + hardcode tràn lan

Bảng màu dựa trên Slate với primary `#1D6FA8` là style "starter kit" của Tailwind. Nghiêm trọng hơn, hệ thống theme bị vô hiệu hóa một phần bởi các giá trị hex hardcode rải khắp nơi.

| Vấn đề | Vị trí |
|--------|--------|
| Hardcode `#334155`, `#E2E8F0` lặp lại 20+ lần | `login.tsx:72`, `index.tsx:157`, `groups/[id].tsx:228`, `trips/[id].tsx:184`, v.v. |
| Hardcode `#94A3B8`, `#64748B` cho text phụ | Cùng các file trên, 30+ chỗ |
| Màu surface `#1E293B`, `#0F172A` inline | Mọi component form/card |
| ErrorBoundary hardcode chỉ dark theme | `src/components/common/ErrorBoundary.tsx:49` |
| Border color tab bar hardcode | `src/app/(main)/_layout.tsx:18` |

Các giá trị hex này trùng lặp với những gì đã có trong `theme.ts` dưới tên `surface`, `surface-2`, `foreground-secondary`, và `divider`. Nếu muốn thay đổi palette, phải find-and-replace toàn bộ file.

### Khuyến nghị
- Trích xuất tất cả màu lặp lại vào export hex trong `theme.ts` (đã làm một phần — cần mở rộng).
- Tạo hook `useThemeColors()` trả về toàn bộ palette đã resolve cho scheme hiện tại.
- Cân nhắc primary màu đặc trưng hơn — màu xanh hiện tại quá "corporate SaaS chung chung." Tông ấm hơn hoặc accent mạnh hơn sẽ tạo cá tính cho app.

---

## 3. Chuyển Động & Tương Tác — Điểm: F

### Vấn đề: Không có bất kỳ animation nào trong toàn bộ app

Mặc dù đã cài `react-native-reanimated` v4.2.1, **không có animation nào tồn tại** trong bất kỳ file màn hình nào. App thiếu:

- Không có page transition
- Không có animation entrance cho list item
- Không có transition khi chuyển tab
- Không có feedback khi nhấn nút (ngoài mặc định OS)
- Không có skeleton/shimmer loading state
- Không có animation xuất hiện/biến mất form
- Không có animation thay đổi badge count
- Không có animation pull-to-refresh tùy chỉnh

Các form ở `src/app/(main)/index.tsx` và `src/app/(main)/groups/[id].tsx` toggle hiển thị bằng `{showCreate && (...)}` — hiện/ẩn tức thời không có transition.

### Khuyến nghị
Thêm tối thiểu:
- `LayoutAnimation` hoặc Reanimated `FadeIn`/`SlideInDown` cho form reveals
- Stagger entrance cho FlatList items
- Tab content crossfade
- Press feedback trên card (scale hoặc opacity spring)

---

## 4. Bố Cục & Composition — Điểm: C

### Vấn đề: Mọi màn hình đều theo cùng 1 pattern list phẳng

Cả 4 màn hình chính đều dùng công thức cấu trúc giống hệt nhau:
```
[Banner/summary tùy chọn]
[Hàng nút hành động]
[Form inline tùy chọn]
[FlatList các card]
```

Không có sự đa dạng về không gian, không có phân cấp thị giác ngoài "số to hơn = quan trọng hơn", không có composition sáng tạo.

| Vấn đề cụ thể |
|----------------|
| Tab bar không có icon — tab chỉ text trông như debug UI |
| Nút "Tạo nhóm" / "Nhập mã mời" ở home nhỏ, cân bằng trọng lượng — action chính nên nổi bật hơn |
| Card nhóm không có yếu tố phân biệt thị giác (không avatar, không mã màu, không icon loại nhóm) |
| Empty state chỉ là text xám — không minh họa, không làm nổi bật call-to-action |
| Card tổng quan chuyến đi ở `trips/[id].tsx:203` là element thị giác thú vị nhất trong app, nhưng chỉ là text căn giữa trên nền tô màu |

---

## 5. Kiến Trúc Component — Điểm: C-

### Vấn đề: Lặp code ồ ạt, trích xuất component tối thiểu

Các UI pattern giống nhau được copy-paste qua các file với biến thể nhỏ:

| Pattern lặp lại | Vị trí | Số lần |
|---|---|---|
| `TextInput` với styling theme-conditional giống hệt | login, register, index, groups/[id], trips/[id], settings | 15+ instance |
| Chip/pill selector (categories, types, split modes, dark mode) | groups/[id], trips/[id], settings | 6 implementation |
| Card với `cardTitle` + `cardMeta` + nội dung phải tùy chọn | groups/[id], trips/[id] | 8+ instance |
| Tab bar (custom pill tabs) | groups/[id], trips/[id] | 2 implementation giống hệt |
| Form card container | index, groups/[id], trips/[id] | 3 instance |
| "Empty state" text | index, groups/[id], trips/[id] | 4 instance |

Chỉ có 3 component tồn tại trong `src/components/common/` — `LoadingScreen`, `OfflineBanner`, `ErrorBoundary`. Không pattern lặp lại nào ở trên được trích xuất.

### Khuyến nghị
Trích xuất tối thiểu:
- `ThemedTextInput` — bọc 15+ block styling input trùng lặp
- `ChipSelector` — pattern pill-picker dùng khắp nơi
- `ContentCard` — pattern card row
- `PillTabs` — custom tab bar (dùng ở groups và trips)
- `EmptyState` — có hỗ trợ illustration/icon
- `FormSheet` — animated form container

---

## 6. Accessibility (Khả năng tiếp cận) — Điểm: D

| Vấn đề | Ảnh hưởng |
|--------|-----------|
| Không có `accessibilityLabel` trên bất kỳ `Pressable` nào | Screen reader không thể mô tả action |
| Không có `accessibilityRole` trên element tương tác | Button/link không được announce đúng |
| Chip selector không có `accessibilityState` cho trạng thái "selected" | Người dùng screen reader không biết cái nào đang chọn |
| Chỉ dùng màu xanh/đỏ để chỉ nợ/được nợ, không có prefix text | Người mù màu mất ngữ cảnh |
| `Pressable` không có `hitSlop` trên target nhỏ (text link 13px như "Xóa", "Duyệt") | Khó chạm chính xác |
| Long-press để xóa expense/payment không có affordance thị giác | Người dùng không thể khám phá tính năng |

---

## 7. Vấn Đề Cụ Thể Từng Màn Hình

### Login / Register
- Title thương hiệu "SplitVN" ở `login.tsx:55` chỉ là `Text` thường — cần logo hoặc xử lý đặc biệt
- Không có icon mạng xã hội cho nút Google — chỉ có text
- Divider "hoặc" được làm tốt nhưng tổng thể màn hình căn giữa dọc với không gì khác — cảm giác trống

### Home (Danh sách nhóm)
- Badge tổng nợ ở `index.tsx:80` là element UI có impact nhất — khá tốt nhưng có thể nổi bật hơn
- Card nhóm hiện mã mời (`#a1b2c3`) là thông tin nội bộ — cân nhắc chỉ hiện ở group detail
- Không có avatar/icon cho mỗi nhóm

### Group Detail (Chi tiết nhóm)
- 3 tab state được render inline trong 1 file 430 dòng — tách thành sub-component sẽ cải thiện khả năng đọc
- Banner "Mã mời" ở `groups/[id].tsx:339` có tương tác tap-to-share hay nhưng nhìn phẳng
- Tab Settings chỉ hiện duy nhất nút "Xóa nhóm" — cảm giác trống

### Trip Detail (Chi tiết chuyến đi)
- Màn hình phức tạp nhất với 564 dòng — **riêng form thêm expense đã chiếm 100+ dòng JSX**
- Input ratio/custom split ở `trips/[id].tsx:282-337` tính toán giá trị inline trong render — tạo pattern computation-per-render-per-member
- Không có phân biệt thị giác giữa các category expense trong danh sách
- Timestamp audit log ở `trips/[id].tsx:503` dùng format thủ công — cân nhắc `date-fns` hoặc `Intl.DateTimeFormat`

---

## 8. Bảng Điểm Tổng Hợp

| Hạng mục | Điểm | Ưu tiên |
|----------|------|---------|
| Typography (Kiểu chữ) | D | CAO — cải thiện hiệu quả nhất |
| Màu sắc & Theme | C+ | TRUNG BÌNH — hoạt động được nhưng nợ kỹ thuật (hardcode) |
| Chuyển động & Tương tác | F | CAO — app cảm giác tĩnh/thiếu sống động |
| Bố cục & Composition | C | TRUNG BÌNH |
| Kiến trúc Component | C- | CAO — lặp code gây tốn kém khi iterate |
| Accessibility | D | CAO — rủi ro UX và pháp lý |
| Icon & Tài nguyên thị giác | F | CAO — không có icon ở bất cứ đâu |
| Empty States | D | THẤP |
| Loading States | D | THẤP |

---

## 9. Top 5 Hành Động (Xếp theo Mức Độ Ảnh Hưởng)

### 1. Thêm font family tùy chỉnh
Load `Be Vietnam Pro` hoặc tương tự qua `expo-font`. Áp dụng display weight cho tiêu đề, regular cho body. Ngay lập tức nâng cấp toàn bộ app.

### 2. Trích xuất shared component
`ThemedTextInput`, `ChipSelector`, `ContentCard`, `PillTabs`, `EmptyState`. Việc này mở khóa tốc độ iteration cho mọi thứ khác.

### 3. Thêm icon
Cài `@expo/vector-icons` hoặc `lucide-react-native`. Thêm icon vào tab bar, card nhóm, chip category, nút hành động, empty state. Tăng mật độ thị giác = tăng chất lượng cảm nhận.

### 4. Thêm entrance animation
Dùng Reanimated `FadeInDown` + stagger cho list item, `Layout` transition cho form reveal, spring press feedback cho card.

### 5. Gom hardcode màu sắc
Tạo hook `useTheme()` trả về toàn bộ palette đã resolve. Thay thế tất cả 50+ conditional hex inline bằng theme token.
