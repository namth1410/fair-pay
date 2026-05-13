"""Process Fair Pay logo: upscale, optimize, generate all Expo asset variants.

Inputs:  assets/logo.original.png  (raw output from Gemini)
Outputs:
  assets/logo.png              1024x1024, optimized master with background
  assets/icon.png              1024x1024, iOS App Store icon (= logo.png)
  assets/adaptive-icon.png     1024x1024, Android foreground (transparent, safe-zone)
  assets/splash-icon.png       1024x1024, splash screen (transparent FG)
  assets/notification-icon.png 1024x1024, monochrome white silhouette
  assets/favicon.png             48x48,    web favicon
"""
from pathlib import Path
from PIL import Image
from rembg import remove, new_session

ASSETS = Path(__file__).parent.parent / "assets"
SRC = ASSETS / "logo.original.png"

CANVAS = 1024
SAFE_ZONE_RATIO = 0.66  # Android adaptive icon: subject must fit inside 66% inner circle


def save_optimized(img: Image.Image, path: Path, colors: int = 256) -> None:
    """Save PNG with palette quantization for small file size."""
    try:
        q = img.quantize(colors=colors, method=Image.Quantize.LIBIMAGEQUANT)
    except (ValueError, OSError):
        q = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    q.save(path, "PNG", optimize=True)
    print(f"  -> {path.name}: {path.stat().st_size / 1024:.1f} KB")


def tight_bbox(img_rgba: Image.Image) -> tuple[int, int, int, int]:
    """Return bounding box of non-transparent pixels."""
    alpha = img_rgba.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Image is fully transparent")
    return bbox


def fit_into_canvas(subject: Image.Image, target_ratio: float) -> Image.Image:
    """Crop subject to its non-transparent bbox, then scale to fit `target_ratio`
    of CANVAS along its longer side, centered on a transparent canvas."""
    bbox = tight_bbox(subject)
    cropped = subject.crop(bbox)
    target_max = int(CANVAS * target_ratio)
    w, h = cropped.size
    scale = target_max / max(w, h)
    new_w, new_h = round(w * scale), round(h * scale)
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(resized, ((CANVAS - new_w) // 2, (CANVAS - new_h) // 2), resized)
    return out


def to_white_silhouette(img_rgba: Image.Image, threshold: int = 64) -> Image.Image:
    """Convert alpha channel to a solid white silhouette on transparent."""
    alpha = img_rgba.split()[-1]
    mask = alpha.point(lambda a: 255 if a >= threshold else 0)
    out = Image.new("RGBA", img_rgba.size, (0, 0, 0, 0))
    white = Image.new("RGBA", img_rgba.size, (255, 255, 255, 255))
    out.paste(white, (0, 0), mask)
    return out


def main() -> None:
    print(f"Reading {SRC.name}...")
    src = Image.open(SRC).convert("RGBA")
    if src.size != (CANVAS, CANVAS):
        src = src.resize((CANVAS, CANVAS), Image.LANCZOS)
        print(f"  resized to {CANVAS}x{CANVAS}")

    # 1) Master logo + iOS icon (keep gradient background)
    print("\n[1/6] Master logo (with background)")
    save_optimized(src, ASSETS / "logo.png")
    save_optimized(src, ASSETS / "icon.png")

    # 2) Run AI background removal once, reuse for the rest
    print("\n[2/6] Removing background with rembg")
    session = new_session("u2net")
    fg = remove(src, session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10).convert("RGBA")
    print(f"  foreground bbox: {tight_bbox(fg)}")

    # 3) Adaptive icon: subject fits inside Android safe-zone (66% inner circle)
    print("\n[3/6] Adaptive icon (Android, transparent FG, safe-zone)")
    adaptive = fit_into_canvas(fg, SAFE_ZONE_RATIO)
    save_optimized(adaptive, ASSETS / "adaptive-icon.png")

    # 4) Splash icon: a bit larger than adaptive (splash has more room)
    print("\n[4/6] Splash icon (transparent FG)")
    splash = fit_into_canvas(fg, 0.80)
    save_optimized(splash, ASSETS / "splash-icon.png")

    # 5) Notification icon: monochrome white silhouette
    print("\n[5/6] Notification icon (monochrome white)")
    mono_source = fit_into_canvas(fg, SAFE_ZONE_RATIO)
    silhouette = to_white_silhouette(mono_source)
    save_optimized(silhouette, ASSETS / "notification-icon.png", colors=2)

    # 6) Favicon 48x48 from master
    print("\n[6/6] Favicon 48x48")
    favicon = src.resize((48, 48), Image.LANCZOS)
    favicon.save(ASSETS / "favicon.png", "PNG", optimize=True)
    print(f"  -> favicon.png: {(ASSETS / 'favicon.png').stat().st_size / 1024:.1f} KB")

    print("\nDone.")


if __name__ == "__main__":
    main()
