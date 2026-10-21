"""Create exact 2x pixel-art GIF variants of the bundled AWTRIX NG icons.

The `icon` field renders JPEGs at 8x8, while GIFs keep their native size. Keep
the original assets for short panels and generate 16x16 GIFs for TC002.
"""

from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "drivers/awtrixng/assets/images/icons"
DESTINATION = ROOT / "drivers/awtrixng/assets/images/icons-16"
DESTINATION.mkdir(parents=True, exist_ok=True)

for source in sorted(SOURCE.iterdir()):
    if source.suffix.lower() not in {".gif", ".jpg"}:
        continue

    with Image.open(source) as original:
        frames = []
        durations = []

        for frame in ImageSequence.Iterator(original):
            if frame.size != (8, 8):
                raise ValueError(f"Expected an 8x8 frame in {source}")

            frames.append(frame.convert("RGBA").resize((16, 16), Image.Resampling.NEAREST))
            durations.append(frame.info.get("duration", 100))

        frames[0].save(
            DESTINATION / f"{source.stem}.gif",
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=original.info.get("loop", 0),
            disposal=2,
            optimize=False,
        )
