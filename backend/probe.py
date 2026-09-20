"""UI state probe: classifies a simulator screenshot of the composer.
Usage: venv/bin/python probe.py /tmp/shot.png
Prints one line per detected feature so tap flows can be verified without
viewing images."""
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
w, h = img.size
px = img.load()
S = 3  # scale px->pt

def is_red(p):
    return p[0] > 200 and p[1] < 90 and p[2] < 90

def is_dark(p):
    return p[0] < 90 and p[1] < 90 and p[2] < 90

# 1. Red text bands (exclude right-bottom post button zone)
bands = []
current = None
for y in range(0, h - 500, 3):
    hit = sum(1 for x in range(60, w - 60, 3) if is_red(px[x, y])) > 3
    if hit and current is None:
        current = y
    elif not hit and current is not None:
        bands.append((round(current / S), round(y / S)))
        current = None
if current:
    bands.append((round(current / S), round((h - 500) / S)))
print('red_bands_pt:', bands)

# 2. Config row: wide dark horizontal bar (gray ~128) around y 500-530pt
for ypt in range(495, 540, 5):
    y = ypt * S
    grayish = sum(1 for x in range(0, w, 6) if 100 < px[x, y][0] < 160 and 100 < px[x, y][1] < 160)
    if grayish > w / 12:
        print(f'config_row: visible near y={ypt}pt')
        break

# 3. Post button: red cluster near bottom right
red_br = sum(1 for y in range(h - 300, h - 100, 4) for x in range(w - 400, w - 100, 4) if is_red(px[x, y]))
print('post_button:', 'visible' if red_br > 200 else 'not visible', f'({red_br})')

# 4. Ghost badge: dark chip band in top area on light bg
badge = sum(1 for y in range(150, 300, 4) for x in range(w // 4, 3 * w // 4, 4) if is_dark(px[x, y]))
print('ghost_badge_zone_dark_px:', badge)

# 5. Signature band: full-width dark band rows (top half)
for y in range(0, h // 2, 3):
    dark = sum(1 for x in range(0, w, 8) if is_dark(px[x, y]))
    if dark > w / 10:
        print(f'dark_band: y={round(y/S)}pt')
        break
