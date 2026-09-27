"""Regenerate brand/color-contact-sheet.png from src/constants/colors.ts.

    backend/venv/bin/python frontend/scripts/color_contact_sheet.py   (from the repo root)
"""
import re
from PIL import Image, ImageDraw, ImageFont

src = open('frontend/src/constants/colors.ts').read()
block = src[src.index('postColors: ['):]
block = block[:block.index(']')]
colors = re.findall(r"'(#[0-9A-Fa-f]{6})',\s*//\s*([^\n]+)", block)
rainbow = re.findall(r"#[0-9A-Fa-f]{6}", src[src.index('rainbowPalette:'):].split(']')[0])

F = 'frontend/assets/fonts/'
title_f = ImageFont.truetype(F + 'ArialBlack.ttf', 44)
name_f = ImageFont.truetype(F + 'ArialBlack.ttf', 26)
hex_f = ImageFont.truetype(F + 'CourierPrime.ttf', 26)
aa_f = ImageFont.truetype(F + 'ArialBlack.ttf', 64)
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lum(c):
    v = [x / 255 for x in c]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def ink(h):  # the readable of black / white, as the app picks it
    l = lum(rgb(h))
    return '#000000' if (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) else '#FFFFFF'


COLS, SW, SH, PAD = 6, 300, 300, 24
rows = (len(colors) + COLS - 1) // COLS
W = COLS * SW + (COLS + 1) * PAD
H = 110 + rows * (SH + 110) + 260
sheet = Image.new('RGB', (W, H), '#F8F8FF')
d = ImageDraw.Draw(sheet)
d.text((PAD, 30), f'Type colors ({len(colors)})', font=title_f, fill='#000000')
for i, (hx, name) in enumerate(colors):
    x = PAD + (i % COLS) * (SW + PAD)
    y = 110 + (i // COLS) * (SH + 110)
    d.rectangle((x, y, x + SW, y + SH), fill=hx, outline='#88888A', width=2)
    d.text((x + SW / 2, y + SH / 2), 'Aa', font=aa_f, fill=ink(hx), anchor='mm')
    d.text((x, y + SH + 14), name.strip(), font=name_f, fill='#000000')
    d.text((x, y + SH + 50), hx.upper(), font=hex_f, fill='#3D3D42')

y0 = 110 + rows * (SH + 110) + 10
d.text((PAD, y0), 'Rainbow text', font=name_f, fill='#000000')
for j, hx in enumerate(rainbow):
    x = PAD + j * 150
    d.rectangle((x, y0 + 44, x + 130, y0 + 124), fill=hx, outline='#88888A', width=2)
    d.text((x, y0 + 134), hx.upper(), font=hex_f, fill='#3D3D42')

gx = PAD + 6 * 150 + 40
d.text((gx, y0), 'Rainbow gradient (diagonal)', font=name_f, fill='#000000')
gw, gh = W - gx - PAD, 80
grad = Image.new('RGB', (gw, gh))
stops = [rgb(h) for h in rainbow]
for px in range(gw):
    for py in range(gh):
        t = (px * gw + py * gh) / (gw * gw + gh * gh) * (len(stops) - 1)
        s = min(int(t), len(stops) - 2)
        r = t - s
        grad.putpixel((px, py), tuple(int(stops[s][k] * (1 - r) + stops[s + 1][k] * r) for k in range(3)))
sheet.paste(grad, (gx, y0 + 44))
d.rectangle((gx, y0 + 44, gx + gw, y0 + 44 + gh), outline='#88888A', width=2)

out = 'frontend/assets/brand/color-contact-sheet.png'
sheet.save(out)
print(out, sheet.size, f'{len(colors)} colors, {len(rainbow)} rainbow')
