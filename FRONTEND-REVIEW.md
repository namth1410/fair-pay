# Frontend Review — Fair Pay

**Ngày đánh giá:** 16/04/2026
**Stack:** React Native 0.83 · Expo 55 · HeroUI Native 1.0 · Uniwind (Tailwind v4) · Reanimated 4 · Zustand 5

---

## Bảng điểm tổng quan

| Hạng mục                  | Điểm | Ghi chú ngắn                                                       |
| ------------------------- | :--: | ------------------------------------------------------------------- |
| **Typography**            |  A-  | Be Vietnam Pro phù hợp hoàn hảo; hệ thống variant rõ ràng          |
| **Color & Theme**         |  A   | Sakura palette độc đáo, OKLCH chuyên nghiệp, dark mode hoàn chỉnh  |
| **Motion & Animation**    |  B+  | Spring physics tốt, nhưng thiếu gesture-driven & page transitions   |
| **Layout & Composition**  |  B+  | Cấu trúc card-based nhất quán; hero sections đẹp; ít bất ngờ       |
| **Component Architecture**|  A-  | Tách tab/section hợp lý, React.memo đúng chỗ; vài điểm cải thiện   |
| **Accessibility**         |  B+  | Roles, labels, live regions đầy đủ; thiếu focus management & a11y testing |
| **Visual Polish**         |  A-  | Gradient avatars, SVG halos, brand decoration — chi tiết tinh tế    |

**Điểm tổng: A- (Rất tốt)**

---

## 1. Typography

### Đánh giá: A-

**Điểm mạnh:**

- **Be Vietnam Pro** — lựa chọn xuất sắc cho ứng dụng Việt Nam. Font hỗ trợ dấu tiếng Việt hoàn hảo, có tính cách riêng (không phải generic sans-serif như Inter/Roboto), và có đủ 4 weights (400–700) để tạo hierarchy rõ ràng.
- Hệ thống `AppText` với 7 variants (display → label) tạo type scale nhất quán. `letterSpacing: -0.4` cho display và `-0.2` cho title là tight tracking hợp lý cho tiêu đề lớn.
- `label` variant với `textTransform: 'uppercase'` + `letterSpacing: 0.6` tạo section headers phong cách chuyên nghiệp (ví dụ: "HỒ SƠ", "THÔNG BÁO" trong SettingsSheet).
- `fontVariant: ['tabular-nums']` trên Money component — chi tiết nhỏ nhưng quan trọng, đảm bảo số tiền không nhảy layout khi animate.
- Worklet-safe formatter (`formatAmount`) cho phép animated text trên UI thread mà không block JS thread.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| Không có display font riêng | — | Be Vietnam Pro phục vụ tốt cho cả display lẫn body, nhưng một display font thứ hai (ví dụ: Playfair Display cho "Fair · Pay" wordmark) sẽ tạo thêm tính cách cho brand. Hiện tại Wordmark dùng cùng Be Vietnam Pro. |
| Line-height ratio không đều | [AppText.tsx](src/components/ui/AppText.tsx#L18-L24) | `display: 38/32 = 1.19`, `body: 20/14 = 1.43`, `meta: 16/12 = 1.33`. Nên cân nhắc tỷ lệ đồng đều hơn (~1.4–1.5 cho body text). |
| Caption vs Meta quá gần | [AppText.tsx](src/components/ui/AppText.tsx#L22-L23) | `caption: 13px` vs `meta: 12px` — chênh lệch chỉ 1px, khó phân biệt trực quan. Nên gộp hoặc tách rõ hơn (11px vs 13px). |

---

## 2. Color & Theme

### Đánh giá: A

**Điểm mạnh:**

- **Sakura palette** — hồng nhạt dịu dàng, hoàn toàn khác biệt so với đa số finance app (xanh dương/xanh lá). Tạo cảm giác thân thiện, phù hợp cho nhóm bạn chia tiền.
- **Dual color system:** HSL tokens cho `StyleSheet` (qua `theme.ts`) + OKLCH variables cho Uniwind/HeroUI (`global.css`). OKLCH là perceptually-uniform — rất chuyên nghiệp cho mobile.
- **Dark theme xử lý tốt:** giảm chroma (`0.72 × chroma`) trên accent colors để không chói trên nền plum đậm. Inset shadows thay vì drop shadows. Background `#1F1018` đủ tối mà vẫn ấm.
- **Semantic color tokens đầy đủ:** `success`, `danger`, `warning` có cả base + soft variants cho cả light và dark, giúp badges/banners nhìn tự nhiên.
- **Pink-tinted shadows** (`rgba(249, 168, 212, 0.08)`) — chi tiết tinh tế, shadow "thuộc về" palette thay vì generic gray/black.
- **Theme transition overlay** ([ThemeTransitionOverlay.tsx](src/components/common/ThemeTransitionOverlay.tsx)) — crossfade 100ms in / 250ms out che giấu hard-flip rất mượt.
- **Left-border accent trên cards** dùng `success` / `danger` — tạo visual hierarchy nhanh, user scan được ai nợ / được nợ chỉ bằng màu.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| `inverse` tone hardcode `#FFFFFF` | [AppText.tsx](src/components/ui/AppText.tsx#L55) | Nên dùng token thay vì hardcode. Trên dark theme, "inverse" text vẫn là trắng — đúng cho most cases, nhưng thiếu linh hoạt nếu cần inverse trên colored backgrounds. |
| Logout icon hardcode `#FFFFFF` | [SettingsSheet.tsx](src/components/common/SettingsSheet.tsx#L239) | `<LogOut size={18} color="#FFFFFF" />` — nên dùng semantic token (ví dụ: `c.dangerForeground` hoặc danger button foreground). |
| Soft variants lặp trong dark theme | [theme.ts](src/config/theme.ts#L74-L79) | `successSoft` = `successSoftDark`, `dangerSoft` = `dangerSoftDark` — các giá trị giống nhau, tạo confusion. Nên xóa `*SoftDark` variants trong dark palette hoặc đổi mục đích. |
| BottomSheet flash on iOS khi đổi theme | [ThemeTransitionOverlay.tsx](src/components/common/ThemeTransitionOverlay.tsx#L29-L31) | Known issue (documented) — FullWindowOverlay nằm trên overlay. Xem xét `captureRef` + snapshot approach hoặc delay sheet re-render. |

---

## 3. Motion & Animation

### Đánh giá: B+

**Điểm mạnh:**

- **Spring physics thực thụ:** `damping: 18, stiffness: 300` cho card press scale, `damping: 18, stiffness: 220` cho tab indicator — cảm giác tự nhiên, không linear.
- **Staggered entrance** qua `AnimatedEntrance` — `FadeInDown` với delays tăng dần (0, 50, 100ms...), cap tại 500ms. Tạo cảm giác "xếp tầng" khi list load.
- **Animated Money** — giá trị số chạy mượt bằng `withTiming(450ms)` qua Reanimated worklet, không block JS thread.
- **Haptic feedback** phân tầng: Light (card press), Medium (swipe delete), Success (form submit) — multi-modal UX.
- **Theme crossfade** — fade in → swap → fade out che giấu hard color flip.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| Tab content chỉ có `FadeIn.duration(150)` | [trips/[id].tsx](src/app/(main)/trips/[id].tsx#L73) | Khi switch tab, content chỉ fade — thiếu slide direction (left/right theo tab order). Nên dùng `SlideInRight` / `SlideInLeft` tùy hướng chuyển tab. |
| Không có exit animation trên tab content | [trips/[id].tsx](src/app/(main)/trips/[id].tsx#L73) | `Animated.View key={tab}` mount mới mỗi lần đổi tab nhưng component cũ bị unmount ngay, không có `exiting` animation. Nên thêm `FadeOut.duration(100)` hoặc layout animation. |
| Skeleton không animate | — | `ListSkeleton` dùng static views. Nên thêm shimmer effect (pulse animation) — có thể dùng `useAnimatedStyle` với `withRepeat(withTiming(opacity, {duration: 1000}))`. |
| Thiếu gesture-driven animations | — | SwipeableCard chỉ dùng cơ bản từ `react-native-gesture-handler`. Cơ hội tốt cho drag-to-reorder expenses, pull-to-refresh custom animation, parallax scroll hero. |
| Hero card không có entering animation riêng | [index.tsx](src/app/(main)/index.tsx#L78) | `AnimatedEntrance delay={0}` trên hero — giống mọi card khác. Hero nên có animation đặc biệt hơn (scale up from 0.95 + fade, hoặc blur reveal). |
| Không có shared element transitions | — | Khi navigate từ group card → group detail, avatar/title có thể shared element transition. React Navigation 7 hỗ trợ via `sharedTransitionTag`. |

---

## 4. Layout & Spatial Composition

### Đánh giá: B+

**Điểm mạnh:**

- **Card-based design** nhất quán: `borderRadius: 14`, `padding: 14`, uniform spacing tạo rhythm dễ chịu.
- **Hero gradient sections** ([GradientHero.tsx](src/components/ui/GradientHero.tsx)) — SVG gradient diagonal tạo depth, không flat.
- **Left-border accent pattern** trên balance cards — nhanh, visual, scannable.
- **Empty states** có SVG radial gradient halos — không chỉ icon + text mà còn decorative background, tạo cảm giác "designed" thay vì placeholder.
- **Auth screen** có `BrandDecoration` — 2 radial gradient blobs (top-right + bottom-left) tạo chiều sâu, không flat.
- **ScrollShadow** wrapper trên lists — edge fade effect chuyên nghiệp.
- **Consistent margin system**: `marginHorizontal: 16` cho content, `padding: 14` cho cards, `gap: 12` cho forms.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| Layout quá an toàn / đồng nhất | Toàn bộ screens | Mọi screen đều: Hero (top) → Tabs → Scrollable list. Không có visual surprises — overlap, asymmetry, hay density variation. Phù hợp cho utility app, nhưng thiếu "memorable moments". |
| Hero section lặp lại exact cùng pattern | [index.tsx](src/app/(main)/index.tsx#L79), [trips/[id].tsx](src/app/(main)/trips/[id].tsx#L61) | Cả Home hero và Trip hero đều: `GradientHero > paddingVertical: 18 > label + Money + meta`. Nên differentiate (thêm mini chart cho trip, avatar stack cho home, etc.). |
| Spacing không theo system rõ ràng | Nhiều files | Mix: 2, 4, 8, 10, 12, 14, 16, 18, 20, 24, 28, 40px. Nên có spacing scale rõ ràng (4, 8, 12, 16, 24, 32, 48) và đặt tên (xs, sm, md, lg, xl). |
| Settings sheet quá dọc / monotone | [SettingsSheet.tsx](src/components/common/SettingsSheet.tsx) | Chỉ cards xếp dọc liên tiếp. Profile section nên nổi bật hơn (centered layout, larger avatar). |
| BalancesTab export summary box | [BalancesTab.tsx](src/components/trip/BalancesTab.tsx#L56-L62) | Box tổng chi nằm trên card list — nhìn giống thêm một card chứ không phải summary. Nên distinct hơn (gradient bg, different border radius, hoặc sticky header). |

---

## 5. Component Architecture

### Đánh giá: A-

**Điểm mạnh:**

- **Tách screen thành sub-components theo tab**: `ExpensesTab`, `BalancesTab`, `SettlementTab`, `HistoryTab` — mỗi tab là `React.memo()` component nhận data qua props, không gọi store trực tiếp. Pattern mẫu mực.
- **Single theme hook** (`useAppTheme`) gọi `useUniwind()` đúng 1 lần, trả về flat object — đơn giản, dễ destructure.
- **UI components thuần**: `AppText`, `AppCard`, `Money`, `Avatar` — không có side effects, dễ test, dễ compose.
- **HeroUI Native compound pattern**: `Button.Label`, `Dialog.Title`, `BottomSheet.Content` — đúng pattern của library.
- **Deterministic Avatar**: FNV-1a hash → gradient colors — cùng seed luôn ra cùng màu, không cần fetch/store avatar.
- **Index barrel exports** (`components/ui/index.ts`) — clean imports.
- **Error Boundary** đầy đủ với fallback UI có theme context.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| `renderHeroDebt` là function inside component | [index.tsx](src/app/(main)/index.tsx#L51-L94) | Inline render function tạo new reference mỗi render. Nên extract thành `HeroDebtCard` component riêng với `React.memo()`. |
| `renderGroupBalance` inline function | [index.tsx](src/app/(main)/index.tsx#L97-L109) | Tương tự — nên là component riêng để memo-izable. |
| `SettingsSheet` làm quá nhiều việc | [SettingsSheet.tsx](src/components/common/SettingsSheet.tsx) | Profile CRUD + notification settings + theme toggle + logout — nên tách thành `ProfileSection`, `NotificationSection`, `AppearanceSection` sub-components. |
| `AppCard` thiếu variant system | [AppCard.tsx](src/components/ui/AppCard.tsx) | Chỉ có 1 kiểu card. Nên có variants (elevated, outlined, ghost) để phân biệt visual hierarchy giữa các contexts. |
| `EmptyState` Halo component inline | [EmptyState.tsx](src/components/ui/EmptyState.tsx#L22-L44) | `Halo` function component nằm trong cùng file nhưng không memo — mỗi lần EmptyState re-render, Halo SVG cũng re-render. SVG render không cheap. Nên wrap `React.memo()`. |
| Thiếu Skeleton cho hero/tabs | — | Chỉ có `ListSkeleton` cho card lists. Hero section và tab bar hiện show content ngay hoặc empty — nên có skeleton cho full-screen loading state. |

---

## 6. Accessibility (Trợ năng)

### Đánh giá: B+

**Điểm mạnh:**

- **Semantic roles đầy đủ**: `button`, `tab`, `switch`, `text`, `image`, `alert`, `progressbar` — đúng chỗ, đúng component.
- **Compound accessibility labels**: `AppCard` tự compose `title + subtitle` thành label. Money có label `{value} đồng`.
- **`accessibilityLiveRegion="polite"`** trên OfflineBanner — screen reader auto-announce.
- **`accessibilityLiveRegion="assertive"`** trên error messages (login) — lỗi được đọc ngay.
- **Touch targets**: `minWidth: 44, minHeight: 44` trên header buttons, `hitSlop` trên small pressables.
- **`accessibilityState: { selected }`** trên tabs.
- **Error messages** trong login hiện conditional — chỉ show khi relevant field có vấn đề.

**Điểm cần cải thiện:**

| Vấn đề | File | Chi tiết |
|--------|------|----------|
| Thiếu `accessibilityRole="tablist"` | [SectionTabs.tsx](src/components/ui/SectionTabs.tsx#L63) | Container `<View style={styles.tabs}>` nên có `accessibilityRole="tablist"`. Hiện tại chỉ có `tab` trên individual items. |
| Avatar `accessibilityLabel` conditional | [Avatar.tsx](src/components/ui/Avatar.tsx#L55) | `accessibilityLabel={label ? \`Avatar ${label}\` : undefined}` — khi `label` vắng, ảnh không có alt text. Nên fallback sang seed. |
| Money animate mode accessibility | [Money.tsx](src/components/ui/Money.tsx#L100-L101) | Label đặt trên container `View` nhưng giá trị bên trong animate — screen reader có thể đọc giá trị cũ trong lúc animating. Nên dùng `accessibilityValue` dynamic. |
| Thiếu focus management sau navigation | Toàn bộ screens | Khi navigate tới screen mới, không có `accessibilityFocus` được set. Screen reader users phải tự tìm content. |
| `Wordmark` thiếu accessibility | [Wordmark.tsx](src/components/brand/Wordmark.tsx) | SVG logo không có `accessibilityLabel`. Nên thêm `accessibilityLabel="Fair Pay"` hoặc `accessibilityRole="header"`. |
| Form validation không link tới field | [login.tsx](src/app/(auth)/login.tsx#L98-L108) | Error box hiện riêng, không `accessibilityLabelledBy` tới input — screen reader khó map lỗi nào thuộc field nào. |
| Không có reduced motion support | — | Animations chạy cả khi user bật "Reduce Motion" trong OS settings. Nên check `AccessibilityInfo.isReduceMotionEnabled()` hoặc Reanimated's `ReducedMotionConfig`. |

---

## 7. Đánh giá theo màn hình

### 7.1 Login / Register

| Điểm | Chi tiết |
|------|----------|
| **Tốt** | `BrandDecoration` radial blobs tạo depth. Staggered entrance mượt. `KeyboardAvoidingView` xử lý đúng per-platform. Error display conditional thông minh. |
| **Cải thiện** | Thiếu "Quên mật khẩu" link. Google button không có Google icon/logo — chỉ text. Nên thêm social icon. Register screen (không đọc chi tiết) nên validate real-time thay vì on-submit. |

### 7.2 Home (Dashboard)

| Điểm | Chi tiết |
|------|----------|
| **Tốt** | Hero debt card 3 states (settled/owed/owing) rõ ràng. Gradient từ soft color → tint đẹp. Group cards có avatar + balance + left-border accent. Pending join banner contextual. |
| **Cải thiện** | Không có search/filter groups. Không sort (alphabetical, balance, recent). Empty state action chỉ "Tạo nhóm" — thiếu "Nhập mã mời" option. `FlatList` thiếu `getItemLayout` cho performance với long lists. |

### 7.3 Group Detail

| Điểm | Chi tiết |
|------|----------|
| **Tốt** | Tab system with animated indicator. Badge count cho pending requests. Role-based UI (hide Settings tab cho non-admin). Share invite code. |
| **Cải thiện** | Không có group avatar/header hero — nhảy thẳng vào tabs. Nên có group hero section (gradient + name + member count + avatar stack). |

### 7.4 Trip Detail

| Điểm | Chi tiết |
|------|----------|
| **Tốt** | 4 tabs đầy đủ. Hero tổng chi với animated Money. Metadata row (khoản · thanh toán · người) compact. |
| **Cải thiện** | Tab switch thiếu direction animation (đã nêu ở Motion). BalancesTab "Lưu ảnh số dư" button nên nổi bật hơn — đây là killer feature nhưng hiện nhìn nhỏ. |

### 7.5 Settings Sheet

| Điểm | Chi tiết |
|------|----------|
| **Tốt** | Grouped sections rõ ràng. Dark mode toggle instant với crossfade. Profile inline edit UX tốt. |
| **Cải thiện** | Thiếu app version info ở footer. Avatar chỉ 56px trong profile — nên lớn hơn (80–96px) cho phần profile header. Logout button nên ở cuối cùng với margin lớn hơn và visual separation rõ hơn (horizontal rule hoặc danger zone border). |

---

## 8. Visual Polish & Signature Details

### Đánh giá: A-

Những chi tiết tạo nên chất lượng "designed, not generated":

- **Deterministic gradient avatars** với FNV-1a hash — mỗi user có avatar unique nhưng consistent, hue range 320-355° giữ trong pink family.
- **SVG radial gradient halos** trên empty states — 3 overlapping blobs với primary/warmAccent/accentSoft tạo organic glow.
- **BrandDecoration** — asymmetric blobs (top-right 320px + bottom-left 380px) tạo depth cho auth screens.
- **Pink-tinted shadows** — shadows dùng `rgba(249, 168, 212, ...)` và `rgba(74, 31, 56, ...)` thay vì generic black. Phần shadow "thuộc về" palette.
- **Wordmark SVG** — "Fair · Pay" với dot gradient từ `primaryStrong → warmAccent`. Tinh tế.
- **`GradientHero`** dùng SVG `preserveAspectRatio="none"` — gradient fill container bất kể aspect ratio.
- **Haptic layering** — Light/Medium/Success phân tầng theo interaction weight.

---

## 9. Hành động ưu tiên

### Ưu tiên cao (UX Impact)

1. **Thêm directional tab transitions** — `SlideInLeft`/`SlideInRight` dựa trên tab index change direction. File: [trips/[id].tsx](src/app/(main)/trips/[id].tsx#L73), [groups/[id].tsx](src/app/(main)/groups/[id].tsx).
2. **Skeleton shimmer animation** — thêm pulse/shimmer cho `ListSkeleton`. Hiện tại static placeholder nhìn như broken UI.
3. **Reduced motion support** — check `ReducedMotionConfig` từ Reanimated, disable entrance animations + money animation khi user bật Reduce Motion.
4. **`accessibilityRole="tablist"`** — thêm vào `SectionTabs` container.

### Ưu tiên trung bình (Design Quality)

5. **Differentiate hero sections** — Home hero nên khác Trip hero (thêm avatar stack, mini balance chart, hoặc illustration).
6. **Extract inline render functions** — `renderHeroDebt`, `renderGroupBalance` trong `index.tsx` → separate memoized components.
7. **Spacing scale token** — define `spacing` constant (`4, 8, 12, 16, 24, 32, 48`) và dùng throughout, thay vì magic numbers.
8. **Group detail header** — thêm hero section (gradient + group name + avatar stack) trước tabs.
9. **Login Google button** — thêm Google icon (SVG hoặc từ asset).
10. **Settings profile section** — avatar lớn hơn (80px+), centered layout cho phần profile.

### Ưu tiên thấp (Nice to Have)

11. **Shared element transitions** — avatar/title từ group list → group detail.
12. **Display font cho Wordmark** — secondary font (serif hoặc display) cho brand identity.
13. **Consolidate caption/meta variants** — gộp hoặc tách rõ hơn (11px vs 14px thay vì 12 vs 13).
14. **Group search/filter** — khi user có nhiều groups.
15. **Export button prominence** — "Lưu ảnh số dư" nên floating hoặc highlighted hơn.

---

## 10. Kết luận

Fair Pay có nền tảng design rất vững. **Sakura palette** là lựa chọn bold và thành công — tạo brand identity riêng biệt trong market finance app toàn xanh. Hệ thống **theme tokens**, **OKLCH variables**, **typography scale**, và **component architecture** đều ở mức production-grade.

Điểm cải thiện chính nằm ở **motion depth** (transitions giữa screens/tabs) và **layout variety** (hero sections hiện quá giống nhau). Về accessibility, nền tảng tốt nhưng cần reduced motion support và focus management để đạt WCAG AA.

Đây là một codebase frontend mà team có thể tự hào — clean, intentional, và có tính cách riêng.
