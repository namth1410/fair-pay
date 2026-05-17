# Fair Pay — Video Intro Script

**Format:** 9:16 (1080×1920) · 20s · 30fps = **600 frames**
**Mục đích:** Reels/TikTok/Shorts + Play Store listing video
**Tone:** vui, snappy, nhịp nhanh — text-on-screen lớn để xem tắt tiếng vẫn hiểu

## Bảng màu

| Token | Hex | Dùng cho |
|---|---|---|
| `bg.light` | `#F5F5F7` | Nền sáng default |
| `bg.dark` | `#0B0B0F` | Hook scene, contrast khi bùng nổ |
| `accent.red` | `#E11D48` | "cần trả", số nợ, alarm |
| `accent.green` | `#10B981` | "được nhận", checkmark, success |
| `accent.mint` | `#A8E6CF` | Background CTA (lấy từ feature-graphic) |
| `text.primary` | `#0B0B0F` | Tiêu đề lớn |
| `text.muted` | `#6B7280` | Caption phụ |

**Font:** Be Vietnam Pro (Google Fonts qua `@remotion/google-fonts`) — weights 400/600/800. Đây là font app đang dùng → giữ nhất quán brand.

## Timeline tổng (20s = 600 frames @ 30fps)

```
| 0────3s |3──5s|5──────────11s|11────15s|15─────────20s |
| HOOK    |LOGO | PRESET 1-TAP | SETTLE  | CTA           |
| 90fr    |60fr | 180fr        | 120fr   | 150fr         |
```

---

## Scene 1 — HOOK (0–3s · frames 0–90)

**Mục tiêu:** chạm pain point trong 1 giây đầu để giữ chân.

### Visual
- Nền `bg.dark` (#0B0B0F).
- 4 chat bubble tiếng Việt bay vào từ 4 hướng, mỗi cái lệch tâm, nghiêng nhẹ ±8°:
  1. *"Ai trả tiền nướng?"* (vào frame 5, từ trái)
  2. *"150k em chuyển ai?"* (frame 12, từ phải)
  3. *"Còn nợ Linh bao nhiêu?"* (frame 20, từ dưới)
  4. *"Tính nhẩm mỏi tay..."* (frame 30, từ trên, scale lớn hơn 1.2x)
- Bubble dùng `spring()` damping nhẹ — bouncy.
- Frame 60–90: tất cả bubble shake (random ±3px) + blur tăng dần, hint chaos.
- Frame 85–90: cut-to-black flash.

### Text on-screen
Không có overlay — text nằm trong bubble.

### Voiceover (gợi ý, optional)
> "Chia tiền nhóm... đau đầu nhất là tính nhẩm."
*(0:00–0:03, ~10 từ, nhịp chậm rãi, giọng nữ trẻ)*

### SFX
- Frame 5, 12, 20, 30: pop nhẹ ("blob.wav") khi mỗi bubble xuất hiện.
- Frame 85: whoosh trầm + flash sound.

### Music
- Lo-fi intro nhẹ, volume 40%. Beat drop đồng bộ frame 90 sang Scene 2.

---

## Scene 2 — LOGO REVEAL (3–5s · frames 90–150)

**Mục tiêu:** đóng dấu thương hiệu trong 2s.

### Visual
- Nền `bg.light`.
- Frame 90–105: linh vật rồng xanh (`mascot.png` từ feature-graphic crop) pop-in từ giữa, scale 0 → 1.1 → 1 (spring bouncy, mass=0.5).
- Frame 105–130: chữ **"Fair Pay"** trượt từ phải sang, weight 800, size 180px, color `text.primary`.
- Frame 130–150: tagline **"Chia tiền nhóm — nhanh, gọn, công bằng."** fade-in dưới logo, weight 400, size 48px, color `text.muted`.

### Text on-screen
- `Fair Pay` (h1)
- `Chia tiền nhóm — nhanh, gọn, công bằng.` (subtitle)

### Voiceover
> "Fair Pay giúp bạn."
*(0:03–0:05, 4 từ)*

### SFX
- Frame 90: "ding" sáng (mascot xuất hiện).
- Frame 105: whoosh ngắn (logo trượt).

### Music
- Beat drop, volume lên 70%.

---

## Scene 3 — PRESET 1-TAP DEMO (5–11s · frames 150–330)

**Mục tiêu:** showcase signature feature — feature differentiator vs Splitwise.

### Visual (mockup phone đặt giữa, khung bo góc 60px, shadow lớn)
- Frame 150–170: phone slide từ dưới lên, screenshot `home.jpg` (Screenshot_2026-05-15-20-37-59-46).
- Frame 170–190: hover ring trắng quanh nút "+" giữa dock, pulse 2 nhịp.
- Frame 190–210: tap ripple đen lan ra từ nút "+", sheet "Thêm khoản chi mới" trượt lên từ đáy (screenshot 5).
- Frame 210–250: zoom + spotlight vào chip **"Ăn trưa ⚡ 1-tap"** — chip còn lại mờ đi 40%.
- Frame 250–270: tap ripple trên chip "Ăn trưa", dialog confirm bouncy pop-up: "Tạo khoản chi Ăn trưa 35.000đ?".
- Frame 270–290: nút "Tạo" highlight → checkmark xanh `accent.green` scale 0→1.2→1 (spring), text "Đã thêm khoản chi" fly-in.
- Frame 290–330: phone tilt nhẹ -5° + fade out sang phải.

### Text on-screen (overlay phải phone, weight 800)
- Frame 170–250: **"1 chạm."** (size 140px, `text.primary`)
- Frame 250–330: **"Xong."** (size 200px, `accent.green`, dấu chấm to)

### Voiceover
> "Một chạm — thêm khoản chi. Không cần gõ lại."
*(0:05–0:11, ~10 từ)*

### SFX
- Frame 170: whoosh up (phone vào).
- Frame 210: sheet slide ("swoosh").
- Frame 250: tap click sắc nét.
- Frame 270: dialog "pop".
- Frame 280: success "ding" cao + sparkle.

### Music
- Verse loop, volume 70%. SFX layered trên.

---

## Scene 4 — SETTLEMENT SMART (11–15s · frames 330–450)

**Mục tiêu:** thể hiện "công bằng" + algorithm smart.

### Visual
- Frame 330–360: 4 avatar tròn (giả lập, dùng tên thực: nam, Hiếu Khắc, Quyết vua, Dũng Trần Thế) xếp hình vuông trên nền `bg.light`. Tên hiện dưới mỗi avatar.
- Frame 360–390: 6 mũi tên cong xám vẽ giữa các cặp (n*(n-1)/2 = 6), với label số tiền nhỏ. Nhìn chằng chịt, hỗn loạn.
- Frame 390–410: tất cả mũi tên xám rung lắc + flash trắng → **biến mất**.
- Frame 410–440: chỉ còn **2 mũi tên** đỏ-xanh đậm, dày, vẽ stroke animation: nam → Hiếu (150k), Quyết → Dũng (80k). Số tiền đếm từ 0 lên.
- Frame 440–450: caption fly-in.

### Text on-screen
- Frame 360–390 (góc trên): **"6 lần chuyển khoản?"** (size 56px, `accent.red`, có dấu hỏi to)
- Frame 410–450 (góc dưới): **"Chỉ cần 2."** (size 90px, `accent.green`, weight 800)
- Frame 440–450 (dưới cùng nhỏ): *"Fair Pay tự gợi ý cách thanh toán tối ưu."*

### Voiceover
> "Tự gợi ý ai trả ai — gọn nhất."
*(0:11–0:15, ~8 từ)*

### SFX
- Frame 360: chain "click" nhẹ khi 6 arrow vẽ.
- Frame 390: glitch + whoosh trầm khi arrow biến mất.
- Frame 410: 2 stroke draw "swish" mượt.

### Music
- Build-up tension nhẹ frame 380–410, drop trở lại verse frame 410.

---

## Scene 5 — CTA (15–20s · frames 450–600)

**Mục tiêu:** chốt + drive cài đặt.

### Visual
- Frame 450–470: cross-fade sang nền gradient `accent.mint` → trắng (từ `feature-graphic.png`).
- Frame 470–500: mascot rồng đi vào từ trái, vẫy tay (mock animation: rotate ±15° tay trái 3 nhịp).
- Frame 500–530: 3 badge fly-in từ phải, mỗi badge cách 8 frame, kiểu pill:
  - 🆓 **Miễn phí**
  - 🚫 **Không quảng cáo**
  - 🇻🇳 **Tiếng Việt**
- Frame 530–560: Play Store badge SVG slide vào giữa-dưới, scale 0.8→1, spring nhẹ.
- Frame 560–590: text **"Tải Fair Pay ngay"** type-in chữ-một-chữ trên Play Store badge.
- Frame 590–600: pulse cuối cùng (scale 1→1.05→1) + freeze frame thumbnail-friendly.

### Text on-screen
- Top: **"Fair Pay"** (size 120px, `text.primary`, weight 800)
- Middle: 3 badge pill
- CTA cuối: **"Tải Fair Pay ngay"** (size 64px, weight 600)
- Domain/handle (corner nhỏ): `play.google.com/store/apps/...` (để placeholder)

### Voiceover
> "Miễn phí, không quảng cáo. Tải Fair Pay ngay."
*(0:15–0:20, ~8 từ)*

### SFX
- Frame 500, 508, 516: 3 "ding" nhỏ (mỗi badge).
- Frame 530: "pop" Play Store badge.
- Frame 590: rise sweet (kết thúc happy).

### Music
- Outro chord, volume fade 70% → 50% → cut frame 600.

---

## Voiceover full script (~40 từ, 20s)

```
[0:00] Chia tiền nhóm...
[0:01] đau đầu nhất là tính nhẩm.
[0:03] Fair Pay giúp bạn.
[0:05] Một chạm — thêm khoản chi.
[0:08] Không cần gõ lại.
[0:11] Tự gợi ý ai trả ai —
[0:13] gọn nhất.
[0:15] Miễn phí, không quảng cáo.
[0:17] Tải Fair Pay ngay.
```

> Giọng đề xuất: nữ trẻ 20–28t, vùng miền trung tính (Hà Nội/Sài Gòn đều OK), tone friendly không quá robot.
> Nếu user tự thu: phòng yên, mic không ù, leave 0.5s khoảng nghỉ giữa câu.

---

## Asset cần chuẩn bị

### Đã có sẵn trong repo
- ✅ 6 screenshot ở `assets/screenshots/` — dùng cho phone mockup
- ✅ Feature graphic ở `assets/play-store/feature-graphic.png` — crop mascot + lấy gradient mint

### Cần tạo / download
- [ ] **Mascot PNG transparent** — crop từ feature-graphic, lưu `video/public/mascot.png` (PNG có alpha)
- [ ] **Play Store badge SVG** — official từ [play.google.com/intl/en_us/badges/](https://play.google.com/intl/en_us/badges/) (có hướng dẫn brand)
- [ ] **Nhạc nền lo-fi 20s** — search Pixabay: `"lofi chill 20s loop"` hoặc Mixkit "lofi". Suggest 2-3 candidate sau khi user duyệt script.
- [ ] **SFX pack:** pop, whoosh, ding, success, click — Mixkit free hoặc Pixabay
  - Cần: `pop.mp3`, `whoosh-up.mp3`, `whoosh-down.mp3`, `tap.mp3`, `ding-success.mp3`, `sparkle.mp3`, `chain-click.mp3`, `glitch.mp3`

### Tự generate trong Remotion
- Chat bubbles (Scene 1) — pure JSX
- Tap ripple, hover ring (Scene 3) — animate borderRadius + opacity
- Avatar circles + arrow paths (Scene 4) — SVG `<path>` với `strokeDasharray` cho draw animation
- Pill badges (Scene 5) — pure JSX

---

## Composition props (Remotion)

```ts
type FairPayIntroProps = {
  voiceoverUrl?: string;     // optional, user tự thu sau
  musicUrl: string;          // bắt buộc
  enableCaptions?: boolean;  // default true, render text VN cho mode tắt tiếng
};
```

Composition id `intro`, `durationInFrames={600}`, `fps={30}`, `width={1080}`, `height={1920}`.

---

## Sau khi duyệt script — bước tiếp theo

1. **User confirm**: ✅/sửa từng scene
2. **Mockup tĩnh** từng key frame (frame 90, 200, 280, 410, 530) trên Pencil để duyệt visual
3. **Scaffold Remotion**: `cd video && npx create-video@latest --yes --blank --no-tailwind .`
4. **Code scene-by-scene** theo thứ tự 1→5, mỗi scene preview qua Studio
5. **Render thử frame 30** + frame 270 + frame 530 qua `npx remotion still` để check
6. **Final render** MP4 + GIF preview

---

## Câu hỏi cần user quyết sau khi đọc script

1. Có muốn đổi VO script không? (mình viết dạng draft, user có thể tự edit khi thu)
2. Voiceover hay không VO (chỉ text + nhạc)?
3. Có muốn thay đổi feature highlight nào không? Hiện tại: **Preset 1-tap** + **Settlement smart**. Bỏ qua: virtual member, notification, dark mode.
4. Cảnh CTA cuối muốn show link/QR/Play Store URL cụ thể nào?
