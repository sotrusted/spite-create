"""Seeds the LOCAL backend with the parity matrix: every font in every main
style, mixed-font posts, nested quotes, gradients. Prints one post id per
line ("id<TAB>label"). Run through tools/parity_check.py, never on prod."""
import json
import os

from django.conf import settings

from posts.models import Post
from users.models import User

assert 'localhost' in (settings.ALLOWED_HOSTS or ['localhost']) or settings.DEBUG, 'local only'

author, _ = User.objects.get_or_create(device_id='parity-check-device', defaults={'is_anonymous_mode': True})
FONTS = [key for key, _ in Post.FONT_CHOICES]
STYLES = {
    'plain': {},
    'wrapped': {'content': 'a long line of text that has to wrap across the canvas at least twice over here'},
    'multiline': {'content': 'first line\nsecond, longer line\nthird'},
    'right': {'content': 'right aligned\ntwo lines', 'align': 'right'},
    'rainbow': {'rainbow': True, 'content': 'rainbow letters\nover two lines'},
    'runs': {'colorRuns': [{'start': 2, 'end': 7, 'color': '#0000EE'}], 'content': 'colour ranges here'},
    'spacing': {'letterSpacing': 18},
    'underline': {'underline': True, 'content': 'underlined\ntwice'},
    'chip': {'hasBackground': True, 'backgroundColor': '#F9FF4F', 'content': 'highlighted\nblock'},
    'bullets': {'listStyle': 'bullet', 'content': 'one\ntwo\nthree'},
    'outline': {'outlineColor': '#F8F8FF', 'content': 'BORDER\nROUND IT'},
    'bold_italic': {'bold': True, 'italic': True},
}


def el(font, style, y=1100, size=84, **extra):
    e = {'content': 'Quote Typ', 'x': 540, 'y': y, 'fontSize': size, 'color': '#111111', 'fontFamily': font,
         'hasBackground': False, 'backgroundColor': '#FFFFFF', 'align': 'center'}
    e.update(STYLES[style])
    e.update(extra)
    return e


def make(label, elements, **kw):
    p = Post(author=author, text_content=label, image_width=1080, image_height=2337,
             background_color=kw.pop('background_color', '#00CED1'), font_choice='arial-black', **kw)
    p._text_elements_data = elements
    p.save()
    # the first word drawn: the check looks for it as real text on screen
    first = next(w for e in elements for w in e['content'].split() if w.isalpha() or w.rstrip('.,!').isalpha())
    print(f'{p.id}\t{label}\t{first}')
    return p


for font in FONTS:
    for style in STYLES:
        make(f'{font}/{style}', [el(font, style)])

make('mixed', [el(f, s, y=280 + i * 230, size=64) for i, (f, s) in enumerate(zip(FONTS, list(STYLES) * 2))],
     background_color='#FAEBD7')
make('gradient', [el('impact', 'outline', size=120), el('petit-formal', 'plain', y=1500)],
     background_color='#FF1A1A', background_gradient=['#FF1A1A', '#FF940A', '#F0FF00'])
make('opacity_glow', [el('arial-black', 'plain', opacity=0.45), el('impact', 'plain', y=1400, glow=True,
                                                                    color='#F8F8FF')], background_color='#000000')
a = make('nest/1', [el('courier-prime', 'multiline'), el('impact', 'outline', y=1500)], background_color='#F0FF00')
b = make('nest/2', [el('cabin-sketch', 'rainbow', y=300)], background_color='#0000EE', is_repost=True,
         original_post=a, repost_geometry={'x': 54, 'y': 700, 'width': 972})
c = make('nest/3', [el('petit-formal', 'chip', y=250)], background_color='#FF90C2', is_repost=True,
         original_post=b, repost_geometry={'x': 80, 'y': 600, 'width': 920})
make('nest/4', [el('lexend-exa', 'bullets', y=260, size=60)], background_color='#FAEBD7', is_repost=True,
     original_post=c, repost_geometry={'x': 40, 'y': 520, 'width': 1000})
