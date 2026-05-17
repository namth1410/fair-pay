"""
Generate Google Play Console assets for Fair Pay:
- Tablet 7-inch screenshots  (1080 x 1920)
- Tablet 10-inch screenshots (1620 x 2880)
- Feature graphic            (1024 x  500)

Input:  assets/screenshots/*.jpg  (phone screenshots, 1280 x 2800)
Output: assets/play-store/{tablet-7/, tablet-10/, feature-graphic.png}
"""

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

# ── paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets" / "screenshots"
OUT_DIR = ROOT / "assets" / "play-store"
LOGO_PATH = ROOT / "assets" / "icon.png"

# ── brand palette (light theme từ src/config/theme.ts) ───────────────────
BG_LIGHT = (247, 247, 247)        # #F7F7F7 — app background
BG_GRAD_TOP = (193, 232, 209)     # teal lá nhạt từ logo
BG_GRAD_MID = (213, 232, 165)     # xanh chuối
BG_GRAD_BOT = (245, 238, 195)     # cream vàng từ logo
FG_DARK = (26, 26, 31)            # #1A1A1F primary text
FG_MUTED = (113, 113, 122)        # #71717A muted text
ACCENT_RED = (225, 29, 72)        # #E11D48 danger
SHADOW = (0, 0, 0, 80)            # soft black with alpha

# fonts từ C:\Windows\Fonts
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REGULAR = "C:/Windows/Fonts/segoeui.ttf"

# ── helpers ───────────────────────────────────────────────────────────────

def vertical_gradient(size, top_rgb, mid_rgb, bot_rgb):
    """Gradient 3-stop từ top → mid (50%) → bot."""
    w, h = size
    img = Image.new("RGB", size, top_rgb)
    px = img.load()
    half = h // 2
    for y in range(h):
        if y < half:
            t = y / max(half - 1, 1)
            r = int(top_rgb[0] + (mid_rgb[0] - top_rgb[0]) * t)
            g = int(top_rgb[1] + (mid_rgb[1] - top_rgb[1]) * t)
            b = int(top_rgb[2] + (mid_rgb[2] - top_rgb[2]) * t)
        else:
            t = (y - half) / max(h - half - 1, 1)
            r = int(mid_rgb[0] + (bot_rgb[0] - mid_rgb[0]) * t)
            g = int(mid_rgb[1] + (bot_rgb[1] - mid_rgb[1]) * t)
            b = int(mid_rgb[2] + (bot_rgb[2] - mid_rgb[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def rounded_corners(img: Image.Image, radius: int) -> Image.Image:
    """Apply rounded-corner mask to an RGB(A) image; return RGBA."""
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, img.size[0], img.size[1]), radius=radius, fill=255
    )
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def drop_shadow(rgba: Image.Image, blur: int, offset=(0, 16), opacity=120):
    """Generate a blurred drop shadow underneath an RGBA image."""
    w, h = rgba.size
    pad = blur * 3
    shadow = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    src_alpha = rgba.split()[-1]
    silhouette = Image.new("RGBA", rgba.size, (0, 0, 0, opacity))
    silhouette.putalpha(src_alpha.point(lambda a: min(opacity, a)))
    shadow.paste(silhouette, (pad + offset[0], pad + offset[1]), silhouette)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    return shadow, pad


def composite_tablet(phone_img: Image.Image, canvas_size, target_phone_h_ratio=0.86):
    """
    Place the phone screenshot centered on a tablet-size light canvas
    with rounded corners and a soft drop shadow.
    """
    cw, ch = canvas_size
    canvas = Image.new("RGB", canvas_size, BG_LIGHT)

    # scale phone to fit target height ratio
    target_h = int(ch * target_phone_h_ratio)
    ratio = target_h / phone_img.size[1]
    target_w = int(phone_img.size[0] * ratio)

    # safeguard: must also fit width with some margin
    max_w = int(cw * 0.78)
    if target_w > max_w:
        target_w = max_w
        target_h = int(phone_img.size[1] * target_w / phone_img.size[0])

    phone_scaled = phone_img.resize((target_w, target_h), Image.LANCZOS)
    phone_rounded = rounded_corners(phone_scaled, radius=int(target_w * 0.06))

    # shadow first
    blur = int(target_w * 0.04)
    shadow_img, pad = drop_shadow(
        phone_rounded, blur=blur, offset=(0, int(target_w * 0.025)), opacity=110
    )

    px = (cw - target_w) // 2
    py = (ch - target_h) // 2

    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.alpha_composite(shadow_img, (px - pad, py - pad))
    canvas_rgba.alpha_composite(phone_rounded, (px, py))
    return canvas_rgba.convert("RGB")


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


# ── tablet screenshots ────────────────────────────────────────────────────

def make_tablet_set(canvas_size, out_subdir):
    out = OUT_DIR / out_subdir
    out.mkdir(parents=True, exist_ok=True)
    screenshots = sorted(SRC_DIR.glob("Screenshot_*.jpg"))
    for i, fp in enumerate(screenshots, 1):
        with Image.open(fp) as phone:
            tablet = composite_tablet(phone, canvas_size)
            target = out / f"tablet_{i:02d}.png"
            tablet.save(target, "PNG", optimize=True)
            print(f"  [ok] {target.relative_to(ROOT)}  ({canvas_size[0]}x{canvas_size[1]})")


# ── feature graphic ──────────────────────────────────────────────────────

def make_feature_graphic():
    W, H = 1024, 500
    out = OUT_DIR / "feature-graphic.png"
    out.parent.mkdir(parents=True, exist_ok=True)

    canvas = vertical_gradient((W, H), BG_GRAD_TOP, BG_GRAD_MID, BG_GRAD_BOT)
    canvas = canvas.convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # ── right side: a phone screenshot mockup, tilted ──
    sc_path = sorted(SRC_DIR.glob("Screenshot_*.jpg"))[0]
    with Image.open(sc_path) as phone_src:
        # scale phone to height ~ 440
        target_h = 440
        ratio = target_h / phone_src.size[1]
        target_w = int(phone_src.size[0] * ratio)
        phone = phone_src.resize((target_w, target_h), Image.LANCZOS)
        phone = rounded_corners(phone, radius=int(target_w * 0.08))

        # drop shadow
        shadow_img, pad = drop_shadow(phone, blur=18, offset=(0, 10), opacity=130)
        # rotate slight tilt (with expand=True to keep all pixels)
        angle = -8
        phone_rot = phone.rotate(angle, resample=Image.BICUBIC, expand=True)
        shadow_rot = shadow_img.rotate(angle, resample=Image.BICUBIC, expand=True)

        # place on right side
        pw, ph = phone_rot.size
        px = W - pw - 40
        py = (H - ph) // 2
        canvas.alpha_composite(shadow_rot, (px - pad, py - pad))
        canvas.alpha_composite(phone_rot, (px, py))

    # ── left side: dragon logo + headline + tagline ──
    # Dragon logo (top-left)
    if LOGO_PATH.exists():
        with Image.open(LOGO_PATH) as logo_src:
            logo = logo_src.convert("RGBA").resize((110, 110), Image.LANCZOS)
            # Soft rounded clip
            logo = rounded_corners(logo, radius=24)
            canvas.alpha_composite(logo, (44, 44))

    # Headline
    f_brand = load_font(FONT_BOLD, 70)
    f_tag = load_font(FONT_REGULAR, 30)
    f_sub = load_font(FONT_REGULAR, 22)

    x_text = 170
    y_brand = 56
    draw.text((x_text, y_brand), "Fair Pay", fill=FG_DARK, font=f_brand)

    # subtitle just below the brand
    y_sub = y_brand + 88
    draw.text((44, y_sub), "Chia tiền nhóm — nhanh, gọn, công bằng.", fill=FG_DARK, font=f_tag)

    # tagline bullets
    bullets = [
        "• Tính số dư & gợi ý thanh toán tối ưu",
        "• Hỗ trợ thành viên ảo và preset 1-chạm",
        "• Miễn phí, không quảng cáo, tiếng Việt",
    ]
    y_b = y_sub + 60
    for line in bullets:
        draw.text((44, y_b), line, fill=FG_MUTED, font=f_sub)
        y_b += 36

    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"  [ok] {out.relative_to(ROOT)}  ({W}x{H})")


# ── main ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Tablet 7-inch (1080 x 1920):")
    make_tablet_set((1080, 1920), "tablet-7")
    print("\nTablet 10-inch (1620 x 2880):")
    make_tablet_set((1620, 2880), "tablet-10")
    print("\nFeature graphic (1024 x 500):")
    make_feature_graphic()
    print(f"\nAll outputs in: {OUT_DIR.relative_to(ROOT)}")
