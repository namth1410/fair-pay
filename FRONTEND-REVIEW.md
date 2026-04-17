# Đánh giá giao diện — Màn Group (Fair Pay)

> Phạm vi: `src/app/(main)/groups/[id].tsx` + 3 tab con (`TripsTab`, `MembersTab`, `GroupSettingsTab`) + các primitives liên quan (`SectionTabs`, `AppCard`, `AppText`, `EmptyState`).
> Ngày review: 2026-04-17.
> Tone: góp ý thẳng, có ưu tiên. Không sửa code trong lượt này.

---

## 1. Bảng điểm tổng (Scorecard)

| Hạng mục | Điểm | Nhận định ngắn |
|---|---|---|
| Typography | B− | BeVietnamPro hợp tiếng Việt, nhưng thiếu display font tạo "personality"; không có hero text trên group screen. |
| Color & Theme | B | Cam kết Sakura rõ ràng, nhưng ở light mode mọi surface đều hồng nhạt — dễ "washed out"; divider gần trùng primarySoft. |
| Motion | A− | SectionTabs indicator spring + tab direction-aware transition + card press-in + haptic — điểm sáng nhất của màn. |
| Layout | C+ | Cả 3 tab là list phẳng, không có hero/hierarchy, Settings tab quá trống. |
| Component Architecture | B+ | Tách tab gọn, `React.memo`, props-driven; `AppCard.trailing` bị nhồi quá nhiều action. |
| Accessibility | B | `accessibilityRole/label/hitSlop` đầy đủ; nhưng nhiều action là plain text 12px khó chạm, trạng thái disabled không rõ. |
| Aesthetic Identity | C | Palette có DNA rõ nhưng thiếu "signature element" khiến group screen vẫn trông giống generic settings list. |

**Tổng thể: B−** — nền tảng kỹ thuật tốt, motion tinh, nhưng màn Group chưa "khoe" được bản sắc Sakura, tab Settings đặc biệt thiếu chất.

---

## 2. Typography

**Font stack** — `BeVietnamPro_400/500/600/700`, khai báo sạch trong [fonts.ts](src/config/fonts.ts).

### Ưu
- Là font sans-serif thiết kế riêng cho tiếng Việt: dấu đầy đủ, cân đối — đúng đối tượng dùng.
- Hệ thống variant trong [AppText.tsx:17-25](src/components/ui/AppText.tsx#L17-L25) khá chuẩn: `display/title/subtitle/body/caption/meta/label` có `letterSpacing` âm cho heading, `letterSpacing: 0.6 + uppercase` cho label — chi tiết tốt.
- `letterSpacing: 2` áp vào invite code ở [MembersTab.tsx:199](src/components/group/MembersTab.tsx#L199) — đúng gu "serial number / ticket" — chi tiết cao cấp.

### Khuyết
- **Không có display/characterful font** đi kèm. Với concept Sakura mềm mại, đáng lẽ nên pair BeVietnamPro (body) với một display font mang tính nữ tính / thanh lịch (vd. serif/didone hoặc rounded display như `Fraunces`, `DM Serif Display`, `Recoleta`, `Unbounded`) cho tiêu đề nhóm, tiêu đề tab. Hiện tại mọi thứ dùng chung 1 family → thiếu nhịp.
- **Không nơi nào trên màn Group dùng `variant="display"`** (32px). Tên nhóm chỉ nằm trên `Stack.Screen.options.title` ([groups/[id].tsx:224](src/app/(main)/groups/[id].tsx#L224)) — nghĩa là dùng font hệ thống của navigation, **không phải BeVietnamPro**. Lạc điệu với phần còn lại.
- `variant="label"` có `textTransform: uppercase` — tiếng Việt có dấu khi uppercase ("YÊU CẦU THAM GIA") trông **nặng nề, dấu chạm baseline**. Ở [MembersTab.tsx:127-129](src/components/group/MembersTab.tsx#L127-L129) dùng `variant="label"` — cần tracking + line-height rộng hơn, hoặc bỏ uppercase cho tiếng Việt.
- `RolePill` text dùng `variant="meta"` (12px) — khi đã có background tint, font này hơi bé, đặc biệt trên Android density thấp.

### Gợi ý
1. Thêm 1 display font (ưu tiên có bản Vietnamese subset) — áp cho tên nhóm ở header và các tiêu đề section lớn.
2. Custom lại `Stack.Screen.options.headerTitle` để dùng `AppText` / display font.
3. Review toàn bộ chỗ dùng `label` + uppercase với tiếng Việt có dấu — hoặc tách thành `label-en` (uppercase) và `label-vi` (sentence case + tracking 0.4).

---

## 3. Color & Theme

### Ưu
- **Commitment mạnh với palette Sakura** — [theme.ts](src/config/theme.ts) định nghĩa rõ light (white + pink-50 surface + deep plum foreground) và dark (plum bg + pink foreground). Đây là điểm cộng lớn: đa số app AI-generated dùng purple gradient / blue — palette này **có DNA riêng**.
- Semantic color phân tách tốt: `primarySoft / accentSoft / primaryStrong / warmAccent` — cho phép dùng tint làm nền và strong làm text/badge.
- Badge/soft variants (`successSoft`, `dangerSoft`, `accentSoft`) — đúng pattern modern design.

### Khuyết
- **Light mode dễ "washed out"**: `background #FFFFFF`, `surface #FDF2F8`, `surfaceAlt #FCE7F3`, `divider #FBCFE8`, `primarySoft #FBCFE8` — **divider trùng chroma với primarySoft** → trên card `surface` thì divider gần như biến mất. Kiểm tra [GroupSettingsTab.tsx:28](src/components/group/GroupSettingsTab.tsx#L28): divider hầu như invisible.
- **Thiếu "anchor color" đậm làm đối trọng**. Cả màn chỉ có `primaryStrong #EC4899` xuất hiện ở badge nhỏ và text button — không có khối màu đậm nào làm điểm nhấn. Banner invite ([MembersTab.tsx:111](src/components/group/MembersTab.tsx#L111)) dùng gradient `accentSoft → tint` tức `pink-100 → pink-50` — **gradient gần như vô hình**, không tạo được cảm giác "hero".
- **Warning color `#F59E0B` (amber)** lệch tông Sakura — thay bằng một sắc hồng-cam (peach/coral) sẽ liền mạch hơn, tránh cảm giác "patch-in từ Tailwind default".
- Dark mode `divider #3D2433` trùng `surfaceAlt` — cùng vấn đề ranh giới biến mất.

### Gợi ý
1. Đẩy `divider` light sang pink-300 tint (vd. `#F5B6D2` với opacity 0.4) hoặc dùng `foreground` với opacity 0.08.
2. Đổi gradient invite banner: `primaryStrong → warmAccent` (pink-500 → rose-300) với góc chéo 135° — có "oomph", vẫn Sakura. Text đổi sang `inverseForeground`.
3. Thêm 1 "accent deep" (vd. burgundy `#6B1E3F`) cho CTA lớn và foreground alt — để mảng màu có đủ contrast ratio.
4. Xem lại warning: thử `#F08080` hoặc `#D97757` (terracotta) để ở trong family ấm.

---

## 4. Motion

### Ưu (đây là điểm sáng nhất)
- [SectionTabs.tsx:44-49](src/components/ui/SectionTabs.tsx#L44-L49) — indicator dùng `withSpring({ damping: 18, stiffness: 220 })`, đo layout imperatively → chuyển tab mượt, rất premium.
- [groups/[id].tsx:210-220](src/app/(main)/groups/[id].tsx#L210-L220) — tab content entering **biết hướng** (tab sau trượt từ phải, tab trước từ trái) nhờ `prevTabRef` + `GROUP_TAB_KEYS.indexOf`. Rất ít app RN làm đến mức này. Giữ.
- [AppCard.tsx:44-52](src/components/ui/AppCard.tsx#L44-L52) — press-in `scale 0.97` + haptic light. Tactile tốt.
- [EmptyState.tsx:23-45](src/components/ui/EmptyState.tsx#L23-L45) — SVG halo 3-blob radial gradient thay vì icon trơn → **đây là "signature detail"** duy nhất có tính aesthetic cao trên màn này.

### Khuyết
- **Không có stagger reveal** khi tab render lần đầu. List trips/members xuất hiện đồng loạt → bỏ phí cơ hội gây ấn tượng.
- `FormReveal` (tạo chuyến) — chưa xem code, nhưng tên gợi ý là expand/collapse. Nên có check xem có easing thẳng thớm không (thường dễ bị linear).
- Invite banner không có micro-interaction (pulse nhẹ / shimmer) — với 1 CTA chia sẻ đây là chỗ đáng đầu tư.
- `ConfirmDialog` — mở nhiều lần trong màn này (4 handler confirm). Không rõ có backdrop blur / scale spring không. Nếu chỉ fade thì phí.

### Gợi ý
1. Thêm `entering={FadeInDown.delay(i * 40).springify()}` cho từng `AppCard` trong list (stagger 40ms).
2. Banner invite: thêm shimmer gradient chạy ngang chậm (3–4s loop) — rất phù hợp vibe "mã mời đang mời gọi".
3. Kiểm tra `ConfirmDialog`: cần scale 0.95 → 1 spring + backdrop fade.

---

## 5. Layout & Composition

### Ưu
- 3 tab có thứ tự logic: `Chuyến đi → Thành viên → Cài đặt`. Badge trên tab Thành viên khi có pending request — UX đúng.
- `SectionTabs` dùng `alignSelf: flex-start` — pill indicator nằm gọn, không full-width bất cân — chọn lựa có chủ ý.

### Khuyết (nhiều)
- **Không có hero/header cho group**. Vào màn group, người dùng chỉ thấy tên nhóm trên system nav header + tabs. Đáng lẽ cần 1 block trên cùng hiển thị: avatar nhóm, tên nhóm, meta (số thành viên / số chuyến đang mở / số dư bạn). Hiện tại phải nhảy sang tab Settings mới biết thống kê.
- **Tab Settings quá trống** ([GroupSettingsTab.tsx](src/components/group/GroupSettingsTab.tsx)): 3 hàng info + nút "Xóa nhóm". Không có group avatar, không có tên nhóm editable, không có "Mã mời" (đang nằm bên tab Members), không có section "Vùng nguy hiểm". Với role admin đây là tab họ sẽ vào — nhưng không đáng vào.
- **Tab Members trailing quá chật**: `AppCard.trailing` nhồi `RolePill` + 2 plain-text action ("Hạ quyền" / "Xóa") stack 2 chiều. Trên màn hình 360dp Android, pill + 2 text 12px rất dễ mis-tap. Xem [MembersTab.tsx:66-98](src/components/group/MembersTab.tsx#L66-L98).
- **Pending request nằm giữa tab Members** — không nổi bật. Nên đẩy lên banner hoặc floating section ở tab Trips (vì admin cần action nhanh).
- **Form tạo chuyến**: nút "Tạo chuyến" ở corner trên-phải, khi bấm show form inline phía dưới — OK, nhưng không có visual connection (không có arrow/border) giữa button và form — cảm giác tách rời.
- **Không có asymmetry/grid-breaking**. Mọi thứ là list dọc 1 cột padding 16 — an toàn nhưng nhàm.
- Banner invite dùng `paddingHorizontal: 16, marginBottom: 12` — margin không đối xứng với ScrollShadow bên dưới, gây cảm giác "nổi lềnh bềnh".

### Gợi ý
1. Thêm **Group Hero Header**: avatar + tên nhóm (display font), dưới là 3 stat inline (Thành viên • Chuyến đang mở • Số dư). Hiển thị trên mọi tab. Khi scroll thì collapse sticky.
2. Tab Settings: refactor thành card-based `[Thông tin] [Mời & liên kết] [Vùng nguy hiểm]`. Đưa invite code về đây (tab Members chỉ show list).
3. Tab Members trailing: đổi 2 plain-text action thành **overflow menu (3-dot icon)** — tiết kiệm không gian, role pill được thở.
4. Pending request: box riêng màu warning soft, có CTA "Xem tất cả" nếu >3 — hiện tại `pendingRequests.map` render toàn bộ, tràn nếu 10+.
5. Phá layout: Invite banner dùng card chéo (skew -1°) hoặc border-radius bất đối xứng (top-left 24, bottom-right 8) → signature element.

---

## 6. Component Architecture

### Ưu
- Tách [TripsTab](src/components/group/TripsTab.tsx), [MembersTab](src/components/group/MembersTab.tsx), [GroupSettingsTab](src/components/group/GroupSettingsTab.tsx) — đúng quy tắc CLAUDE.md (screens >300 dòng phải tách).
- `React.memo` cho mọi sub-tab — render-efficient.
- Callbacks truyền qua props, không gọi store trực tiếp trong sub-components — đúng quy ước.
- `ConfirmDialog` reuse cho 4 flow (change role, kick, approve, reject, delete group) — DRY.

### Khuyết
- **State confirm tập trung ở parent quá nặng**: [groups/[id].tsx:60-201](src/app/(main)/groups/[id].tsx#L60-L201) có 5 handler confirm na ná nhau (set `ConfirmState` với title/desc/onConfirm khác nhau). Có thể tạo hook `useConfirm()` trả về `confirm({ title, desc, destructive, onConfirm })` — gọn hơn và tái dùng ở các màn khác.
- **`AppCard.trailing: ReactNode`** — API quá phóng khoáng, dẫn tới nhồi nhét (xem tab Members). Nên thêm variant `trailingActions: { label, onPress, tone }[]` để ép kỷ luật.
- `getChangeRoleColor` ở [MembersTab.tsx:55-59](src/components/group/MembersTab.tsx#L55-L59) — logic color inline, nên chuyển về token hoặc helper.
- `ROLE_LABELS` định nghĩa **cả ở parent lẫn ở MembersTab** ([groups/[id].tsx:24-28](src/app/(main)/groups/[id].tsx#L24-L28) + [MembersTab.tsx:13-17](src/components/group/MembersTab.tsx#L13-L17)) — duplicate, dễ lệch khi thêm role.

### Gợi ý
1. Tạo `src/hooks/useConfirm.ts` bọc toàn bộ flow confirm dialog.
2. Hoist `ROLE_LABELS` + `Role` type vào `src/types/roles.ts`.
3. `AppCard`: thêm `actions` prop (mảng) thay cho `trailing` cho use-case action list.

---

## 7. Accessibility

### Ưu
- `accessibilityRole="tablist" / "tab"` + `accessibilityState={{ selected }}` ở SectionTabs — chuẩn.
- `accessibilityLabel` có trên tất cả Pressable ([MembersTab.tsx:75, 90, 141, 148](src/components/group/MembersTab.tsx)).
- `hitSlop: 8` cho mọi text button nhỏ — đúng.

### Khuyết
- **Text button 12px không có visual affordance**: "Hạ quyền / Lên admin / Xóa / Đóng / Mở lại / Duyệt / Từ chối" đều là plain text chỉ khác màu. Với người dùng lớn tuổi hoặc accessibility service, không rõ đây là button. Screen reader đọc được (nhờ role) nhưng **visual affordance kém**.
- **State disabled không rõ ràng**: ở [MembersTab.tsx:73-83](src/components/group/MembersTab.tsx#L73-L83), khi `hasAdmin && role === 'member'` → màu chuyển sang `c.divider` (#FBCFE8), **nhưng `disabled` prop chỉ áp cho Pressable, text vẫn click-visible và không có icon/opacity giảm**. Người dùng bấm sẽ không thấy phản hồi → confusion.
- **Contrast**: role pill với background `color + '22'` (13% alpha) trên `c.surface` — `c.warning` text `#F59E0B` với bg `#F59E0B22` ≈ pastel — contrast ratio ước tính ~3.2:1, **dưới chuẩn WCAG AA** cho text 12px.
- Badge đỏ (danger) ở tab Members: ký tự trắng 10px trên `#E11D48` — OK ratio ~5:1 nhưng 10px là nhỏ — cân nhắc 11px.
- Chưa thấy `accessibilityLabel` cho toàn bộ card trong Trips/Members khi chứa summary (đã có cho trường hợp subtitle trong AppCard — OK).

### Gợi ý
1. Đổi các text-only action thành Button/IconButton hoặc text có underline + icon prefix.
2. Khi disabled: thêm `opacity: 0.4` + bỏ nhân hậu `Pressable` hoàn toàn.
3. Tăng độ đặc của role pill fill: `color + '33'` (20%) và text dùng `color` shade đậm hơn (vd. `warning` text dùng `#92400E` trên `#F59E0B33`).
4. Audit contrast với axe-like tool (có thể dùng `react-native-a11y`).

---

## 8. Chi tiết từng tab

### 8.1 Tab "Chuyến đi" (TripsTab)

| Vấn đề | Vị trí | Priority |
|---|---|---|
| Empty state không có CTA tạo chuyến | [TripsTab.tsx:115](src/components/group/TripsTab.tsx#L115) | **Cao** — user mới không biết làm gì tiếp. |
| Nút "Đóng / Mở lại" là plain text, dễ nhầm là status label thay vì action | [TripsTab.tsx:70-72](src/components/group/TripsTab.tsx#L70-L72) | Cao |
| Subtitle format `"Du lịch · Đang mở"` — trạng thái trộn chung với type, không có badge màu | [TripsTab.tsx:59](src/components/group/TripsTab.tsx#L59) | Trung |
| Form inline không có close affordance khác ngoài bấm lại "Hủy" ở xa | — | Thấp |
| Không có sort/filter (theo status/type) — khi nhiều chuyến sẽ khó tìm | — | Thấp |

**Gợi ý**: Empty state truyền `action={{ label: 'Tạo chuyến đầu tiên', onPress: () => setShowForm(true) }}`. Trạng thái chuyến thành pill nhỏ tone success/muted cạnh title.

### 8.2 Tab "Thành viên" (MembersTab)

| Vấn đề | Vị trí | Priority |
|---|---|---|
| Gradient banner invite quá nhạt (pink-50 → pink-100) — không tạo contrast | [MembersTab.tsx:111](src/components/group/MembersTab.tsx#L111) | **Cao** |
| Trailing nhồi role pill + 2 text action — mis-tap | [MembersTab.tsx:66-98](src/components/group/MembersTab.tsx#L66-L98) | **Cao** |
| Pending request xen giữa list, không nổi | [MembersTab.tsx:125-159](src/components/group/MembersTab.tsx#L125-L159) | Trung |
| Thành viên ảo chỉ khác nhau bằng `(ảo)` hậu tố — không có visual cue (icon/badge) | [MembersTab.tsx:63](src/components/group/MembersTab.tsx#L63) | Trung |
| Disabled state cho "Lên admin" dùng `divider` color — vẫn click được | [MembersTab.tsx:57-59](src/components/group/MembersTab.tsx#L57-L59) | Trung |
| Invite code `letterSpacing: 2` đẹp nhưng nếu code dài (>8 ký tự) có thể tràn | [MembersTab.tsx:199](src/components/group/MembersTab.tsx#L199) | Thấp |

**Gợi ý**: chuyển 2 action thành 3-dot menu, thành viên ảo đánh dấu bằng `Sparkles` icon + viền dashed, pending requests thu gọn thành card ribbon `pink-100` ở trên cùng với count badge + "Xem".

### 8.3 Tab "Cài đặt" (GroupSettingsTab)

| Vấn đề | Vị trí | Priority |
|---|---|---|
| Nội dung quá thiếu — chỉ 3 hàng số liệu + nút xóa | [GroupSettingsTab.tsx:22-44](src/components/group/GroupSettingsTab.tsx#L22-L44) | **Rất cao** |
| Không có "Vùng nguy hiểm" wrapper — nút Xóa nhóm nằm trần | [GroupSettingsTab.tsx:40-44](src/components/group/GroupSettingsTab.tsx#L40-L44) | Cao |
| Không có cách đổi tên / avatar nhóm | — | Cao |
| Không có cách rời nhóm (cho member) — nhưng tab này `hidden: !isAdmin` → member không có đường rời qua UI | [groups/[id].tsx:234](src/app/(main)/groups/[id].tsx#L234) | **Cao** (UX hole) |
| Divider giữa các info row dùng `c.divider` → vô hình trên pink surface | [GroupSettingsTab.tsx:28, 33](src/components/group/GroupSettingsTab.tsx#L28) | Trung |

**Gợi ý**:
- Tách 3 section: **Thông tin nhóm** (avatar + tên editable), **Mời & liên kết** (invite code + share + revoke), **Vùng nguy hiểm** (border-left danger, "Rời nhóm" cho member, "Xóa nhóm" cho admin). Khi có Transfer Admin thì thêm nút chuyển quyền bên admin.
- Trường hợp `!isAdmin` vẫn cần tab Settings (rút gọn) — đừng ẩn hoàn toàn.

---

## 9. Action Items (theo ưu tiên)

### P0 — phải làm sớm
1. **Bổ sung Group Hero Header** (avatar + tên nhóm display font + 3 stat) hiển thị trên mọi tab.
2. **Tab Settings**: thêm editable tên nhóm, section Invite, section Vùng nguy hiểm; đừng ẩn tab cho member — cần đường "Rời nhóm".
3. **MembersTab trailing**: gom action vào 3-dot overflow menu.
4. **Empty state TripsTab**: thêm CTA tạo chuyến.
5. **Banner invite**: đổi sang gradient `primaryStrong → warmAccent` + text inverse + shimmer nhẹ.

### P1 — ảnh hưởng nhận diện
6. Pair BeVietnamPro với 1 display font cho heading; custom `Stack.Screen` title.
7. Sửa divider light/dark cho contrast rõ (opacity 0.08 của foreground là an toàn).
8. Đổi `warning` khỏi amber sang peach/terracotta trong family ấm.
9. Thêm stagger reveal khi list render lần đầu (40ms/cell).

### P2 — polish
10. `useConfirm()` hook + hoist `ROLE_LABELS` / `Role` type.
11. `AppCard` thêm `actions` API ép kỷ luật.
12. Visual cue cho thành viên ảo (icon `Sparkles`, viền dashed).
13. Trạng thái chuyến thành pill màu thay vì text trộn subtitle.
14. Kiểm tra contrast role pill ở warning/primary/success (cần ≥4.5:1 với text 12px).

---

## 10. Kết luận

Fair Pay có một nền kỹ thuật RN rất tốt: hệ thống token rõ, theme 2 chế độ, motion cao cấp, accessibility cơ bản đầy đủ, architecture tách tab hợp lý. Palette Sakura là quyết định đúng — khác biệt ngay từ ấn tượng đầu.

Nhưng riêng **màn Group đang đánh mất cơ hội showcase bản sắc đó**: không có hero, tab Settings bỏ trống, banner invite "hiền" quá, mọi action quy về text 12px na ná nhau. Chỉ cần xử lý P0 + P1 ở trên, màn này sẽ từ "list CRUD an toàn" trở thành "màn nhóm có personality Sakura rõ rệt".

**Điểm tổng: B−. Mục tiêu sau khi fix P0–P1: A−.**
