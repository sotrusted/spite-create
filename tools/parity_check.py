#!/usr/bin/env python3
"""Post-page parity: does the post page's real text (drawn from the server's
draw list) look like the server's own render, across every font, style and
nesting? Seeds the local backend (tools/parity_seed.py), opens each post in
the booted simulator's Expo Go both ways - textMode=image (the render) and
textMode=plan (real text) - and compares the two screenshots.

    tools/parity_check.py            # all
    tools/parity_check.py nest       # labels containing 'nest'

Writes tools/parity-report/ (worst cases side by side) and exits non-zero
if any post exceeds THRESHOLD. Needs the local backend on :8001 and Metro.
"""
import os
import subprocess
import sys
import time

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UDID = os.environ.get('UDID', '832ED0A6-0FA5-459C-A4E8-3E439968012D')
HOST = os.environ.get('METRO', '127.0.0.1:8081')
OUT = os.path.join(ROOT, 'tools', 'parity-report')
# share of the screen's pixels where the two differ beyond a 2px neighbourhood:
# anti-aliasing (crisp text vs a resampled image) stays far below it; a
# wrong line break, size or position moves whole glyphs and lands far above
THRESHOLD = 0.002
SETTLE = 2.5


ENV = {**os.environ, 'PATH': os.path.join(ROOT, 'tools') + os.pathsep + os.environ['PATH']}


def sh(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, env=ENV).stdout


def shot(post_id, mode, path):
    sh('xcrun', 'simctl', 'openurl', UDID, f'exp://{HOST}/--/post/{post_id}?textMode={mode}')
    time.sleep(SETTLE)
    sh('xcrun', 'simctl', 'io', UDID, 'screenshot', path)


def visible_text():
    """Labels of the text elements on screen (the accessibility tree)."""
    import json
    tree = json.loads(sh(os.path.join(ROOT, 'tools', 'idb-venv', 'bin', 'idb'), 'ui', 'describe-all', '--udid', UDID))
    labels = [e.get('AXLabel') or '' for e in tree]
    # per-letter runs (rainbow, colour ranges) are one element per letter
    return ' '.join(labels) + '\n' + ''.join(labels)


def mismatch(a, b):
    a, b = a.convert('RGB'), b.convert('RGB')
    diff = None
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            d = ImageChops.difference(a, ImageChops.offset(b, dx, dy)).convert('L')
            diff = d if diff is None else ImageChops.darker(diff, d)
    mask = diff.point(lambda v: 255 if v > 64 else 0)
    # leave out the chrome (close, download, [Aa]) and the status bar
    w, h = a.size
    for box in [(0, 0, w, int(h * 0.12)), (int(w * 0.78), int(h * 0.88), w, h)]:
        mask.paste(0, box)
    return sum(mask.histogram()[255:]) / (w * h), mask


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    seeded = sh(os.path.join(ROOT, 'backend', 'venv', 'bin', 'python'), os.path.join(ROOT, 'backend', 'manage.py'),
                'shell', '-c', open(os.path.join(ROOT, 'tools', 'parity_seed.py')).read())
    posts = [line.split('\t') for line in seeded.splitlines() if line.count('\t') == 2]
    posts = [p for p in posts if only in p[1]]
    os.makedirs(OUT, exist_ok=True)
    results = []
    for post_id, label, word in posts:
        a, b = f'/tmp/parity-image.png', f'/tmp/parity-plan.png'
        shot(post_id, 'image', a)
        shot(post_id, 'plan', b)
        # plan mode must really be drawing text, not showing the image
        if word not in visible_text():
            print(f'NO TEXT DRAWN  {label}', flush=True)
            results.append((1.0, label + ' (no text drawn)', post_id))
            continue
        score, mask = mismatch(Image.open(a), Image.open(b))
        results.append((score, label, post_id))
        print(f'{score:.4%}  {label}', flush=True)
        if score >= THRESHOLD / 4:
            side = Image.new('RGB', (1320 * 3, 2868), 'white')
            side.paste(Image.open(a), (0, 0))
            side.paste(Image.open(b), (1320, 0))
            side.paste(mask.convert('RGB'), (2640, 0))
            side.resize((1980, 1434)).save(os.path.join(OUT, label.replace('/', '_') + '.png'))
    results.sort(reverse=True)
    bad = [r for r in results if r[0] >= THRESHOLD]
    print(f'\n{len(results)} posts, {len(bad)} over {THRESHOLD:.2%}; worst: '
          + ', '.join(f'{l} {s:.3%}' for s, l, _ in results[:5]))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
