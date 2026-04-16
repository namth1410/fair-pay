# FRONTEND-REVIEW.md — Fair Pay (SplitVN)

> **Ngày đánh giá:** 2026-04-16
> **Phiên bản:** React Native (Expo 55) + HeroUI Native + Uniwind
> **Phạm vi:** Toàn bộ UI/UX — 6 màn hình, 18+ components, theme system

---

## Bảng điểm tổng quan

| Hạng mục | Điểm | Ghi chú |
|---|---|---|
| **Typography** | A- | Be Vietnam Pro chọn chuẩn cho tiếng Việt; hierarchy rõ ràng, thiếu font display cho hero |
| **Color & Theme** | A | Sakura palette nhất quán, semantic tokens tốt, dark mode hoàn chỉnh |
| **Motion & Animation** | B+ | Staggered entrance và spring physics tốt; thiếu micro-interaction ở list/tab |
| **Layout & Spacing** | B+ | Nhất quán, nhưng form phức tạp (ExpensesTab) bị dồn nén; hero card lặp pattern |
| **Component Architecture** | A | Tách biệt rõ ràng, compound pattern, React.memo hợp lý |
| **Accessibility** | A- | Labels, roles, liveRegion đầy đủ; thiếu focus management trên form |
| **UX Flow & Interaction** | B | Luồng chính mượt; long-press delete khó khám phá; split form cần cải thiện |
| **Visual Identity** | A- | Sakura aesthetic độc đáo, Avatar gradient sáng tạo; cần điểm nhấn mạnh hơn |
| **Tổng điểm** | **B+/A-** | Nền tảng vững, cần polish ở form UX và micro-interaction |

---

## 1. Typography

### Điểm mạnh

- **Be Vietnam Pro** là lựa chọn xuất sắc cho ứng dụng tiếng Việt — hỗ trợ dấu tốt, đọc rõ ở mọi kích thước. Đây không phải font mặc định hệ thống, tạo bản sắc riêng.
- **Hệ thống variant** trong [AppText.tsx](src/components/ui/AppText.tsx) rất chặt chẽ: 7 variant (display → label) với fontSize, lineHeight, letterSpacing và default weight được tính toán kỹ.
- **Tabular numerals** trên [Money.tsx](src/components/ui/Money.tsx:117) (`fontVariant: ['tabular-nums']`) đảm bảo số tiền không nhảy khi giá trị thay đổi — chi tiết nhỏ nhưng quan trọng cho app tài chính.
- **Letter spacing** phân hóa tốt: display (-0.4) tight hơn cho headline, label (+0.6) rộng hơn cho uppercase text.

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| Gap 4px giữa các input quá hẹp | [login.tsx:160](src/app/(auth)/login.tsx#L160) `gap: 4` | Trung bình | Tăng lên `gap: 12` hoặc `gap: 14` để form thoáng hơn, giảm cảm giác dồn nén |
| Hero money và label thiếu contrast hierarchy | [index.tsx:94](src/app/(main)/index.tsx#L94) | Nhẹ | Label "Bạn đang nợ" nên dùng `variant="caption"` thay vì `label` để phân biệt rõ hơn với footnote bên dưới |
| Invite code letterSpacing cứng | [groups/[id].tsx:353](src/app/(main)/groups/[id].tsx#L353) `letterSpacing: 2` | Nhẹ | Nên dùng constant hoặc responsive spacing. Trên màn nhỏ, 6 ký tự + spacing có thể bị chật |

---

## 2. Color & Theme

### Điểm mạnh

- **Sakura palette** (hue 320-355°) tạo bản sắc cực kỳ riêng biệt cho app chia tiền — không app tài chính nào dùng pink/plum làm primary. Đây là điểm nhận diện mạnh nhất.
- **OKLCH color space** trong [global.css](global.css) cho HeroUI variables — tiên tiến, perceptually uniform, đảm bảo các tone cùng mức sáng thực sự trông cùng sáng.
- **Dual color system** hoạt động song song: CSS variables (OKLCH) cho HeroUI components + hex tokens trong [theme.ts](src/config/theme.ts) cho StyleSheet. Cả hai đều đồng bộ về mặt thị giác.
- **Semantic colors** nhất quán xuyên suốt: `success` (emerald) cho "được nợ/dương", `danger` (rose) cho "đang nợ/âm", `warning` (amber) cho pending/owner role. Không có chỗ nào dùng sai ngữ nghĩa.
- **Soft variants** (`accentSoft`, `successSoft`, `dangerSoft`) cho badge/banner backgrounds — không bao giờ dùng primary color ở full opacity làm nền, tránh chói mắt.
- **Dark mode** không chỉ đảo màu mà giảm chroma thực sự (0.72x) để pink không chói trên nền plum đậm. Shadow system cũng thay đổi (inset glow thay vì drop shadow).
- **ThemeTransitionOverlay** ([ThemeTransitionOverlay.tsx](src/components/common/ThemeTransitionOverlay.tsx)) — crossfade animation khi chuyển theme là detail rất cao cấp, tránh flash trắng/đen.

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| `inverse` tone hardcode `#FFFFFF` | [AppText.tsx:56](src/components/ui/AppText.tsx#L56) | Nhẹ | Nên dùng token (VD: `c.background`) để hoạt động đúng nếu tương lai có theme sáng nền không-trắng |
| Role pill opacity bằng string concat | [groups/[id].tsx:184](src/app/(main)/groups/[id].tsx#L184) `roleColor[role] + '22'` | Nhẹ | Dùng `rgba()` parse hoặc tạo soft variant cho role colors để tránh breakage nếu color không phải hex 6-digit |
| Hero gradient lặp code 3 lần | [index.tsx](src/app/(main)/index.tsx), [groups/[id].tsx](src/app/(main)/groups/[id].tsx), [trips/[id].tsx](src/app/(main)/trips/[id].tsx) | Trung bình | Tạo component `GradientHero` để tái sử dụng SVG gradient pattern |

---

## 3. Motion & Animation

### Điểm mạnh

- **AnimatedEntrance** ([AnimatedEntrance.tsx](src/components/ui/AnimatedEntrance.tsx)) với staggered delays (0, 80, 150, 220ms) tạo hiệu ứng "cascade" dễ chịu trên login/register — người dùng cảm nhận được sự "xây dựng" từng phần.
- **Spring physics** trên AppCard (damping: 18, stiffness: 300) và SectionTabs (damping: 18, stiffness: 220) cho cảm giác "sống" — card co lại 0.97x khi nhấn, tab indicator trượt mượt.
- **Money animation** dùng `withTiming` 450ms với worklet-safe formatter — số chạy mượt mà không re-render React tree. Đây là optimization level cao.
- **FormReveal** dùng `FadeInDown.springify()` — form "nảy" nhẹ khi xuất hiện, `FadeOutUp` khi đóng. Tạo cảm giác spatial (form đến từ trên, đi lên trên).

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| FlatList items không có entering animation | [index.tsx:130](src/app/(main)/index.tsx#L130) renderGroup | Trung bình | `AnimatedEntrance` wrap mỗi item tốt, nhưng khi scroll xuống items mới không animate. Cân nhắc `FadeInRight` hoặc `SlideInRight` cho items mới load |
| Tab content không có transition | [groups/[id].tsx:281](src/app/(main)/groups/[id].tsx#L281) | Trung bình | Chuyển tab chỉ swap content tức thì, không có fade/slide. Dùng `FadeIn.duration(150)` cho tab content wrapper sẽ mượt hơn |
| BalancesTab thiếu animation | [BalancesTab.tsx](src/components/trip/BalancesTab.tsx) | Nhẹ | Không có entrance animation nào. Balance cards nên stagger entrance tương tự home screen |
| HistoryTab thiếu animation | [HistoryTab.tsx](src/components/trip/HistoryTab.tsx) | Nhẹ | Hoàn toàn static, không animation. Nên thêm ít nhất FadeIn cho list |
| Không có haptic feedback | Toàn app | Nhẹ | Thêm `Haptics.impactAsync(Light)` khi press card, toggle switch, submit form. Expo Haptics đã có sẵn |

---

## 4. Layout & Spacing

### Điểm mạnh

- **Spacing system** nhất quán: `paddingHorizontal: 16` cho mọi list, `14px` cho card padding, `24px` cho section padding trên auth screens. Không có magic numbers ngẫu nhiên.
- **Hero card** với SVG gradient là pattern mạnh — tạo focal point rõ ràng trên mỗi screen chính (home → debt summary, trip → total expenses).
- **ListSkeleton** match chính xác geometry của AppCard — 40x40 avatar circle, 60% title width, 40% subtitle width. User không bị "layout shift" khi data load xong.
- **Touch targets** đạt chuẩn 44px minimum: header buttons (`minWidth: 44, minHeight: 44`), SettingRow (`minHeight: 44`), hitSlop 8px trên text buttons.
- **EmptyState** layout centered đẹp với halo effect — không chỉ là text trống mà có visual delight.

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| ExpensesTab form quá dài trong FormReveal | [ExpensesTab.tsx:159-258](src/components/trip/ExpensesTab.tsx#L159-L258) | Cao | Form có 6+ fields + split options trong một ScrollView lồng FormReveal. Trên màn nhỏ, user phải scroll nhiều. Cân nhắc tách thành multi-step wizard hoặc dùng BottomSheet full-screen |
| Inline styles rải rác | [groups/[id].tsx:349](src/app/(main)/groups/[id].tsx#L349) `style={{ flex: 1 }}` | Nhẹ | Nhiều chỗ dùng inline object style (`{ flex: 1 }`, `{ marginTop: 4 }`) — tạo object mới mỗi render. Nên chuyển vào StyleSheet |
| Members tab pending section dùng inline margin | [groups/[id].tsx:363](src/app/(main)/groups/[id].tsx#L363) `style={{ marginHorizontal: 16, marginBottom: 8 }}` | Nhẹ | Chuyển vào StyleSheet cho nhất quán |
| SettlementTab không có phân cách visual rõ | [SettlementTab.tsx:89](src/components/trip/SettlementTab.tsx#L89) | Trung bình | "Đề xuất quyết toán" và "Thanh toán thực tế" chỉ cách nhau bằng `marginBottom: 24`. Cần divider hoặc section header nổi bật hơn |

---

## 5. Component Architecture

### Điểm mạnh

- **Phân lớp rõ ràng:** UI primitives (`AppText`, `AppCard`, `Money`) → Domain components (`ExpensesTab`, `BalancesTab`) → Screen components. Không có component nào vượt trách nhiệm.
- **React.memo** trên tất cả trip tab components — đúng pattern vì chúng nhận data qua props, không gọi store trực tiếp. Tránh re-render khi tab khác thay đổi state.
- **useAppTheme() single hook** — gọi `useUniwind()` đúng 1 lần, tránh multiple context reads. Destructuring `{ isDark, ...c }` sạch sẽ.
- **Compound component pattern** từ HeroUI (VD: `Button.Label`, `BottomSheet.Content`) được sử dụng đúng cách xuyên suốt.
- **Avatar** dùng FNV-1a hash → deterministic gradient — cùng một user luôn có cùng màu, không cần lưu avatar color vào DB. Sáng tạo và hiệu quả.
- **ChipPicker** generic với `<T extends string>` — reusable cho category, member, split type mà type-safe.

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| RolePill inline component | [groups/[id].tsx:183-189](src/app/(main)/groups/[id].tsx#L183-L189) | Nhẹ | Đang define bên trong render function → tạo mới mỗi render. Tách ra thành separate component hoặc đưa ra ngoài screen function |
| Hero gradient SVG lặp lại | 3 screens | Trung bình | Tạo `<GradientBanner>` component nhận `fromColor`, `toColor`, `children` |
| BalancesTab FlatList trick | [BalancesTab.tsx:36-71](src/components/trip/BalancesTab.tsx#L36-L71) | Nhẹ | Dùng FlatList nhưng `renderItem={() => null}` và đặt toàn bộ nội dung vào `ListHeaderComponent`. Nên chuyển sang ScrollView thuần cho rõ ý đồ |
| GroupDetailScreen quá dài (~488 dòng) | [groups/[id].tsx](src/app/(main)/groups/[id].tsx) | Trung bình | Đã tách trip tabs nhưng chưa tách group tabs. Nên tạo `TripsTab.tsx`, `MembersTab.tsx`, `GroupSettingsTab.tsx` tương tự pattern trip |

---

## 6. Accessibility

### Điểm mạnh

- **accessibilityLabel** trên mọi input field — screen reader đọc được "Email", "Mật khẩu", "Số tiền", "Tỷ lệ {tên}" thay vì chỉ placeholder.
- **accessibilityRole** đúng ngữ nghĩa: `"button"` cho Pressable, `"radio"` cho ChipPicker, `"switch"` cho SettingRow, `"tab"` cho SectionTabs, `"alert"` cho OfflineBanner, `"progressbar"` cho LoadingScreen.
- **accessibilityLiveRegion="polite"** trên OfflineBanner — screen reader tự announce khi mất mạng.
- **accessibilityState** chính xác: `{ selected }` cho radio/tab, `{ checked }` cho switch.
- **Compound labels** trên AppCard: `subtitle ? \`${title}. ${subtitle}\` : title` — screen reader đọc đầy đủ thông tin card.
- **Money component** có label: `\`${sign}${formatAmount(value)} đồng\`` — screen reader đọc "120.000 đồng" thay vì "1-2-0-0-0-0".

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| Long-press delete không có visual hint | [ExpensesTab.tsx:267](src/components/trip/ExpensesTab.tsx#L267), [SettlementTab.tsx:154](src/components/trip/SettlementTab.tsx#L154) | Cao | Không có UI nào cho biết card có thể long-press để xóa. Accessibility issue: VoiceOver users không biết action này tồn tại. Thêm `accessibilityHint="Nhấn giữ để xóa"` hoặc thêm swipe-to-delete |
| Form validation không announce lỗi | [login.tsx:99](src/app/(auth)/login.tsx#L99) | Trung bình | Error box xuất hiện nhưng screen reader không tự đọc. Thêm `accessibilityLiveRegion="assertive"` trên error container |
| SectionTabs thiếu tablist role | [SectionTabs.tsx:62](src/components/ui/SectionTabs.tsx#L62) | Nhẹ | Container `<View>` nên có `accessibilityRole="tablist"` |
| Split input thiếu group description | [ExpensesTab.tsx:184-214](src/components/trip/ExpensesTab.tsx#L184-L214) | Nhẹ | Có label per-input nhưng thiếu group-level description cho ratio section |

---

## 7. UX Flow & Interaction

### Điểm mạnh

- **Auth flow** mượt: staggered entrance → fill form → submit → auto redirect. Validation inline rõ ràng.
- **Home screen** hierarchy tốt: Hero debt card (tổng quan) → Group list (chi tiết). User biết ngay tình trạng tài chính.
- **Pull-to-refresh** trên FlatList với `tintColor` match theme — detail nhỏ nhưng polished.
- **Form progressive disclosure**: "Tạo chuyến" button → FormReveal → fill → submit → form tự đóng. Không overload screen khi không cần.
- **Toast notifications** cho errors trong CreateJoinSheet — không blocking, không mất context.
- **Balance color coding**: Left border xanh/đỏ trên card + số dư signed + tone color — triple encoding giúp đọc nhanh ai nợ ai.
- **Settlement tab preview box** hiện số dư hiện tại khi chọn from/to — context rất hữu ích khi ghi nhận thanh toán.

### Cần cải thiện

| Vấn đề | Vị trí | Mức độ | Đề xuất |
|---|---|---|---|
| Delete chỉ qua long-press | ExpensesTab, SettlementTab | **Cao** | Long-press là pattern ẩn — nhiều user không biết. Thêm swipe-to-delete (react-native-gesture-handler `Swipeable`) hoặc trailing icon button. Đây là vấn đề UX quan trọng nhất |
| Expense form quá phức tạp | [ExpensesTab.tsx:159-258](src/components/trip/ExpensesTab.tsx#L159-L258) | **Cao** | 8+ fields trong một form scroll. Ratio/custom split thêm N input nữa (1 per member). Cân nhắc: (1) multi-step wizard, (2) mặc định equal split + "Tùy chỉnh" mở full-screen modal, (3) bottom sheet riêng cho form |
| Không có confirmation sau tạo expense | ExpensesTab | Trung bình | Form đóng im lặng sau submit thành công. Cần toast success hoặc highlight animation trên expense mới |
| Member picker khó dùng khi >5 người | [ExpensesTab.tsx:167](src/components/trip/ExpensesTab.tsx#L167) | Trung bình | ChipPicker wrap horizontally — với 8+ members, chips tràn xuống nhiều dòng. Cân nhắc dropdown hoặc horizontal ScrollView |
| Không có undo cho delete | Toàn app | Trung bình | Delete qua Alert là destructive + không undo. Cân nhắc "soft delete" với undo snackbar (3 giây) |
| HistoryTab thông tin quá ít | [HistoryTab.tsx](src/components/trip/HistoryTab.tsx) | Nhẹ | Chỉ hiện "actor — action" + timestamp. Thiếu detail (VD: "Nam xóa khoản chi 'Bún bò' 150.000₫"). `before_data`/`after_data` trong audit log có thể dùng |
| Không có search/filter | Toàn app | Nhẹ | Khi nhóm có nhiều expenses/members, không có cách filter. Chưa critical nhưng sẽ cần khi scale |

---

## 8. Đánh giá theo từng màn hình

### 8.1 Login & Register

| Tiêu chí | Điểm | Chi tiết |
|---|---|---|
| Visual | A | BrandDecoration blobs + Wordmark SVG gradient tạo identity mạnh |
| Layout | B+ | Gap 4px quá hẹp giữa inputs; nên 12-14px |
| Interaction | A- | Staggered entrance đẹp; thiếu "Quên mật khẩu?" link |
| Validation | B+ | Client-side basic; lỗi hiện tốt nhưng field-level error chỉ work khi chưa fill email |

**Ghi chú:** Error logic ở [login.tsx:93-96](src/app/(auth)/login.tsx#L93-L96) có quirk — error field-level chỉ hiện khi `!email` hoặc `email && !password`. Nếu cả hai có giá trị nhưng sai format thì error hiện trong box riêng. Behavior hơi inconsistent.

### 8.2 Home Screen (Danh sách nhóm)

| Tiêu chí | Điểm | Chi tiết |
|---|---|---|
| Visual | A | Hero debt card gradient đẹp, 3 state variants rõ ràng |
| Layout | A | Clean hierarchy: hero → banner → list |
| Interaction | A | Pull-to-refresh, staggered list entrance, smooth navigation |
| Empty state | A | Halo effect + icon + CTA button |

**Highlight:** Settled state ("Đã thanh toán đầy đủ") vẫn hiện hero card thay vì ẩn — design decision đúng, tránh layout jump.

### 8.3 Group Detail

| Tiêu chí | Điểm | Chi tiết |
|---|---|---|
| Visual | A- | Tab system animated, invite banner gradient, role pills |
| Layout | B+ | Tốt nhưng screen file quá dài (488 dòng), cần tách |
| Interaction | B+ | Tab switch instant (thiếu transition), admin actions rõ ràng |
| Role-based UI | A | Settings tab hidden cho non-admin, actions disabled cho non-owner |

**Ghi chú:** Invite code display (`letterSpacing: 2`) trực quan tốt. Share button (Share2 icon) ở vị trí đúng.

### 8.4 Trip Detail + Tabs

| Tiêu chí | Điểm | Chi tiết |
|---|---|---|
| Visual | A- | Hero summary + 4 tab system hoạt động tốt |
| Expenses Tab | B | Form phức tạp nhất app; split visualization tốt nhưng overwhelm |
| Balances Tab | B+ | Export button hữu ích; summary card đẹp; balance cards clear |
| Settlement Tab | A- | Preview box là UX win; from/to color differentiation (pink vs green) thông minh |
| History Tab | C+ | Quá basic — chỉ text cards, không grouping, không detail |

---

## 9. Visual Identity & Brand

### Điểm mạnh

- **Sakura aesthetic** xuyên suốt — từ auth screen blobs đến avatar gradient đều trong pink spectrum 320-355°. Không app chia tiền nào trông giống.
- **Wordmark** "Fair · Pay" với gradient dot là touch tinh tế — separating dot có gradient từ primaryStrong → warmAccent.
- **Avatar system** deterministic gradient thay vì random hoặc boring initials-on-solid — mỗi user có "bản sắc visual" riêng trong pink spectrum.
- **App slogan** "Chia tiền · Không chia rẽ" — wordplay tiếng Việt tốt, hiện trên login screen.

### Cần cải thiện

| Vấn đề | Mức độ | Đề xuất |
|---|---|---|
| Không có app icon/splash screen review | Nhẹ | `assets/logo.svg` tồn tại nhưng chưa thấy integration |
| Hero cards cùng pattern trên mọi screen | Nhẹ | Gradient rect SVG lặp lại. Cân nhắc variation: radial gradient, pattern overlay, hoặc icon accent để phân biệt context |
| CategoryIcon colors hardcode | Nhẹ | Travel: `#F9A8D4`, meal: `#FDA4AF` — đều trong pink range, khó phân biệt nhau. Cần spread hue rộng hơn |

---

## 10. Hạng mục ưu tiên sửa

### P0 — Critical UX (sửa ngay)

1. **Thêm cách delete ngoài long-press** — Swipe-to-delete hoặc trailing delete icon trên expense/payment cards. Đây là action phổ biến nhưng hoàn toàn ẩn.
2. **Tối ưu expense creation form** — Form hiện tại quá dài. Tách thành 2 bước: (1) Info cơ bản (title, amount, category, payer), (2) Split options. Hoặc dùng full-screen modal.

### P1 — UX cải thiện (sprint sau)

3. **Success feedback sau submit** — Toast "Đã thêm khoản chi" sau tạo expense/payment thành công.
4. **Tab content transition** — Thêm `FadeIn.duration(150)` khi switch tab để tránh instant swap.
5. **Error announce cho screen reader** — `accessibilityLiveRegion="assertive"` trên error containers.
6. **Tách GroupDetailScreen** thành sub-tab components (~488 dòng → ~150 dòng/file).

### P2 — Polish (khi có thời gian)

7. **Haptic feedback** — `Haptics.impactAsync(ImpactFeedbackStyle.Light)` trên card press, form submit, toggle switch.
8. **Tạo GradientHero component** — DRY up SVG gradient pattern đang lặp 3 lần.
9. **HistoryTab enrichment** — Hiện thêm detail từ audit log (`before_data`/`after_data`), group by date.
10. **Form gap 4px → 12px** trên auth screens.
11. **Stagger animation cho BalancesTab và HistoryTab** cards.

### P3 — Tương lai

12. **Search/filter** cho expenses khi list dài.
13. **Multi-step wizard** cho complex forms (expense split).
14. **Horizontal scroll** cho ChipPicker khi >6 options.
15. **Undo snackbar** thay vì Alert confirm cho delete actions.

---

## Kết luận

Fair Pay có nền tảng UI/UX vững chắc với identity visual Sakura độc đáo, theme system chuyên nghiệp (OKLCH + dual palettes + crossfade transition), và component architecture sạch sẽ. Accessibility đạt mức trên trung bình cho React Native app. Điểm yếu chính tập trung ở **form UX** (expense form quá phức tạp, long-press delete ẩn) và **thiếu micro-interaction** ở một số khu vực (tab transitions, success feedback, haptics). Các vấn đề P0 nên được ưu tiên sửa để cải thiện usability đáng kể mà không cần redesign lớn.
