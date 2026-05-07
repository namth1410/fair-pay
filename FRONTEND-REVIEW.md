# Báo cáo Review Giao diện — Fair Pay

> **Phạm vi:** Toàn bộ frontend dự án Fair Pay (React Native 0.83 · Expo 55 · Reanimated 4 · Skia · HeroUI Native · Uniwind/Tailwind v4).
> **Người review:** Frontend Design Audit (skill `frontend-design`).
> **Ngày:** 2026-05-07.
> **Cách đọc:** Mỗi mục có điểm letter grade (A–F), bảng tổng hợp ở §1, chi tiết per-domain ở §2–§7, per-screen ở §8, action items ưu tiên ở §9.

---

## 1. Tóm tắt điểm số

| Hạng mục | Grade | Ghi chú ngắn |
|---|---|---|
| **Typography** | **B** | Hệ thống `AppText` 7 variants nhất quán, font Việt BeVietnamPro phù hợp; thiếu display font tương phản, hierarchy hơi phẳng. |
| **Color & Theme** | **B−** | Tokens monochrome sạch sẽ, dark/light cân bằng; "pink undertone" trong comment không khớp giá trị thực, accent thiếu signature. |
| **Motion / Animation** | **A−** | Lớp đầu tư cực mạnh (Skia shaders, BlackHole, Morph, Lightning, Confetti, BouncyDialog dragon). Có toggle reduce motion. Vài chỗ over-engineered. |
| **Layout & Spacing** | **B** | Cấu trúc rõ, gutter ổn; nhiều magic numbers (`14/16/18/22/24`) lẫn lộn, `space.ts` ít được dùng thực tế. |
| **Component Architecture** | **A−** | Phân tầng `ui / common / brand / header / skia` sạch, dùng `React.memo` + `useShallow` đúng chỗ. |
| **Accessibility** | **A−** | Hầu hết `Pressable` có role+label+state+hitSlop, có `accessibilityLiveRegion`. Icon-only buttons thiếu context. |
| **Per-screen UX** | **B+** | Hero Debt và Trip Detail đẹp ấn tượng; Settings/Presets/History hơi đơn điệu list-only. |
| **Tổng thể** | **B+** | Sản phẩm có tay nghề khá cao, vài điểm lóe sáng (HeroDebt, SkiaMeshGradient hero, GroupCarousel, BouncyDialog) đẩy tổng thể lên trên trung bình. |

---

## 2. Typography — **B**

### Điểm tốt
- **Hệ thống thống nhất**: [AppText](src/components/ui/AppText.tsx:37) có 7 variants (`display / title / subtitle / body / caption / meta / label`) với line-height và letter-spacing đặt đúng theo tỉ lệ — `display 32/38 -0.4`, `label 11/14 +0.6 uppercase`. Đây là design token đủ giàu cho 1 sản phẩm consumer.
- **Mapping weight tự động**: [AppText.tsx:27](src/components/ui/AppText.tsx:27) gắn default weight cho từng variant (display→bold, body→regular) → callsite ngắn gọn, hiếm khi phải set thủ công.
- **Font family hỗ trợ tiếng Việt**: [BeVietnamPro 4 weights](src/config/fonts.ts:3) load qua `@expo-google-fonts/be-vietnam-pro`, dấu thanh ổn định ở mọi size — đúng cho audience Việt.
- **Tabular numerals cho `Money`**: [Money.tsx:120](src/components/ui/Money.tsx:120) đặt `fontVariant: ['tabular-nums']` → cột số dư không "nhảy" khi animate. Đây là chi tiết nhỏ rất pro.
- **Animated number** worklet-safe: [Money.tsx:44](src/components/ui/Money.tsx:44) tự viết `formatAmount` worklet vì `toLocaleString` không có trên UI thread — đúng thực hành Reanimated 3+.
- **Editorial label trong HeroDebt**: [HeroDebt.tsx:288](src/components/home/HeroDebt.tsx:288) dùng `variant="label"` (uppercase, letter-spacing) cho "BẠN ĐANG ĐƯỢC NỢ" — cảm giác editorial-magazine khá hiếm trong app fintech VN.

### Điểm cần cải thiện
- **Thiếu display font tương phản**: Tất cả nhãn, headline, body đều cùng 1 family BeVietnamPro. Một sản phẩm "có tính cách" thường ghép display font khác (geometric / serif / mono) cho hero numbers. Money hero đang dùng cùng BeVietnamPro Bold → đẹp nhưng không "wow".
  - **Đề xuất**: cân nhắc 1 mono / display font cho `Money` ở variant `hero`/`display`. Ví dụ `JetBrains Mono`, `Space Mono`, hoặc `Fraunces` (serif) cho hero amount tạo signature.
- **Vietnamese uppercase + letterSpacing**: Label `tone="muted"` + `textTransform: 'uppercase'` + `letterSpacing 0.6` ([AppText.tsx:24](src/components/ui/AppText.tsx:24)) làm chữ có dấu (`HÔM NAY`, `NHÓM CỦA BẠN`) bị "tách dấu" ở 1 số font weight. Test trên Android default fallback có thể vỡ.
- **Wordmark heuristic width**: [Wordmark.tsx:24](src/components/brand/Wordmark.tsx:24) tính `fairWidth = fontSize * 4 * 0.58` — đoán width chữ. Dễ overflow nếu font fallback (Android) khác kerning. Nên dùng `Text.measure` hoặc render `<Text>` không SVG.
- **Money unit `₫` opacity 0.8**: [Money.tsx:146](src/components/ui/Money.tsx:146) — chữ ₫ mờ hơn amount → đọc không đẹp ở variant `hero`. Nên đặt full opacity, dùng size nhỏ hơn để tự nhiên giảm trọng lượng visual.
- **Không có `caption-bold` / `mono` variant**: `audit log` dùng `meta` cho timestamp, `mã mời` dùng `title bold letterSpacing 2` ([MembersTab.tsx:200](src/components/group/MembersTab.tsx:200)) — tốt nhưng lẻ tẻ; nên đưa vào hệ thống thành variant `mono` hoặc `tracking-wide`.
- **Display/title không có `fontFeatureSettings`** hoặc OpenType polish — tiết kiệm thiết kế.

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| Cân nhắc display font cho `Money.variant === 'hero'` | High | P2 |
| Đo Wordmark width thật bằng `<Text onLayout>` thay vì heuristic | Medium | P3 |
| Tăng `opacity` ký hiệu `₫` lên 1.0 ở variant hero/display | Low | P3 |
| Test render uppercase Vietnamese label trên Android default font | Medium | P2 |

---

## 3. Color & Theme — **B−**

### Điểm tốt
- **Token hoàn chỉnh light + dark**: [theme.ts](src/config/theme.ts) định nghĩa 18 token cho mỗi chế độ, gồm `successSoft / dangerSoft / accentSoft` cho fill nhẹ — cấu trúc khá đầy đủ.
- **Hook `useAppTheme` đơn giản**: [useAppTheme.ts:10](src/hooks/useAppTheme.ts:10) gọi `useUniwind` 1 lần và trả luôn `{ isDark, ...colors }` → tránh nhiều hook/render — pattern sạch.
- **Theme transition smooth**: [ThemeTransitionOverlay](src/components/common/ThemeTransitionOverlay.tsx:32) crossfade 100/250ms — che việc StyleSheet flip màu khi `Uniwind.setTheme()`. Đây là detail polish hiếm thấy.
- **Status colors có cả strong + soft**: `success #10B981` + `successSoft #D1FAE5` cho cả light/dark — đủ độ tương phản 4.5:1 cho text trên fill.
- **Inverse foreground đầy đủ**: dùng cho text trên primary button, status dot — đúng cấu trúc.

### Điểm cần cải thiện
- **"Pink undertone" trong comment không khớp giá trị**: [theme.ts:1](src/config/theme.ts:1) tự mô tả "Monochrome đen/trắng modern" nhưng `AppCard` shadow có comment _"pink undertone set via shadowColor"_ ([AppCard.tsx:106](src/components/ui/AppCard.tsx:106)) trong khi `shadowColor: c.foreground` (đen). Truyền thông trong code và visual không khớp — confusing.
- **`primarySoft = '#E4E4E7'` (zinc-200)**: hoàn toàn neutral, không có hint pink dù tên file BrandDecoration mô tả "soft pink blobs" ([BrandDecoration.tsx:7](src/components/brand/BrandDecoration.tsx:7)). Brand identity bị "trộn" giữa monochrome và pink → thiếu signature.
- **Status dùng Tailwind tiêu chuẩn**: `#10B981 / #E11D48 / #F59E0B` là Tailwind emerald/rose/amber 500. Không sai nhưng quá phổ biến → app mất 1 lớp signature.
- **Hard-coded shadow color trong `BouncyDialog`**: backdrop `'rgba(15, 8, 14, 0.55)'` ([BouncyDialog.tsx:216](src/components/ui/BouncyDialog.tsx:216)) — magic value, không qua theme; dark mode sẽ không thay đổi.
- **Dock overlay & border `rgba`**: [AppDock.tsx:204](src/components/common/AppDock.tsx:204) hard-code 4 giá trị `rgba(...)` — nên đưa vào theme tokens (`glassOverlay`, `glassBorder`, `glassIndicator`).
- **`SplashScene` dùng `#EC4899` hồng raw**: [SplashScene.tsx:54](src/components/common/SplashScene.tsx:54) — đây là pink-500. Nhưng `colors.light.primarySoft = #E4E4E7` lại neutral → splash ≠ phần còn lại của app, thiếu nhất quán brand color.
- **`HeroDebt mode === 'positive'`** tint dùng `successSoft #D1FAE5` — màu xanh mint sáng, đẹp; nhưng âm tính dùng `dangerSoft #FFE4E6` (pink rất nhạt) → trùng tone với "pink brand" mà code đang muốn duy trì → confusing visual signal.
- **Không có "warm gray" tint cho elevated surface**: `surface = #FFFFFF`, `surfaceAlt = #F1F1F2` — quá lạnh. Nhiều product chọn 1 hint warm (`#FBFAF8`) cho lift.

### Đề xuất palette signature
Hiện palette đang "an toàn" — gợi ý thử 1 trong 3 hướng (commit fully, không pha):

1. **Editorial monochrome + ink**: giữ neutral nhưng đẩy primary ink đậm hơn (`#0A0A0F`), accent dùng 1 màu dramatic (`#FF3D00` orange, hoặc `#16A085` teal cổ điển) thay vì Tailwind defaults.
2. **Soft luxury blush**: thực sự áp dụng pink undertone. `primarySoft = #FCE7F3`, `warmAccent = #BE185D`, `surface = #FFFBF7`. Phù hợp slogan "Chia tiền · Không chia rẽ".
3. **Brutalist black-on-cream**: `background = #F5F0E8`, `foreground = #0A0A0A`, `accent = #FF6B35`. Thiết kế tối giản nhưng có chất.

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| Đồng bộ comment vs giá trị (xóa "pink undertone" hoặc thêm thật) | Low | P3 |
| Đưa `rgba(...)` hard-code vào theme tokens (glass*, backdrop) | Medium | P2 |
| Đồng bộ màu splash (`#EC4899`) với theme primary | Medium | P1 |
| Pick 1 hướng signature ở §3 và refactor palette | High | P1 |

---

## 4. Motion / Animation — **A−**

### Điểm tốt (rất nhiều)
Đây là hạng mục đầu tư mạnh nhất của dự án. Tóm tắt:

| Hệ thống | File | Đặc điểm |
|---|---|---|
| **Splash scene** | [SplashScene.tsx](src/components/common/SplashScene.tsx) | Logo bounce + drop ink + 8-dir text outline + burst particles. Dark/light reactive. |
| **Skia mesh gradient** | [SkiaMeshGradient.tsx](src/components/ui/skia/SkiaMeshGradient.tsx) | SKSL shader 3-blob mix, dùng làm hero Trip Detail. |
| **Skia balance ring** | [SkiaBalanceRing.tsx](src/components/ui/skia/SkiaBalanceRing.tsx) | Arc progress + BlurMask glow. |
| **Skia confetti burst** | [SkiaConfettiBurst.tsx](src/components/ui/skia/SkiaConfettiBurst.tsx) | 52 particle, gravity, drift. |
| **Skia shimmer** | [SkiaShimmerCard.tsx](src/components/ui/skia/SkiaShimmerCard.tsx) | LinearGradient sweep. |
| **Skia fire border** | [SkiaFireBorder.tsx](src/components/ui/skia/SkiaFireBorder.tsx) | Border noise effect (dùng cho filter chip active). |
| **Skia star nest / breathing halo** | skia/* | Decorative. |
| **BlackHole transition** | [BlackHoleTransition.tsx](src/contexts/BlackHoleTransition.tsx) | Adapt shader Galaxy3 (Fabrice Neyret) — disk + bulb + core, spiral arms 4-octave noise. Dùng khi tap card. |
| **Morph transition** | [MorphTransition.tsx](src/contexts/MorphTransition.tsx) | Mesh gradient lan từ button → cover screen → tint về dest bg. |
| **Lightning / theme-fade** | LightningTransition / ThemeTransitionOverlay | Crossfade theme. |
| **BouncyDialog với Lottie dragon** | [BouncyDialog.tsx](src/components/ui/BouncyDialog.tsx) | Dragon bay vào kéo card, bob+wiggle vô hạn, lật ngang khi mở lại. |
| **Hero Debt sweep + breathe** | [HeroDebt.tsx:152](src/components/home/HeroDebt.tsx:152) | Shine sweep 90px diagonal infinite + scale `1+sin(πt)*0.014`. Sync 1 nguồn `progress`. |
| **Group carousel pan** | [GroupCarousel.tsx:80](src/components/home/GroupCarousel.tsx:80) | `Gesture.Pan` với `activeOffsetX([-12,12])` + `failOffsetY([-20,20])` — chống xung đột với scroll dọc. Threshold + velocity tinh chỉnh. |
| **AppDock indicator** | [AppDock.tsx:166](src/components/common/AppDock.tsx:166) | Spring tab indicator + FAB rotate Plus→X 45°. BlurView glass. |
| **Tab swipe direction-aware** | [trips/[id]/index.tsx:108](src/app/(main)/trips/[id]/index.tsx:108) | Custom `entering` worklet với `direction = right/left` dựa trên prevTab. |
| **AnimatedEntrance staggered** | [AnimatedEntrance.tsx](src/components/ui/AnimatedEntrance.tsx) | Wrap `FadeInDown` với delay clamped — auth screens stagger 0/80/150/220/290/360. |
| **FormReveal accordion** | FormReveal | Show/hide form khi tạo trip/payment. |
| **SwipeableCard** | [SwipeableCard.tsx](src/components/ui/SwipeableCard.tsx) | RN Gesture Handler Reanimated, threshold 40, friction 2. |

### Phối hợp với reduce-motion + user pref
- [`useAnimationsEnabled`](src/utils/userPreferences.ts) check ở mỗi worklet animation. **Tất cả Skia component có fallback static state** (không có canvas → render solid `View`). Đây là chuẩn 5-sao về accessibility.
- [`AccessibilityInfo.isReduceMotionEnabled`](src/components/common/AppDock.tsx:81) listen real-time.
- `<ReducedMotionConfig mode={ReduceMotion.System}>` ở root ([_layout.tsx:154](src/app/_layout.tsx:154)).

### Điểm cần cải thiện
- **Animation overload risk**: Cùng 1 lúc có thể chạy: BlackHole transition (toàn shader noise) + GroupCarousel spring + AppDock spring + HeroDebt shine + breathe. Trên Android low-end (Snapdragon < 7-series), có khả năng giật. Nên có **performance budget** + tự động giảm fidelity khi FPS thấp.
- **BouncyDialog có thể quá "ồn"** khi xuất hiện ở case xóa preset / xóa group: dragon ~260px bay vào, bob+wiggle vô hạn cho 1 dialog đơn giản. Đề xuất phân tầng:
  - Dialog confirm thông thường (xóa expense, kick member): `ConfirmDialog` (HeroUI Dialog) — đã có, **khuyến khích dùng**.
  - Dialog "moment" (welcome, milestone): `BouncyDialog` với dragon — chỉ dùng khi muốn cảm xúc.
- **Hero `breathe` `scale 1.014`** rất subtle nhưng vẫn re-render: chấp nhận được nhưng nếu nhiều hero stack thì chú ý.
- **Splash scene là module-level flag** ([_layout.tsx:40](src/app/_layout.tsx:40)) `__splashShown`: hợp lý nhưng có thể bị mất khi hot-reload trong dev.
- **MorphTransition + BlackHoleTransition cùng tồn tại**: 2 mechanism transition khác nhau — `BlackHole` cho group card, `Morph` cho add-expense. Hai cảm xúc khác nhau. Cân nhắc consolidate hoặc đặt rule rõ khi nào dùng cái nào.
- **Skia shaders chạy `useClock` 60fps**: trong hero, mesh gradient luôn vẽ. Nên có `pause` khi screen blur (off focus).
- **`LottieView dragon.json`** ~140KB nếu unoptimized: kiểm tra size trong assets.

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| Phân loại Dialog: BouncyDialog cho moment, ConfirmDialog cho confirm thường | High | P1 |
| Pause Skia clock-driven shaders khi screen blur (focus listener) | Medium | P2 |
| Performance test trên Android low-end Snapdragon 6-series | High | P1 |
| Consolidate BlackHole + Morph rule (1 doc trong CLAUDE.md) | Medium | P2 |

---

## 5. Layout & Spacing — **B**

### Điểm tốt
- **Gutter 16px nhất quán** ở tất cả màn main: home list `marginHorizontal: 16`, trip tabs `paddingHorizontal: 16`, settings `padding: 16`. Đây là rhythm chính của app.
- **Hero dùng marginHorizontal NGOÀI SuckTarget**: comment [home/index.tsx:252](src/app/(main)/(tabs)/index.tsx:252) giải thích lý do — SuckTarget bounds phải khớp visual rect. Đây là chi tiết kỹ thuật ngầm rất thoughtful.
- **`minWidth: 0` cho flex shrink**: [AppCard.tsx:113](src/components/ui/AppCard.tsx:113) + nhiều chỗ — text dài không phá layout. Đây là gotcha mà nhiều dev RN miss.
- **Stack overflow 36px** cho carousel back cards: [GroupCarousel.tsx:32](src/components/home/GroupCarousel.tsx:32) — biết rằng card sau translateY+scale-down sẽ peek dưới, nên reserve space. Detail ngầm.
- **Header capsule** chia 3 vùng trái-giữa-phải `flex-row` với `minWidth: 44` cho side, center `flex: 1` — chuẩn bottomTab/stack.

### Điểm cần cải thiện
- **Spacing scale `space.ts` ít được dùng**: [spacing.ts](src/config/spacing.ts) khai báo `'4': 16, '5': 20, '6': 24...` nhưng grep code thấy **hiếm** import. Hầu hết vẫn `padding: 14, padding: 16, padding: 18, padding: 22` magic.
- **Border radius lung tung**: 8 / 10 / 12 / 14 / 16 / 18 / 22 / 24 — chưa có scale. Đề xuất:
  - `radius.sm = 8` (chip, badge)
  - `radius.md = 12` (input, small card)
  - `radius.lg = 14` (card, dialog)
  - `radius.xl = 18` (hero)
  - `radius.2xl = 22` (BouncyDialog)
  - `radius.full = 999` (pill)
- **Auth screens không dùng SafeAreaView edge top**: [login.tsx:60](src/app/(auth)/login.tsx:60) chỉ `KeyboardAvoidingView` → BrandDecoration top blob có thể bị che bởi notch trên iPhone X+. Test thực tế.
- **Inconsistent horizontal padding**: 16 (main), 20 (`PresetFormModal`, new expense), 24 (auth).
- **Add expense screen split inputs `width: 70`**: [expenses/new.tsx:621](src/app/(main)/trips/[id]/expenses/new.tsx:621) — width cứng có thể tràn nếu tên member dài.
- **NotificationRow `paddingHorizontal: 16, paddingVertical: 12, gap: 12`**: 3-cột (avatar+icon overlay / body / unread dot) → khá chật. Body có thể dài 2 dòng + meta dòng 3 → row có thể >72px. Hierarchy không rõ.
- **`HeroDebt.minHeight: 188`** + padding dày → rất "đậm"; nhưng `GroupRow.paddingVertical: 12` rất mỏng → tương phản tốt. Hai card khác family → ý đồ.
- **Group detail hero `paddingTop: 20, paddingBottom: 12`**: avatar 96px center, nhưng không có decorative bg → trống trải.

### Đề xuất scale chuẩn hóa
```ts
// src/config/spacing.ts
export const space = { ... }; // giữ
export const radius = {
  sm: 8, md: 12, lg: 14, xl: 18, '2xl': 22, full: 999,
} as const;
export const shadow = {
  card: { offset: { width: 0, height: 1 }, opacity: 0.06, radius: 3, elevation: 1 },
  hero: { offset: { width: 0, height: 8 }, opacity: 0.10, radius: 18, elevation: 4 },
  fab:  { offset: { width: 0, height: 6 }, opacity: 0.32, radius: 10, elevation: 8 },
};
```

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| Bổ sung `radius` + `shadow` scale, refactor 3-5 file thử nghiệm | High | P1 |
| Auth screens wrap `SafeAreaView edges={['top','bottom']}` | Medium | P2 |
| Đồng nhất horizontal padding (cố định 16 hoặc 20 cho mọi screen) | Medium | P2 |
| Thay `width: 70` split input bằng `flex` | Low | P3 |

---

## 6. Component Architecture — **A−**

### Điểm tốt
- **Phân tầng rất rõ ràng**:
  ```
  components/
    ui/          # primitives (AppText, AppCard, Money, ChipPicker, ...)
    ui/skia/     # GPU-accelerated visual decorations
    common/      # cross-cutting (BottomSheets, Dialogs, Banners, Splash)
    brand/       # Wordmark, BrandDecoration
    header/      # GlassCapsuleHeader, slots
    home/        # HeroDebt, GroupRow, GroupCarousel, ...
    trip/        # ExpensesTab, BalancesTab, SettlementTab, HistoryTab
    group/       # MembersTab, TripsTab, GroupSettingsTab, GroupEditSheet
    notifications/ # NotificationRow, NotificationBell
  ```
- **Index barrel exports**: [components/ui/index.ts](src/components/ui/index.ts) sạch; tab components import 1 dòng `import { AppCard, AppText, Money, ... } from '../ui'`.
- **Sub-component split đúng quy tắc CLAUDE.md**: TripDetailScreen + GroupDetailScreen cả hai >300 dòng nhưng đã tách thành tab components độc lập.
- **`React.memo` ở list items**: GroupRow, NotificationRow, HistoryTab, all `*Tab.tsx` — đúng best practice.
- **Stable callback pattern**: [notifications.tsx:170](src/app/(main)/(tabs)/notifications.tsx:170) — `handlePressById(id)` lookup từ store snapshot thay vì closure-of-item, comment giải thích lý do `React.memo` skip đúng. Đây là kiến thức nâng cao.
- **Zustand `useShallow` selectors**: [groups/[id].tsx:54](src/app/(main)/groups/[id].tsx:54) — re-render tối ưu.
- **Compound BouncyDialog**: `<BouncyDialog.Title> / .Description / .Actions>` — pattern đẹp, dùng được generic.

### Điểm cần cải thiện
- **File >500 dòng**: SplashScene, MorphTransition, BlackHoleTransition. Mỗi file 1 unit logic riêng nên chấp nhận được, nhưng nên có sub-files cho shader, math, types.
- **Tab component trong `trip/` nhận quá nhiều prop**: [SettlementTab](src/components/trip/SettlementTab.tsx) nhận 9 props (`tripId, groupId, settlements, payments, balances, members, onAddPayment, onDeletePayment` + tripStatus có thể). Nếu thêm 1-2 prop nữa nên dùng store hoặc context.
- **Inline `<Stack.Screen options={...}>` trong screen**: ổn cho expo-router, nhưng `headerLeft: () => (<Pressable>...)` ([expenses/new.tsx:255](src/app/(main)/trips/[id]/expenses/new.tsx:255)) thì dài; tách ra component.
- **`GlassCapsuleHeader` không thực sự glass**: [GlassCapsuleHeader.tsx:30](src/components/header/GlassCapsuleHeader.tsx:30) — chỉ `backgroundColor: c.background` + border bottom hairline. Tên mời gọi nhưng visual không tương xứng. AppDock có BlurView, header thì không → không nhất quán.
- **`useHeaderSlots(route.name, hasBack, title)`**: [headerSlots.tsx](src/components/header/headerSlots.tsx) — abstraction OK nhưng route-name-based switch dễ break khi đổi route.
- **2 patterns Dialog**: HeroUI `Dialog` (ConfirmDialog) + Custom Modal (BouncyDialog) + heroui Toast. Cần document khi nào dùng cái nào. (Đã được CLAUDE.md đề cập một phần ở `BouncyDialog` cho preset delete, nhưng chưa rõ nguyên tắc chung.)

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| Document rule "khi nào BouncyDialog vs ConfirmDialog vs Toast" trong CLAUDE.md | High | P1 |
| Thêm BlurView vào GlassCapsuleHeader cho đúng "glass" identity | Medium | P2 |
| Tách `<Pressable headerLeft>` lành mạnh thành component nhỏ | Low | P3 |
| Review screens >500 dòng với eye check phải/không tách | Low | P3 |

---

## 7. Accessibility — **A−**

### Điểm tốt
- **Coverage rộng**: hầu hết `Pressable` có `accessibilityRole + accessibilityLabel`. Tab items có `accessibilityRole="tab"` + `accessibilityState={{ selected }}` ([SectionTabs.tsx:78](src/components/ui/SectionTabs.tsx:78)).
- **Live regions**:
  - `OfflineBanner` `accessibilityRole="alert" accessibilityLiveRegion="polite"` ([OfflineBanner.tsx:25](src/components/common/OfflineBanner.tsx:25)).
  - Auth error box `accessibilityLiveRegion="assertive"` — đúng nguyên tắc (assertive cho error, polite cho status).
- **`hitSlop`** khắp icon-only Pressable: 6, 8, 10 (depending) — đúng iOS/Android touch target ≥44pt.
- **Reduce motion support thật sự**: code check `getAnimationsEnabled()` + `AccessibilityInfo.isReduceMotionEnabled`. Skia components có fallback static.
- **`accessibilityRole="image" + accessibilityLabel="Avatar X"`** ở [Avatar.tsx:27](src/components/ui/Avatar.tsx:27).
- **HeroUI's `Switch`** + custom Pressable wrapper: [SettingRow.tsx:18](src/components/ui/SettingRow.tsx:18) — full row tap target, Switch render chỉ visual. UX chuẩn.
- **EmptyState** có `accessibilityRole="text" accessibilityLabel={subtitle ? title.subtitle : title}` — không bị "image" vô nghĩa.

### Điểm cần cải thiện
- **Icon-only buttons thiếu context**:
  - "Sửa" / "Xóa" trong `MembersTab`, `PresetsScreen` — label chỉ là `Sửa preset ${title}` tốt; nhưng `<Pencil>` ở `groups/[id]` `accessibilityLabel="Sửa thông tin nhóm"` chỉ rõ khi `isAdmin`. Tốt.
  - Tuy nhiên `<X size={16}>` trong image preview ([expenses/new.tsx:286](src/app/(main)/trips/[id]/expenses/new.tsx:286)) chỉ `accessibilityLabel="Bỏ ảnh đính kèm"` — OK.
- **Carousel swipe direction không có hint cho screen reader**: [GroupCarousel](src/components/home/GroupCarousel.tsx) chỉ render dots; user dùng VoiceOver/TalkBack không biết swipe để navigate. Thiếu `accessibilityActions` (`magicTap` / custom `swipe-left`).
- **Color-only signal**: status pill `success/danger` chỉ phân biệt bằng màu + label tiếng Việt ngắn ("được nhận" / "cần trả"). Người mù màu (đỏ-xanh) đọc được vì text hiện rõ → OK; nhưng `borderLeft` 3px chỉ màu thì miss.
- **Thiếu `accessibilityHint`** cho nhiều action có side-effect (vd Delete swipe — sau khi swipe phải xác nhận lại không?). Có ConfirmDialog → OK.
- **`AppDock indicator`** chỉ visual — không có a11y label cho "current tab is X".
- **`Money.accessibilityLabel`** hiển thị `${sign}${formatAmount(value)} đồng` ([Money.tsx:104](src/components/ui/Money.tsx:104)) — đúng VN. Nhưng `showSign` khi positive thì sign = `+` → đọc thành "+50000 đồng" → có thể cải tiến: "cộng 50.000 đồng" / "trừ 50.000 đồng".

### Action ngắn
| Action | Tác động | Ưu tiên |
|---|---|---|
| `accessibilityActions` cho GroupCarousel (swipe-left/right) | Medium | P2 |
| Money a11y label đọc "cộng"/"trừ" thay vì +/- raw | Low | P3 |
| AppDock indicator: thêm `accessibilityState={{selected: true}}` cho item active | Low | P3 |
| Audit a11y với VoiceOver iOS + TalkBack Android lần thật | High | P1 |

---

## 8. Per-screen Audit

### 8.1. Auth Group — **B+**

| File | Đánh giá |
|---|---|
| [login.tsx](src/app/(auth)/login.tsx) | ✅ AnimatedEntrance staggered (0/80/150/220/290/360); Wordmark + slogan + brand decoration đẹp; Google button + outline. ⚠️ Layout flat `justifyContent: 'center'` — không có visual focus mạnh; thiếu safe area top. |
| [register.tsx](src/app/(auth)/register.tsx) | ✅ Cùng pattern login. ⚠️ 4 input liên tiếp + button → vertical scroll trên màn nhỏ (iPhone SE) không thoải mái. |
| [forgot-password.tsx](src/app/(auth)/forgot-password.tsx) | ✅ Cooldown 60s tốt, success box success-tone. ⚠️ Chuyển state sent/not-sent in-place không có animation transition; user có thể không nhận thấy đã gửi xong. |
| [reset-password.tsx](src/app/(auth)/reset-password.tsx) | (chưa đọc đầy đủ trong audit) — cần verify với CLAUDE.md flow đã document. |

**Đề xuất chung cho auth**:
- Thêm 1 `<SafeAreaView edges={['top','bottom']}>` wrapper.
- Forgot password sent/not-sent dùng `<FormReveal>` hoặc layout animation `Layout.springify()`.
- Hero login có thể dùng `SkiaBreathingHalo` background subtle thay vì static blob.

### 8.2. Home (`(tabs)/index.tsx`) — **A**

- ✅ **HeroDebt là điểm sáng nhất**: editorial label + sakura petals SVG + orbital arcs + shine sweep + breathe + status pill. **Đây là 1 component đáng tự hào, để screenshot làm marketing**.
- ✅ GroupCarousel với pan + dot indicator, infinite loop modulo, đẹp + smooth.
- ✅ HomeViewToggle cho list/carousel chuyển đổi.
- ✅ EmptyState dramatic: 3 halo blob + Lucide `Users` icon + action button.
- ✅ Welcome dialog 1-time dùng BouncyDialog dragon — cảm xúc.
- ⚠️ Section title "NHÓM CỦA BẠN" + count + tagline + add button: hơi nặng cho mobile width nhỏ. Cân nhắc tagline ẩn ở viewport hẹp.
- ⚠️ AnimatedEntrance loop với delay `Math.min(index * 45, 450)` — nếu nhiều group thì cuối cùng đều fade cùng lúc.

### 8.3. Settings (`(tabs)/settings.tsx`) — **B−**

- ✅ Card + section title "label muted uppercase" — editorial sạch.
- ✅ Profile row: Avatar 56 + name + email + edit pencil. Edit inline đẹp với counter `{newName.trim().length}/{DISPLAY_NAME_MAX_LENGTH}`.
- ✅ SettingRow dùng cả row làm tap target (Switch chỉ visual).
- ⚠️ Layout quá flat: 5 sections (Hồ sơ, Tùy chỉnh, Thông báo, Phản hồi, Đăng xuất) — không có visual transition, không có hero.
- ⚠️ 4 toggle Notifications giống nhau visually → khó scan.
- ⚠️ Logout button cuối screen không nổi bật — nên có separator hoặc spacing rõ.
- 💡 Nâng cấp: Profile card có `SkiaBreathingHalo` decoration sau Avatar; section title kèm icon nhỏ; Notifications thành expandable group.

### 8.4. Presets (`(tabs)/presets.tsx`) — **B**

- ✅ FlatList + AppCard + edit/delete trailing icons.
- ✅ BouncyDialog cho confirm delete — moment phù hợp.
- ⚠️ List rất "list-like" — không có visual hierarchy theo category. Có category trong subtitle nhưng không tô màu.
- 💡 Nâng cấp: group preset theo category (`food / transport / ...`) với section header + icon hue accent. Trailing money có thể dùng `Money variant="default"` thay vì raw `toLocaleString`.

### 8.5. Notifications (`(tabs)/notifications.tsx`) — **B+**

- ✅ Filter chips đầy đủ: All / Unread / Group selector.
- ✅ Group picker BottomSheet multi-select với checkbox.
- ✅ SectionList theo bucket (Hôm nay / Hôm qua / Tuần này / Cũ hơn).
- ✅ Throttle refresh 30s on focus + manual refresh.
- ✅ FireBorder Skia khi group filter active — nice touch.
- ✅ Header right "Đọc tất cả" conditional.
- ⚠️ NotificationRow rất nặng visually (avatar 40 + type icon overlay 20 + 2-line title + meta + unread dot). Trên màn nhỏ rất chật.
- ⚠️ Section header chỉ `<AppText variant="label">` không có separator → bucket dễ blur vào nhau.
- 💡 Nâng cấp: section header `borderTop hairline` + sticky; row layout tách rõ leading/body/trailing với gap > 16; unread state dùng `surface tint` thay vì surface khác.

### 8.6. Group Detail (`(main)/groups/[id].tsx`) — **B+**

- ✅ Hero: Avatar 96 + edit badge + name + meta.
- ✅ SectionTabs với badge count cho pending requests (admin).
- ✅ Tab swipe direction-aware.
- ✅ ConfirmDialog cho approve/reject/kick; VoroConfirmDialog cho toggle trip; BouncyDialog cho delete group.
- ⚠️ Hero không có background gradient/decoration — quá trống. So với Trip Detail dùng SkiaMeshGradient → không đồng nhất.
- ⚠️ Edit badge `Pencil 12` trong circle 28 → tỉ lệ icon nhỏ; tăng lên 14.
- 💡 Nâng cấp: Hero có gradient overlay dùng dominant color của Avatar (nếu hash gradient) — hoặc subtle SkiaBreathingHalo behind avatar.

### 8.7. Trip Detail (`(main)/trips/[id]/index.tsx`) — **A**

- ✅ Hero: SkiaMeshGradient với 3 màu blob — sống động, hiếm thấy trong app phổ thông.
- ✅ Total expenses Money hero + meta `n khoản · m thanh toán · k người`.
- ✅ Personal balance row với info icon → MyBalanceExplanationSheet (chi tiết tính số dư của user).
- ✅ 4 tabs: Chi phí / Số dư / Quyết toán / Lịch sử + custom enter animation worklet direction-aware.
- ⚠️ Hero gradient luôn animate → drain nhẹ trên thiết bị yếu.
- ⚠️ Nhiều thanh chi tiết trong meta dòng → có thể quá dày.

### 8.8. New Expense (`(main)/trips/[id]/expenses/new.tsx`) — **A−**

- ✅ Wizard 2-step (Basic → Split) với indicator "Bước 1/2 / 2/2".
- ✅ FadeInDown(260) khi chuyển step.
- ✅ MoneyChipsDock dock sticky trên keyboard với keyboard-controller — UX rất ngon.
- ✅ Image preview tròn 160x160 với remove button.
- ✅ Preset chips horizontal scroll auto-fill title/amount/category.
- ✅ Switch "Lưu làm preset" với pre-check trùng title → disable button.
- ✅ Split type 3 mode (equal/ratio/custom) với live preview.
- ✅ Custom split tổng/đích validation realtime.
- ⚠️ Step "Cách chia" trên màn dài, các member nhiều thì TextInput `width: 70` cứng có thể chật.
- ⚠️ Preset chip min-width 120 nhưng không có max → tên dài có thể overflow.

### 8.9. Trip Tabs

#### ExpensesTab — **B+**
- ✅ "Thêm khoản chi" button với MorphTransition (wow factor).
- ✅ SwipeableCard delete + ConfirmDialog.
- ✅ CategoryIcon leading 40px + Money trailing.
- ⚠️ ScrollShadow ở mọi tab — overhead.

#### BalancesTab — **B**
- ✅ Export to image button + nicely-formatted summary box.
- ✅ AppCard với borderLeft tone success/danger.
- ⚠️ Layout đơn điệu list, không có chart trực quan.
- 💡 Nâng cấp: thanh ngang "% mỗi người" dạng SkiaBalanceRing nhỏ trên trailing, hoặc bar chart đơn giản.

#### SettlementTab — **B+**
- ✅ "Đề xuất quyết toán" section trên cùng (gợi ý) + "Thanh toán thực tế" form ghi nhận.
- ✅ FormReveal collapsible.
- ✅ ChipPicker người trả/người nhận (Active màu khác cho payTo).
- ✅ MoneyChipsDock cho amount.
- ✅ Preview box "Số dư hiện tại" cho 2 thành viên đã chọn.
- ⚠️ Section title nằm cùng cấp với button "Hủy/Ghi nhận" — có thể tách rõ hơn.

#### HistoryTab — **B−**
- ✅ Section theo ngày.
- ⚠️ AppCard không có icon → text-heavy, đơn điệu.
- 💡 Nâng cấp: leading icon theo `action` (expense.create → Receipt, payment.create → CreditCard, member.* → Users); subtitle dùng `Money variant="compact"` thay raw text.

### 8.10. Group Tabs

#### TripsTab — **B+**
- ✅ Create form với FormReveal + ChipPicker trip type.
- ✅ AppCard với CategoryIcon kind="trip".
- ✅ Trailing toggle close/open status.
- ⚠️ Chip picker có 4 options text → wrap trên màn nhỏ.

#### MembersTab — **B**
- ✅ Invite banner với GradientHero `accentSoft → tint` + ShareIcon.
- ✅ Pending requests section với borderLeft warning.
- ✅ RolePill + VirtualPill 2 màu.
- ⚠️ `color + '22'` (alpha hex8) — ([MembersTab.tsx:20](src/components/group/MembersTab.tsx:20)) — không chuẩn; nên dùng `rgba()` qua helper.
- ⚠️ Action "Xóa" / "Duyệt" / "Từ chối" chỉ là `AppText` trông như link; nên có button ghost nhỏ với hitSlop rõ.

#### GroupSettingsTab — **B**
- ✅ Edit card pressable với icon wrap soft bg.
- ✅ Info card list metrics (tổng members, virtual, trips).
- ✅ Delete button danger cuối.
- ⚠️ Khá tối giản — có thể thêm "Member growth chart" (Skia mini bar).

---

## 9. Action Items theo ưu tiên

### P1 — Sửa ngay (impact cao, effort vừa)

1. **Sàng lọc Dialog usage**: Document trong `CLAUDE.md` quy tắc `BouncyDialog` (welcome / milestone) vs `ConfirmDialog` (delete / approve thông thường) vs `VoroConfirmDialog` vs Toast. Đảm bảo "delete preset" / "delete group" có UI nhất quán.
2. **Đồng bộ brand color signature**: Pick 1 trong 3 hướng (§3) — sửa `theme.ts` + `SplashScene` `#EC4899` để khớp.
3. **Bổ sung `radius` + `shadow` design tokens** trong `src/config/spacing.ts`, refactor 3-5 file sample.
4. **Auth screens wrap SafeAreaView edges top/bottom**.
5. **Performance test trên Android low-end** (Snapdragon 6-series, 4GB RAM) — đo FPS hero shine + carousel + dock spring đồng thời.
6. **Audit a11y với VoiceOver + TalkBack** thật sự (không chỉ static analysis).

### P2 — Sửa trong sprint tới

7. **GlassCapsuleHeader** thêm `BlurView` để đúng "glass" identity.
8. **Pause Skia clock-driven shaders** khi screen blur (`useFocusEffect`).
9. **HistoryTab** thêm leading icon theo action type.
10. **NotificationRow** giảm visual density: bỏ type-icon overlay nhỏ, giữ avatar; meta 1 dòng.
11. **GroupCarousel `accessibilityActions`** cho swipe.
12. **ChipPicker** option `scrollable` cho horizontal scroll thay vì wrap.
13. **`rgba(...)` hard-code** trong Dock + BouncyDialog → token theme.
14. **Forgot password sent/not-sent transition** với `Layout.springify()`.
15. **Group Detail hero** thêm subtle decoration (gradient hoặc breathing halo).
16. **`color + '22'`** trong MembersTab thay bằng helper `withAlpha(color, 0.13)`.

### P3 — Nice to have

17. Display font cho `Money variant="hero"` (thử Space Mono / Fraunces).
18. Money a11y label "cộng"/"trừ".
19. AppDock indicator a11y `selected: true`.
20. Settings có hero/profile card decoration.
21. Presets group theo category với section header.
22. BalancesTab mini chart trực quan.
23. Storybook hoặc snapshot test cho 10 component lõi.

---

## 10. Tổng kết

Fair Pay là dự án **có tay nghề frontend khá cao** — đặc biệt nổi bật ở **lớp animation/Skia** (hiếm thấy trong app fintech VN). Cấu trúc component sạch, accessibility tốt, có tinh thần polish chi tiết (tabular-nums, suckTarget bounds, throttled refresh, theme transition overlay, BottomSheet IME fix, …).

**3 điều nên giữ (đặc trưng):**
1. **Hero Debt** + **Trip SkiaMeshGradient hero** — 2 element làm sản phẩm có "wow".
2. **Motion as a feature**: BouncyDialog dragon, BlackHole transition, MorphTransition — nhất quán với toggle reduce motion.
3. **Accessibility coverage** — đặt nền móng tốt cho compliance về sau.

**3 điều cần ưu tiên xử lý:**
1. **Brand color signature** chưa quyết — palette monochrome + comment pink + splash hot-pink không đồng nhất.
2. **Design tokens chưa hoàn thiện** — `radius`, `shadow`, `glass*` còn rải rác hard-code.
3. **Performance budget trên Android low-end** — chưa có data, là rủi ro lớn nhất với app dùng nhiều Skia + Reanimated 4.

**Tổng grade: B+ (đang trên đường đến A−).** Với 6 P1 items được fix, dự án sẽ leo lên **A−** xứng đáng với chất lượng motion hiện tại.

---

> _Báo cáo này được sinh tự động bởi skill `frontend-design`. Để chạy lại, dùng `/frontend-design review giao diện toàn bộ dự án` hoặc chỉ định scope nhỏ hơn (`auth screens`, `home`, …)._
