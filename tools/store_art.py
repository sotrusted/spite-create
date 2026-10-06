"""App Store creative assets (2026 placements), drawn at full resolution with
the app's own fonts and palette:
  product page header  21:9  3840 x 1646  (no alpha)
  search results        3:2   2400 x 1600  (min 1920 x 1280)
Writes frontend/assets/store/creative/{header,search}-<concept>.png
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'frontend', 'assets', 'fonts')
OUT = os.path.join(ROOT, 'frontend', 'assets', 'store', 'creative')
SIZES = {'header': (3840, 1646), 'search': (2400, 1600)}


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), int(size))


def fit(draw, text, face, max_w, max_h, start):
    """Largest size (from start, down) at which text fits the box."""
    size = start
    while size > 10:
        f = font(face, size)
        l, t, r, b = draw.multiline_textbbox((0, 0), text, font=f, align='center', spacing=size * 0.08)
        if r - l <= max_w and b - t <= max_h:
            return f, size
        size *= 0.95
    return font(face, size), size


def text(draw, box, content, face, fill, start, stroke=None, chip=None):
    x0, y0, x1, y1 = box
    f, size = fit(draw, content, face, (x1 - x0) * 0.86, (y1 - y0) * 0.8, start)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    spacing = size * 0.08
    if chip:
        l, t, r, b = draw.multiline_textbbox((cx, cy), content, font=f, anchor='mm', align='center', spacing=spacing)
        pad = size * 0.25
        draw.rectangle((l - pad, t - pad * 0.5, r + pad, b + pad * 0.5), fill=chip)
    if stroke:
        w = max(2, int(size * 0.07))
        draw.multiline_text((cx, cy), content, font=f, anchor='mm', align='center', spacing=spacing,
                            fill=stroke, stroke_width=w, stroke_fill=stroke)
    draw.multiline_text((cx, cy), content, font=f, anchor='mm', align='center', spacing=spacing, fill=fill)


def gradient(size, stops):
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    rgb = [tuple(int(s[i:i + 2], 16) for i in (1, 3, 5)) for s in stops]
    for y in range(h):
        for x in range(w):
            t = (x * w + y * h) / (w * w + h * h)
            p = t * (len(rgb) - 1)
            i = min(int(p), len(rgb) - 2)
            f = p - i
            px[x, y] = tuple(int(rgb[i][k] * (1 - f) + rgb[i + 1][k] * f) for k in range(3))
    return img


def wall(size):
    w, h = size
    pages = [
        ('#F0FF00', "Quote\nanything!", 'CourierPrime.ttf', '#000000', None, None),
        ('#FF1493', "Words,\narranged\nbeautifully!", 'PetitFormalScript.ttf', '#0000EE', None, '#F8F8FF'),
        ('#FF1A1A', "Text as\nimage!", 'Impact.ttf', '#F8F8FF', '#000000', None),
        ('#FAEBD7', "Typography\nfor\neveryone!", 'TimesNewRomanItalic.ttf', '#690016', None, None),
        ('#0000EE', "Creative\nmind's\nideas!", 'ArialBlack.ttf', '#F8F8FF', None, None),
    ]
    if w / h < 2:
        # the search card is narrower: three pages read, five do not
        pages = [pages[0], pages[2], pages[4]]
    img = Image.new('RGB', size, '#000000')
    d = ImageDraw.Draw(img)
    # the centre page is wider: the one idea
    weights = [1, 1, 1.6, 1, 1] if len(pages) == 5 else [1, 1.4, 1]
    x = 0
    for (bg, content, face, ink, stroke, chip), wt in zip(pages, weights):
        pw = w * wt / sum(weights)
        d.rectangle((x, 0, x + pw, h), fill=bg)
        text(d, (x, h * 0.12, x + pw, h * 0.88), content, face, ink, h * 0.3, stroke, chip)
        x += pw
    return img


def one_idea(size):
    w, h = size
    img = gradient(size, ['#FF1A1A', '#FF940A', '#F0FF00', '#32CD32', '#00CED1', '#AB00FF'])
    d = ImageDraw.Draw(img)
    text(d, (w * 0.15, h * 0.15, w * 0.85, h * 0.85), 'TEXT AS IMAGE!', 'Impact.ttf', '#F8F8FF', h * 0.5, '#000000')
    return img


def quote_the_quote(size):
    w, h = size
    img = Image.new('RGB', size, '#FAEBD7')
    d = ImageDraw.Draw(img)
    # three nested pages, each a quote inside the last, centred
    frames = [
        ('#FAEBD7', 'Quotes all the way down!', 'TimesNewRomanItalic.ttf', '#FF1A1A'),
        ('#0000EE', 'Quote the quote!', 'ArialBlack.ttf', '#F8F8FF'),
        ('#F0FF00', 'Quote anything!', 'CourierPrime.ttf', '#000000'),
    ]
    box = (w * 0.08, h * 0.08, w * 0.92, h * 0.92)
    for i, (bg, content, face, ink) in enumerate(frames):
        x0, y0, x1, y1 = box
        if i:
            d.rectangle(box, fill=bg, outline='#88888A', width=max(3, int(h * 0.003)))
        band = (y1 - y0) * (0.3 if i < 2 else 1)
        text(d, (x0, y0, x1, y0 + band), content, face, ink, h * 0.16)
        inset = (x1 - x0) * 0.07
        gap = (y1 - y0) * 0.04  # breathing room above the quote inside
        box = (x0 + inset, y0 + band + gap, x1 - inset, y1 - (y1 - y0) * 0.07)
    return img


CONCEPTS = {'wall': wall, 'one-idea': one_idea, 'quote-the-quote': quote_the_quote}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, draw in CONCEPTS.items():
        for kind, size in SIZES.items():
            img = draw(size)
            assert img.mode == 'RGB' and img.size == size
            img.save(os.path.join(OUT, f'{kind}-{name}.png'))
            print(kind, name, size)
