"""
Golden image tests for post rendering.

Every test renders a Post exactly the way the API would and compares the PNG
against a blessed golden in posts/golden/. Workflow:

  1. First run creates missing goldens and skips ("golden created").
  2. Eyeball the PNGs in posts/golden/ - they are the spec.
  3. Subsequent runs fail if rendering drifts beyond tolerance; the failing
     render is written next to the golden as <name>.actual.png for diffing.
  4. To bless intentional changes: UPDATE_GOLDEN=1 python manage.py test posts

Run: python manage.py test posts
"""

import json
import math
import os
import shutil
import tempfile

from django.test import TestCase, override_settings
from PIL import Image, ImageChops, ImageDraw

from posts.models import Post
from users.models import User

GOLDEN_DIR = os.path.join(os.path.dirname(__file__), 'golden')
FIXTURES_DIR = os.path.join(
    os.path.dirname(__file__), '..', '..', 'shared', 'fixtures'
)
UPDATE_GOLDEN = os.environ.get('UPDATE_GOLDEN') == '1'

# The fixed logical canvas (frontend/src/utils/buildPostPayload.ts): width is
# constant, height follows the composing device's aspect (2340 = 393x852pt)
CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 2340

TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix='tbd-test-media-')


def rms_diff(img_a, img_b):
    """Root-mean-square pixel difference between two same-size RGB images."""
    diff = ImageChops.difference(img_a.convert('RGB'), img_b.convert('RGB'))
    histogram = diff.histogram()
    total = 0
    for channel in range(3):
        for value, count in enumerate(histogram[channel * 256:(channel + 1) * 256]):
            total += count * value * value
    return math.sqrt(total / (img_a.width * img_a.height * 3))


def ink_bbox(img, background_hex):
    """Bounding box of all pixels that differ from a solid background color."""
    background = Image.new('RGB', img.size, background_hex)
    return ImageChops.difference(img.convert('RGB'), background).getbbox()


def text_element(content, **overrides):
    element = {
        'content': content,
        'x': CANVAS_WIDTH / 2,
        'y': CANVAS_HEIGHT / 2,
        'fontSize': 96,
        'color': '#000000',
        'fontFamily': 'arial-black',
        'hasBackground': False,
        'backgroundColor': '#FFFFFF',
    }
    element.update(overrides)
    return element


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class RenderTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Shared across classes: recreate at class start, sweep at class end
        os.makedirs(TEST_MEDIA_ROOT, exist_ok=True)
        cls.addClassCleanup(shutil.rmtree, TEST_MEDIA_ROOT, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        # handle is auto-generated in User.save()
        cls.user = User.objects.create(is_anonymous_mode=True)

    def make_post(self, elements=None, **overrides):
        elements = elements or []
        post = Post(
            author=self.user,
            text_content=' '.join(el['content'] for el in elements),
            image_width=CANVAS_WIDTH,
            image_height=CANVAS_HEIGHT,
            background_color=overrides.pop('background_color', '#F8F8FF'),
            **overrides,
        )
        post._text_elements_data = elements
        post.save()
        return post

    def open_render(self, post):
        img = Image.open(post.rendered_image.path).convert('RGB')
        # Dimension invariant: the PNG always matches the stored canvas size
        self.assertEqual(
            img.size, (post.image_width, post.image_height),
            'Rendered PNG dimensions must equal the stored canvas dimensions',
        )
        return img

    def assert_matches_golden(self, post, name, tolerance=2.0):
        rendered = self.open_render(post)
        golden_path = os.path.join(GOLDEN_DIR, f'{name}.png')

        if UPDATE_GOLDEN or not os.path.exists(golden_path):
            os.makedirs(GOLDEN_DIR, exist_ok=True)
            rendered.save(golden_path)
            if not UPDATE_GOLDEN:
                self.skipTest(f'golden created: {golden_path} - re-run to compare')
            return

        golden = Image.open(golden_path).convert('RGB')
        self.assertEqual(rendered.size, golden.size,
                         f'{name}: canvas dimensions changed')
        score = rms_diff(rendered, golden)
        if score > tolerance:
            actual_path = os.path.join(GOLDEN_DIR, f'{name}.actual.png')
            rendered.save(actual_path)
            self.fail(
                f'{name}: render drifted from golden (RMS {score:.2f} > '
                f'{tolerance}). Actual saved to {actual_path}'
            )


class GoldenImageTests(RenderTestCase):
    def test_short_text_centered(self):
        post = self.make_post([text_element('HELLO WORLD')])
        # Crop bounds must be a strip around the vertical center
        self.assertLess(post.top_y, CANVAS_HEIGHT / 2)
        self.assertGreater(post.bottom_y, CANVAS_HEIGHT / 2)
        self.assert_matches_golden(post, 'short_text_centered')

    def test_long_text_wraps_inside_canvas(self):
        content = ('THIS IS A MUCH LONGER POST THAT HAS TO WRAP ONTO SEVERAL '
                   'LINES TO FIT THE CANVAS JUST LIKE THE COMPOSER WRAPS IT')
        post = self.make_post([text_element(content, fontSize=72)])

        # No ink outside the canvas width: rendering must not run off-canvas
        img = self.open_render(post)
        bbox = ink_bbox(img, '#F8F8FF')
        self.assertIsNotNone(bbox, 'expected visible text')
        self.assertGreaterEqual(bbox[0], 0)
        self.assertLessEqual(bbox[2], CANVAS_WIDTH)

        # Wrapping produced multiple lines: strip is much taller than one line
        self.assertGreater(post.bottom_y - post.top_y, 72 * 2)
        self.assert_matches_golden(post, 'long_text_wrapped')

    def test_tall_content_is_never_cut(self):
        # Bounds are the whole content extent; the feed shrinks a tall card
        # to fit its 5:4 box instead of cropping it
        post = self.make_post([
            text_element('TOP', y=200, fontSize=64),
            text_element('BOTTOM', y=2100, fontSize=64),
        ])
        self.assertLess(post.top_y, 200 - 32)
        self.assertGreater(post.bottom_y, 2100 + 32)

    def test_multiple_positioned_elements(self):
        post = self.make_post([
            text_element('TOP TEXT', y=300, fontSize=64, color='#FF1A1A'),
            text_element('BOTTOM TEXT', y=1400, fontSize=48, color='#0000EE',
                         hasBackground=True, backgroundColor='#FFFFFF'),
        ], background_color='#FFD700')
        # Crop bounds must span both elements
        self.assertLess(post.top_y, 300)
        self.assertGreater(post.bottom_y, 1400)
        self.assert_matches_golden(post, 'multiple_positioned_elements')


class StyledTextTests(RenderTestCase):
    def test_letter_spacing_widens_text(self):
        plain = self.make_post([text_element('SPACING TEST', color='#000000')],
                               background_color='#FFFFFF')
        spaced = self.make_post([text_element('SPACING TEST', color='#000000',
                                              letterSpacing=14)],
                                background_color='#FFFFFF')
        plain_bbox = ink_bbox(self.open_render(plain), '#FFFFFF')
        spaced_bbox = ink_bbox(self.open_render(spaced), '#FFFFFF')
        plain_width = plain_bbox[2] - plain_bbox[0]
        spaced_width = spaced_bbox[2] - spaced_bbox[0]
        # 11 gaps x 14px, minus kerning the per-char path drops
        self.assertGreater(spaced_width, plain_width + 100)
        self.assert_matches_golden(spaced, 'letter_spaced_text')

    def test_rainbow_cycles_colors_across_characters(self):
        post2 = self.make_post([text_element('RAINBOW', fontSize=120, rainbow=True)],
                               background_color='#FFFFFF')
        img = self.open_render(post2)
        strip = img.crop((0, post2.top_y, CANVAS_WIDTH, post2.bottom_y))
        colors = {rgb for _count, rgb in strip.getcolors(200000) or []}
        # At least four distinct palette hues should appear in the ink
        from posts.models import RAINBOW_TEXT_PALETTE
        palette = {tuple(int(c[i:i+2], 16) for i in (1, 3, 5)) for c in RAINBOW_TEXT_PALETTE}
        matches = sum(1 for rgb in colors if rgb in palette)
        self.assertGreaterEqual(matches, 4, f'only {matches} palette colors found')
        self.assert_matches_golden(post2, 'rainbow_text')

    def test_glow_extends_ink_beyond_sharp_text(self):
        plain = self.make_post([text_element('GLOW', fontSize=120, color='#FF1A1A')],
                               background_color='#000000')
        glowing = self.make_post([text_element('GLOW', fontSize=120, color='#FF1A1A',
                                               glow=True)],
                                 background_color='#000000')
        plain_bbox = ink_bbox(self.open_render(plain), '#000000')
        glow_bbox = ink_bbox(self.open_render(glowing), '#000000')
        # The halo must reach beyond the sharp glyph edges on every side
        self.assertLess(glow_bbox[0], plain_bbox[0])
        self.assertGreater(glow_bbox[2], plain_bbox[2])
        self.assert_matches_golden(glowing, 'glow_text')


class OpacityTests(RenderTestCase):
    def test_half_opacity_fades_ink_toward_background(self):
        solid = self.make_post([text_element('FADE', fontSize=120, color='#FF1A1A')],
                               background_color='#FFFFFF')
        faded = self.make_post([text_element('FADE', fontSize=120, color='#FF1A1A',
                                             opacity=0.45)],
                               background_color='#FFFFFF')
        from PIL import Image
        s_img = self.open_render(solid).convert('RGB')
        f_img = self.open_render(faded).convert('RGB')
        # Sample the darkest (most saturated red) pixel of each: the faded
        # element's reddest pixel must be visibly washed toward white
        def most_red(im):
            px = im.load()
            best = (255, 255, 255)
            for y in range(0, im.height, 4):
                for x in range(0, im.width, 4):
                    p = px[x, y]
                    if p[0] - (p[1] + p[2]) / 2 > best[0] - (best[1] + best[2]) / 2:
                        best = p
            return best
        sr, fr = most_red(s_img), most_red(f_img)
        self.assertGreater(fr[1], sr[1] + 60)  # faded red carries more white
        self.assert_matches_golden(faded, 'opacity_45')


class ThrottleKeyingTests(RenderTestCase):
    """Behind nginx every REMOTE_ADDR is 127.0.0.1; limits must key on the
    device id and the proxy-supplied real IP, never the socket address."""

    def _request(self, device=None, real_ip=None):
        from django.test import RequestFactory
        extra = {'REMOTE_ADDR': '127.0.0.1'}
        if device:
            extra['HTTP_X_DEVICE_ID'] = device
        if real_ip:
            extra['HTTP_X_REAL_IP'] = real_ip
        return RequestFactory().get('/api/feed/', **extra)

    def test_devices_behind_one_proxy_get_separate_buckets(self):
        from posts.throttles import PostCreateThrottle, RealIPThrottle
        t = PostCreateThrottle()
        a = t.get_cache_key(self._request(device='device-a', real_ip='1.1.1.1'), None)
        b = t.get_cache_key(self._request(device='device-b', real_ip='1.1.1.1'), None)
        self.assertNotEqual(a, b)
        ip = RealIPThrottle()
        x = ip.get_cache_key(self._request(real_ip='1.1.1.1'), None)
        y = ip.get_cache_key(self._request(real_ip='2.2.2.2'), None)
        self.assertNotEqual(x, y)
        self.assertNotIn('127.0.0.1', x)


class GlyphSanitizerTests(RenderTestCase):
    def test_zalgo_and_invisibles_are_stripped(self):
        from posts.models import _sanitize_glyphs
        zalgo = 'h' + '\u0336\u0334\u0335\u0337\u0338' * 4 + 'i'
        cleaned = _sanitize_glyphs(zalgo)
        marks = sum(1 for c in cleaned if __import__('unicodedata').combining(c))
        self.assertLessEqual(marks, 2)
        self.assertEqual(_sanitize_glyphs('a\u202Eevil\u200B\u0000b'), 'aevilb')
        self.assertEqual(_sanitize_glyphs('\u2605 \u00b6 \u2591\u2593 \u2192'), '\u2605 \u00b6 \u2591\u2593 \u2192')


class GradientTests(RenderTestCase):
    """Gradients crop to their content like any post, and the ramp is fitted
    to a band around that crop so even a one-line post shows all of it."""

    def _band(self, post):
        return post._gradient_band_for(post.top_y, post.bottom_y, post.image_height)

    def test_gradient_post_crops_to_its_content(self):
        post = self.make_post([text_element('SLICE', fontSize=90, color='#000000')],
                              background_color='#0000EE',
                              background_gradient=['#0000EE', '#00CED1'])
        self.assertLess(post.bottom_y - post.top_y, post.image_height * 0.25,
                        'gradient post kept the whole canvas instead of cropping')

    def test_whole_ramp_lands_inside_the_band(self):
        post = self.make_post([text_element('GRAD', fontSize=110, color='#F8F8FF')],
                              background_color='#FF1493',
                              background_gradient=['#FF1493', '#F0FF00'])
        im = self.open_render(post).convert('RGB')
        w = im.width
        top, bottom = self._band(post)
        self.assertGreaterEqual(bottom - top, 500)
        start = im.getpixel((0, top))
        finish = im.getpixel((w - 1, bottom - 1))
        # The line's two ends are the first and last stops
        for got, want in ((start, (0xFF, 0x14, 0x93)), (finish, (0xF0, 0xFF, 0x00))):
            for a, b in zip(got, want):
                self.assertLessEqual(abs(a - b), 4, f'{got} vs {want}')
        # Past the ends of the line the end colours continue, flat
        self.assertGreater(top, 0, 'band should sit inside the canvas for a centred post')
        self.assertEqual(im.getpixel((0, 0)), im.getpixel((0, top // 2)))
        self.assertEqual(im.getpixel((w - 1, im.height - 1)),
                         im.getpixel((w - 1, (bottom + im.height) // 2)))
        self.assert_matches_golden(post, 'gradient_bg')

    def test_isolines_are_perpendicular_to_the_band_diagonal(self):
        post = self.make_post([text_element('GRAD', fontSize=110, color='#F8F8FF')],
                              background_color='#FF1493',
                              background_gradient=['#FF1493', '#F0FF00'])
        im = self.open_render(post).convert('RGB')
        w = im.width
        top, bottom = self._band(post)
        b = bottom - top
        cx, cy = w / 2, (top + bottom) / 2
        norm = (w * w + b * b) ** 0.5
        # step along the isoline through the band centre, clear of the text
        dx, dy = 200 * b / norm, -200 * w / norm
        p1 = im.getpixel((int(cx + dx), int(cy + dy)))
        p2 = im.getpixel((int(cx - dx), int(cy - dy)))
        for a, c in zip(p1, p2):
            self.assertLessEqual(abs(a - c), 3, f'{p1} vs {p2}')

    def test_multi_stop_gradient_hits_every_colour(self):
        post = self.make_post([text_element('RAINBOW', fontSize=80, color='#000000')],
                              background_color='#FF1A1A',
                              background_gradient=['#FF1A1A', '#32CD32', '#0000EE'])
        im = self.open_render(post).convert('RGB')
        w = im.width
        top, bottom = self._band(post)
        b = bottom - top
        norm = (w * w + b * b) ** 0.5
        # t = 0.5 isoline through the band centre, stepped clear of the text
        mid = im.getpixel((int(w / 2 + 200 * b / norm), int((top + bottom) / 2 - 200 * w / norm)))
        # the middle stop must actually appear - a two-stop lerp would put
        # a red/blue blend here, not green
        self.assertGreater(mid[1], mid[0], f'middle stop missing, got {mid}')
        self.assertGreater(mid[1], mid[2], f'middle stop missing, got {mid}')


class FormattingTests(RenderTestCase):
    def test_bold_face_renders_wider(self):
        regular = self.make_post([text_element('WEIGHT TEST', fontFamily='courier-prime',
                                               color='#000000')], background_color='#FFFFFF')
        bold = self.make_post([text_element('WEIGHT TEST', fontFamily='courier-prime',
                                            color='#000000', bold=True)], background_color='#FFFFFF')
        r = ink_bbox(self.open_render(regular), '#FFFFFF')
        b = ink_bbox(self.open_render(bold), '#FFFFFF')
        # Bold face has heavier strokes: more ink coverage at same size
        # (Courier is monospaced so width is equal; compare ink density)
        img_r = self.open_render(regular).crop(r)
        img_b = self.open_render(bold).crop(b)
        dark_r = sum(1 for p in img_r.getdata() if sum(p) < 300)
        dark_b = sum(1 for p in img_b.getdata() if sum(p) < 300)
        self.assertGreater(dark_b, dark_r * 1.15, 'bold face not applied')

    def test_underline_draws_below_text(self):
        plain = self.make_post([text_element('UNDER', fontFamily='courier-prime',
                                             color='#000000')], background_color='#FFFFFF')
        underlined = self.make_post([text_element('UNDER', fontFamily='courier-prime',
                                                  color='#000000', underline=True)],
                                    background_color='#FFFFFF')
        p = ink_bbox(self.open_render(plain), '#FFFFFF')
        u = ink_bbox(self.open_render(underlined), '#FFFFFF')
        self.assertGreater(u[3], p[3] + 4, 'underline missing below the text')

    def test_list_prefixes_and_left_align(self):
        post = self.make_post([text_element('first\nsecond\nthird',
                                            fontFamily='courier-prime', listStyle='number')])
        elements = post._collect_text_elements()
        self.assertEqual(elements[0]['content'].split('\n')[0][:3], '1. ')
        self.assertEqual(elements[0]['content'].split('\n')[2][:3], '3. ')
        self.assertEqual(elements[0]['align'], 'left')

    def test_list_marker_variants(self):
        for style, marker in (('bullet', '\u2022 '), ('dash', '- '), ('star', '* ')):
            post = self.make_post([text_element('alpha\nbeta', listStyle=style)])
            elements = post._collect_text_elements()
            for line in elements[0]['content'].split('\n'):
                self.assertTrue(line.startswith(marker), f'{style}: {line!r}')


class HighlightBlockTests(RenderTestCase):
    """The highlighter is one rectangle spanning the text block edge to edge,
    not a staircase hugging each line's words."""

    def test_highlight_spans_the_block_not_each_line(self):
        post = self.make_post(
            [text_element('WIDE LINE OF TEXT HERE\nTINY', fontSize=72,
                          hasBackground=True, backgroundColor='#FFFFFF',
                          color='#000000')],
            background_color='#00CED1',
        )
        img = self.open_render(post)
        px = img.load()

        def white_span(y):
            xs = [x for x in range(0, CANVAS_WIDTH, 2) if px[x, y] == (255, 255, 255)]
            return (min(xs), max(xs)) if xs else None

        rows = [y for y in range(post.top_y, post.bottom_y, 2) if white_span(y)]
        self.assertTrue(rows, 'no highlight rendered')
        wide = white_span(rows[len(rows) // 4])       # beside the long line
        tiny = white_span(rows[-max(2, len(rows) // 8)])  # beside "TINY"
        self.assertEqual(wide, tiny, f'highlight is per-line, not a block ({wide} vs {tiny})')
        # and it is one solid block: no background-coloured gap between lines
        for y in range(rows[0], rows[-1], 2):
            self.assertIsNotNone(white_span(y), f'gap in the highlight at y={y}')


class TextSizeInvariantTests(RenderTestCase):
    """Locks 'text size on canvas' numerically, independent of goldens."""

    def measured_text_height(self, font_size, font_family='arial-black'):
        post = self.make_post([
            text_element('HHHH', fontSize=font_size, fontFamily=font_family,
                         color='#000000'),
        ], background_color='#FFFFFF')
        bbox = ink_bbox(self.open_render(post), '#FFFFFF')
        self.assertIsNotNone(bbox, f'no visible text at fontSize {font_size}')
        return bbox[3] - bbox[1]

    def test_font_size_scales_rendered_text(self):
        height_48 = self.measured_text_height(48)
        height_96 = self.measured_text_height(96)
        ratio = height_96 / height_48
        # Doubling fontSize must roughly double the rendered cap height.
        # This fails hard when a fixed-size fallback font sneaks in.
        self.assertGreater(ratio, 1.7, f'expected ~2x, got {ratio:.2f}x')
        self.assertLess(ratio, 2.3, f'expected ~2x, got {ratio:.2f}x')

    def test_rendered_height_tracks_font_size(self):
        for font_size in (48, 96, 144):
            height = self.measured_text_height(font_size)
            # Cap height for a real font is roughly 0.6-1.1em; the bitmap
            # fallback font renders ~11px regardless and fails this range.
            self.assertGreater(height, font_size * 0.5,
                               f'fontSize {font_size} rendered only {height}px tall')
            self.assertLess(height, font_size * 1.3,
                            f'fontSize {font_size} rendered {height}px tall')

    def test_every_font_family_is_scalable(self):
        for family, _label in Post.FONT_CHOICES:
            height = self.measured_text_height(96, font_family=family)
            self.assertGreater(
                height, 40,
                f"font family '{family}' rendered 96px text only {height}px "
                f'tall - its font file probably failed to load',
            )


class BackgroundImageTests(RenderTestCase):
    def make_background_file(self, color='#FF0000', size=(200, 100)):
        path = os.path.join(TEST_MEDIA_ROOT, 'bg_source.png')
        Image.new('RGB', size, color).save(path)
        return f'file://{path}', size

    def test_background_image_covers_canvas_and_is_never_cropped(self):
        uri, (img_w, img_h) = self.make_background_file()
        cover_scale = max(CANVAS_WIDTH / img_w, CANVAS_HEIGHT / img_h)
        post = self.make_post(
            [text_element('CAPTION', fontSize=64, color='#FFFFFF')],
            background_image=uri,
            background_image_scale=cover_scale,
            background_image_position={'x': 0, 'y': 0},
        )
        # A photo post without crop bars is the whole canvas (the feed
        # shrinks it into its card)
        self.assertEqual((post.top_y, post.bottom_y), (0, CANVAS_HEIGHT))

        img = self.open_render(post)
        # Cover scaling: corners must show the background image, not the fill
        for x, y in [(2, 2), (CANVAS_WIDTH - 3, 2), (2, CANVAS_HEIGHT - 3),
                     (CANVAS_WIDTH - 3, CANVAS_HEIGHT - 3)]:
            self.assertEqual(img.getpixel((x, y)), (255, 0, 0),
                             f'corner ({x},{y}) not covered by background image')
        self.assert_matches_golden(post, 'background_image_cover')

    def test_crop_bars_bound_image_posts(self):
        uri, (img_w, img_h) = self.make_background_file()
        cover_scale = max(CANVAS_WIDTH / img_w, CANVAS_HEIGHT / img_h)
        post = self.make_post(
            # Caption sits inside the band: must not widen the crop
            [text_element('CAPTION', y=1150, fontSize=64, color='#FFFFFF')],
            background_image=uri,
            background_image_scale=cover_scale,
            background_image_position={'x': 0, 'y': 0},
            crop_top=800,
            crop_bottom=1500,
        )
        # Feed shows exactly the band the composer's crop bars chose
        self.assertEqual(post.top_y, 800)
        self.assertEqual(post.bottom_y, 1500)
        self.open_render(post)

    def test_content_outside_crop_band_extends_bounds(self):
        uri, (img_w, img_h) = self.make_background_file()
        cover_scale = max(CANVAS_WIDTH / img_w, CANVAS_HEIGHT / img_h)
        post = self.make_post(
            # Text placed above the band must stay visible
            [text_element('ABOVE THE BAND', y=300, fontSize=64, color='#FFFFFF')],
            background_image=uri,
            background_image_scale=cover_scale,
            background_image_position={'x': 0, 'y': 0},
            crop_top=800,
            crop_bottom=1500,
        )
        self.assertLess(post.top_y, 300)
        self.assertEqual(post.bottom_y, 1500)


class StickerTests(RenderTestCase):
    def make_sticker_file(self, color='#00FF00', size=(120, 120)):
        path = os.path.join(TEST_MEDIA_ROOT, 'sticker_source.png')
        Image.new('RGBA', size, color).save(path)
        return path, size

    def test_sticker_renders_at_position_and_extends_bounds(self):
        path, (w, h) = self.make_sticker_file()
        sticker = {
            'uri': path, 'x': CANVAS_WIDTH // 2, 'y': 300,
            'width': w, 'height': h, 'scale': 1.0, 'rotation': 0,
        }
        post = self.make_post(
            [text_element('WITH STICKER', y=1200, fontSize=64)],
            sticker_elements=[sticker],
        )
        img = self.open_render(post)
        self.assertEqual(img.getpixel((CANVAS_WIDTH // 2, 300))[:3], (0, 255, 0),
                         'sticker not rendered at its position')
        # Crop bounds include the sticker, not just the text
        self.assertLessEqual(post.top_y, 300 - h // 2)
        self.assert_matches_golden(post, 'sticker_with_text')


class PayloadContractTests(RenderTestCase):
    """Consumes the same blessed fixture as the frontend contract test
    (frontend: npm test), pinning the full composer-state -> pixels path."""

    def test_shared_fixture_payload_renders(self):
        fixture_path = os.path.join(FIXTURES_DIR, 'post-payload.json')
        with open(fixture_path) as f:
            payload = json.load(f)

        response = self.client.post(
            '/api/posts/', payload,
            content_type='application/json',
            HTTP_X_DEVICE_ID='golden-test-device',
        )
        self.assertEqual(response.status_code, 201, response.content)

        post = Post.objects.get(id=response.json()['id'])
        self.assertEqual(post.image_width, payload['canvas_width'])
        self.assertEqual(post.image_height, payload['canvas_height'])
        self.assert_matches_golden(post, 'contract_payload')


class ImageGateTests(RenderTestCase):
    """Image posts are gated off for launch (ALLOW_IMAGE_POSTS=False).
    The rendering pipeline itself stays tested above via direct model use,
    so flipping the gate back on needs no test changes."""

    def test_image_posts_rejected_while_gated(self):
        response = self.client.post(
            '/api/posts/',
            {'text_content': 'has an image', 'background_image': 'http://example.test/x.png'},
            content_type='application/json',
            HTTP_X_DEVICE_ID='gate-test-device',
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_sticker_posts_rejected_while_gated(self):
        response = self.client.post(
            '/api/posts/',
            {'text_content': 'has a sticker',
             'sticker_elements': [{'uri': 'http://example.test/s.png', 'x': 1, 'y': 1}]},
            content_type='application/json',
            HTTP_X_DEVICE_ID='gate-test-device',
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_upload_endpoints_rejected_while_gated(self):
        self.assertEqual(self.client.post('/api/backgrounds/upload/').status_code, 403)
        self.assertEqual(self.client.post('/api/stickers/upload/').status_code, 403)


class RemoteStorageRepostTests(RenderTestCase):
    """S3 storage has no local .path. Reading the quoted parent through it
    raised NotImplementedError, generate_image swallowed the error, and every
    repost in production silently rendered without its parent strip."""

    def test_parent_strip_composites_when_storage_has_no_path(self):
        parent = self.make_post([text_element('PARENT', color='#000000')],
                                background_color='#00CED1')

        from unittest import mock
        storage = parent.rendered_image.storage
        parent_name = parent.rendered_image.name
        real_path = storage.path

        real_open = storage.open

        # Emulate S3 faithfully: the parent's file has no local .path, but it
        # IS readable as a stream. (Local storage's own open() goes through
        # path(), so it gets a bypass that uses the pre-patch resolver.)
        def selective_path(name):
            if name == parent_name:
                raise NotImplementedError('This backend does not support absolute paths.')
            return real_path(name)

        def streaming_open(name, mode='rb'):
            if name == parent_name:
                import io as _io
                return _io.open(real_path(name), mode)
            return real_open(name, mode)

        with mock.patch.object(storage, 'path', side_effect=selective_path), \
             mock.patch.object(storage, 'open', side_effect=streaming_open):
            with self.assertRaises(NotImplementedError):
                _ = parent.rendered_image.path  # the S3 behaviour we emulate
            repost = self.make_post([text_element('REPLY', y=700, color='#FFFFFF')],
                                    background_color='#000000', is_repost=True,
                                    original_post=parent,
                                    repost_geometry={'x': 86, 'y': 1200, 'width': 907})

        img = self.open_render(repost).convert('RGB')
        # the parent's turquoise canvas must appear inside the composite
        found = any(
            img.getpixel((x, y)) == (0, 206, 209)
            for y in range(0, img.height, 4)
            for x in range(0, img.width, 4)
        )
        self.assertTrue(found, 'quoted parent strip missing from the composite')


class ReplyMarginTests(RenderTestCase):
    """The reply's outer edge gets extra room so it is not flush against the
    crop when the quote anchors the other side."""

    def _bounds(self, reply_y, strip_y):
        parent = self.make_post([text_element('P', color='#000000')],
                                background_color='#00CED1')
        return self.make_post([text_element('REPLY', y=reply_y, color='#FFFFFF')],
                              background_color='#000000', is_repost=True,
                              original_post=parent,
                              repost_geometry={'x': 86, 'y': strip_y, 'width': 907})

    def test_reply_above_quote_gets_top_room(self):
        plain = self.make_post([text_element('REPLY', y=600, color='#000000')],
                               background_color='#FFFFFF')
        quoted = self._bounds(reply_y=600, strip_y=1400)
        plain_gap = 600 - plain.top_y
        quoted_gap = 600 - quoted.top_y
        self.assertGreater(quoted_gap, plain_gap,
                           'reply above the quote got no extra top room')

    def test_reply_below_quote_gets_bottom_room(self):
        quoted = self._bounds(reply_y=1500, strip_y=800)
        self.assertGreater(quoted.bottom_y - 1500, 88,
                           'reply below the quote got no extra bottom room')


class OversizedQuoteTests(RenderTestCase):
    """A quote can be enlarged past the canvas edges, so the strip may be
    wider than the canvas and land at negative coordinates."""

    def test_quote_wider_than_canvas_still_composites(self):
        parent = self.make_post([text_element('BIG', color='#000000')],
                                background_color='#00CED1')
        repost = self.make_post([text_element('REPLY', y=400, color='#FFFFFF')],
                                background_color='#000000', is_repost=True,
                                original_post=parent,
                                repost_geometry={'x': -300, 'y': 600,
                                                 'width': int(CANVAS_WIDTH * 1.8)})
        img = self.open_render(repost).convert('RGB')
        found = any(
            img.getpixel((x, y)) == (0, 206, 209)
            for y in range(0, img.height, 4)
            for x in range(0, img.width, 4)
        )
        self.assertTrue(found, 'oversized quote did not composite')
        # bounds stay inside the canvas
        self.assertGreaterEqual(repost.top_y, 0)
        self.assertLessEqual(repost.bottom_y, repost.image_height)


class QuoteChainTests(RenderTestCase):
    def test_two_level_chain_rects_nest(self):
        leaf = self.make_post([text_element('LEAF', color='#000000')],
                              background_color='#00CED1')
        mid = self.make_post([text_element('MID REPLY', y=800)],
                             background_color='#FFD700', is_repost=True,
                             original_post=leaf,
                             repost_geometry={'x': 86, 'y': 1200, 'width': 907})
        top = self.make_post([text_element('TOP REPLY', y=700)],
                             background_color='#000000', is_repost=True,
                             original_post=mid,
                             repost_geometry={'x': 86, 'y': 1100, 'width': 907})

        from posts.serializers import PostListSerializer
        chain = PostListSerializer(context={}).get_quote_chain(top)
        self.assertEqual(len(chain), 2)
        level1, level2 = chain
        self.assertEqual(level1['rect']['x'], 86)
        self.assertEqual(level1['rect']['y'], 1100)
        self.assertEqual(level1['snippet'], 'MID REPLY')
        # Level 2's rect nests inside level 1's strip: x maps through the
        # level-1 scale, y accounts for the strip's crop offset
        scale1 = 907 / CANVAS_WIDTH
        expected_x = int(86 + 86 * scale1)
        self.assertEqual(level2['rect']['x'], expected_x)
        self.assertGreater(level2['rect']['y'], level1['rect']['y'])
        self.assertLess(level2['rect']['width'], level1['rect']['width'])
        self.assertEqual(level2['snippet'], 'LEAF')
        # Mid is a repost so its strip source is its reply-only render
        self.assertIn('_response', level1['strip']['url'])


class RepostTests(RenderTestCase):
    def test_repost_strip_inset_on_new_background(self):
        original = self.make_post(
            [text_element('ORIGINAL', fontSize=96, color='#000000')],
            background_color='#00CED1',
        )
        repost = self.make_post(
            [text_element('REPOST CAPTION', y=1400, fontSize=48, color='#FF1A1A')],
            background_color='#FFD700',
            is_repost=True,
            original_post=original,
            # WYSIWYG placement from the composer, in canvas px
            repost_geometry={'x': 43, 'y': 1500, 'width': 994},
        )
        img = self.open_render(repost)

        # The strip bakes exactly where the composer placed it
        strip_rows = [y for y in range(1400, CANVAS_HEIGHT)
                      if img.getpixel((100, y)) == (0, 206, 209)]
        self.assertTrue(strip_rows, 'quoted strip missing at its WYSIWYG position')
        self.assertAlmostEqual(min(strip_rows), 1500, delta=4)
        # Inset per the geometry: edge shows the reposter's gold at strip rows
        self.assertEqual(img.getpixel((10, strip_rows[len(strip_rows) // 2])), (255, 215, 0),
                         "reposter's background missing outside the strip")
        self.assertEqual(img.getpixel((10, 50)), (255, 215, 0),
                         "reposter's background hidden above the response")

        # Composite bounds span caption through strip
        self.assertLessEqual(repost.top_y, repost.response_top_y)
        self.assertGreater(repost.bottom_y, max(strip_rows))
        self.assert_matches_golden(repost, 'repost_composite')

    def test_repost_has_response_only_render(self):
        original = self.make_post(
            [text_element('ORIGINAL', fontSize=96, color='#000000')],
            background_color='#00CED1',
        )
        repost = self.make_post(
            [text_element('JUST THE RESPONSE', y=1900, fontSize=48, color='#FF1A1A')],
            background_color='#FFD700',
            is_repost=True,
            original_post=original,
        )
        self.assertTrue(repost.response_image, 'reposts must produce a response-only render')
        response = Image.open(repost.response_image.path).convert('RGB')
        # No quoted strip in the response render: canvas center is gold
        self.assertEqual(response.getpixel((100, CANVAS_HEIGHT // 2)), (255, 215, 0))
        # Response bounds crop to the caption alone, not the strip
        self.assertGreater(repost.response_top_y, CANVAS_HEIGHT // 2)
        self.assertGreaterEqual(repost.response_bottom_y, 1900)
        self.assertLess(repost.response_bottom_y - repost.response_top_y,
                        repost.bottom_y - repost.top_y)


class SignatureRenderTests(RenderTestCase):
    def test_signed_post_renders_handle_below_content(self):
        unsigned = self.make_post([text_element('SAME TEXT', color='#000000')],
                                  background_color='#FFFFFF')
        signed = self.make_post([text_element('SAME TEXT', color='#000000')],
                                background_color='#FFFFFF', is_signed=True)
        # The signature extends the crop by roughly one small line
        self.assertGreater(signed.bottom_y, unsigned.bottom_y)
        # Ink exists in the signature zone (between old and new bottom)
        img = self.open_render(signed)
        zone = img.crop((0, unsigned.bottom_y, CANVAS_WIDTH, signed.bottom_y))
        self.assertIsNotNone(ink_bbox(zone, '#FFFFFF'), 'signature line not rendered')


class BlockTests(RenderTestCase):
    def _post_as(self, device_id, text):
        response = self.client.post(
            '/api/posts/', {'text_content': text},
            content_type='application/json', HTTP_X_DEVICE_ID=device_id,
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def _feed_texts(self, device_id):
        response = self.client.get('/api/feed/', HTTP_X_DEVICE_ID=device_id)
        return [p['text_content'] for p in response.json()['results']]

    def test_block_hides_posts_in_both_directions(self):
        self._post_as('device-a', 'post from a')
        self._post_as('device-b', 'post from b')

        # Both see each other before the block
        self.assertIn('post from b', self._feed_texts('device-a'))
        self.assertIn('post from a', self._feed_texts('device-b'))

        # A blocks B (find B's handle via profile)
        b_handle = self.client.get('/api/users/profile/', HTTP_X_DEVICE_ID='device-b').json()['handle']
        response = self.client.post(f'/api/users/{b_handle}/block/', HTTP_X_DEVICE_ID='device-a')
        self.assertEqual(response.status_code, 200, response.content)

        # Hidden both ways
        self.assertNotIn('post from b', self._feed_texts('device-a'))
        self.assertNotIn('post from a', self._feed_texts('device-b'))
        # Unrelated viewer still sees both
        self.assertIn('post from b', self._feed_texts('device-c'))
        self.assertIn('post from a', self._feed_texts('device-c'))

    def test_quote_chip_data_and_blocked_hiding(self):
        a_post = self._post_as('device-a', 'the original words here')
        # B reposts A
        response = self.client.post(
            '/api/posts/',
            {'text_content': 'the response',
             'repost_data': {'original_post_id': a_post['id'], 'screenshot_uri': 'x'}},
            content_type='application/json', HTTP_X_DEVICE_ID='device-b',
        )
        self.assertEqual(response.status_code, 201, response.content)

        # Unrelated viewer sees the quote chip data
        feed = self.client.get('/api/feed/', HTTP_X_DEVICE_ID='device-c').json()['results']
        repost = next(p for p in feed if p['is_repost'])
        self.assertFalse(repost['quote']['hidden'])
        self.assertEqual(repost['quote']['snippet'], 'the original words here'[:24])
        self.assertIsNotNone(repost['response_image_url'])
        # A repost never keeps its parent's background color (server nudge)
        self.assertNotEqual(repost['background_color'], repost['quote']['background_color'])

        # C blocks A: the quoted strip hides for C, the response stays
        a_handle = self.client.get('/api/users/profile/', HTTP_X_DEVICE_ID='device-a').json()['handle']
        self.client.post(f'/api/users/{a_handle}/block/', HTTP_X_DEVICE_ID='device-c')
        feed = self.client.get('/api/feed/', HTTP_X_DEVICE_ID='device-c').json()['results']
        texts = [p['text_content'] for p in feed]
        self.assertNotIn('the original words here', texts, "blocked author's own post must vanish")
        repost = next(p for p in feed if p['is_repost'])
        self.assertTrue(repost['quote']['hidden'], 'quoted strip must hide for the blocker')


class AlternatingTextColorTests(RenderTestCase):
    """Per-letter alternation between two palette colours. Shares the
    per-character draw path with rainbow, so the guard is that a duo
    actually reaches the pixels and that junk input never does."""

    def _element(self, colors):
        return text_element('ABCD', color='#000000', alternateColors=colors)

    def test_letters_alternate_between_the_two_colours(self):
        post = self.make_post([self._element(['#FF1A1A', '#0000EE'])],
                              background_color='#F8F8FF')
        img = Image.open(post.rendered_image.path).convert('RGB')
        counts = {}
        for pixel in img.getdata():
            counts[pixel] = counts.get(pixel, 0) + 1
        # Both chosen colours are inked, and the element's own colour is not
        self.assertGreater(counts.get((255, 26, 26), 0), 200, 'first colour missing')
        self.assertGreater(counts.get((0, 0, 238), 0), 200, 'second colour missing')
        self.assertLess(counts.get((0, 0, 0), 0), 200, 'base colour still drawn')

    def test_normalizer_accepts_a_valid_pair(self):
        self.assertEqual(
            Post._normalize_alternate_colors(['#ff1a1a', '#0000EE']),
            ['#FF1A1A', '#0000EE'],
        )

    def test_normalizer_rejects_junk(self):
        for bad in (
            None, [], ['#FF1A1A'], ['#FF1A1A', '#0000EE', '#32CD32'],
            ['#FF1A1A', '#FF1A1A'],            # same colour twice
            ['#FF1A1A', '#123456'],            # off-palette
            ['#FF1A1A', 42], 'not-a-list',
        ):
            self.assertIsNone(Post._normalize_alternate_colors(bad), bad)

    def test_pair_wins_over_rainbow(self):
        post = self.make_post(
            [text_element('ABCD', color='#000000', rainbow=True,
                          alternateColors=['#FF1A1A', '#0000EE'])],
            background_color='#F8F8FF')
        img = Image.open(post.rendered_image.path).convert('RGB')
        colors = {p for p in img.getdata()}
        # Rainbow's third stop would appear if rainbow had won
        self.assertNotIn((255, 215, 0), colors)
        self.assertIn((255, 26, 26), colors)


class FeedQueryTests(RenderTestCase):
    """The feed's query count must not grow with how many deep quote chains
    are on the page. Walking original_post level by level per post made it
    one query per ancestor per post (up to ~250 for a page of deep chains)."""

    GEOMETRY = {'x': 86, 'y': 900, 'width': 907}

    def _chain(self, depth, label):
        post = self.make_post([text_element(f'{label}0', color='#000000')])
        for level in range(1, depth + 1):
            post = self.make_post([text_element(f'{label}{level}', color='#000000', y=500)],
                                  is_repost=True, original_post=post,
                                  repost_geometry=self.GEOMETRY)
        return post

    def _feed_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/feed/?page_size=50',
                                       HTTP_X_DEVICE_ID=self.user.device_id)
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries), response.json()['results']

    def test_query_count_is_independent_of_how_many_deep_chains(self):
        self.user.device_id = 'feed-query-device'
        self.user.save()
        self._chain(5, 'A')
        one_chain, _ = self._feed_queries()
        for label in 'BCDE':
            self._chain(5, label)
        five_chains, results = self._feed_queries()
        self.assertEqual(five_chains, one_chain,
                         f'{one_chain} queries with one deep chain, {five_chains} with five')
        # and the chain itself is still complete
        deepest = max(results, key=lambda p: len(p['quote_chain']))
        self.assertEqual(len(deepest['quote_chain']), 5)


class RequestIdentityTests(RenderTestCase):
    """Correctness fixes found in the scale audit."""

    def _payload(self):
        with open(os.path.join(FIXTURES_DIR, 'post-payload.json')) as f:
            return json.load(f)

    def test_restricted_user_is_refused_and_nothing_is_saved(self):
        restricted = User.objects.create(device_id='restricted-device', is_shadowbanned=True)
        before = Post.objects.count()
        response = self.client.post('/api/posts/', self._payload(),
                                    content_type='application/json',
                                    HTTP_X_DEVICE_ID=restricted.device_id)
        # was a 201 for a post that was never saved
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual(Post.objects.count(), before)

    def test_requests_without_a_device_id_mint_no_users(self):
        before = User.objects.count()
        self.assertEqual(self.client.get('/api/notifications/').status_code, 200)
        self.assertEqual(self.client.post('/api/notifications/read/').status_code, 400)
        self.assertEqual(User.objects.count(), before)

    def test_viewing_a_post_counts_the_view(self):
        post = self.make_post([text_element('SEEN', color='#000000')])
        for _ in range(3):
            self.assertEqual(self.client.get(f'/api/posts/{post.id}/').status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.view_count, 3)


class RainbowVisibilityTests(RenderTestCase):
    """Rainbow letters in the background's own colour vanished ("Ne York C ty"
    on a red post). Colours that match a solid background are skipped."""

    def _colours_in(self, post):
        return {p for p in self.open_render(post).getdata()}

    def test_every_letter_is_visible_on_a_matching_background(self):
        post = self.make_post([text_element('ABCDEFGHIJKL', fontSize=80, color='#000000', rainbow=True)],
                              background_color='#FF1A1A')
        palette = post._rainbow_palette()
        self.assertNotIn('#FF1A1A', palette)
        self.assertEqual(len(palette), 5)
        # the remaining five all reach the pixels
        colours = self._colours_in(post)
        for hex_colour in palette:
            rgb = tuple(int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
            self.assertIn(rgb, colours, f'{hex_colour} missing from the render')

    def test_near_matches_are_skipped_too(self):
        post = self.make_post([text_element('ABC', color='#000000', rainbow=True)],
                              background_color='#F0FF00')  # neon yellow vs rainbow gold
        self.assertNotIn('#FFD700', post._rainbow_palette())

    def test_unrelated_backgrounds_keep_the_whole_rainbow(self):
        post = self.make_post([text_element('ABC', color='#FFFFFF', rainbow=True)],
                              background_color='#000000')
        self.assertEqual(len(post._rainbow_palette()), 6)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   REPORT_DIGEST_EMAIL='mod@example.com')
class ReviewNotAutoBanTests(RenderTestCase):
    """Reports queue a user for review; only a moderator bans."""

    def _report(self, target, reporter_device):
        return self.client.post(f'/api/users/{target.handle}/report/',
                                {'reason': 'harassment'}, content_type='application/json',
                                HTTP_X_DEVICE_ID=reporter_device)

    def test_reports_queue_for_review_without_banning(self):
        target = User.objects.create(device_id='reported-device')
        for i in range(3):
            self.assertEqual(self._report(target, f'reporter-{i}').status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.report_count, 3)
        self.assertTrue(target.needs_review)
        self.assertFalse(target.is_shadowbanned, 'reports alone must never ban')

    def test_digest_lists_users_awaiting_review(self):
        from django.core import mail
        from django.core.management import call_command
        User.objects.create(device_id='queued-device', needs_review=True, report_count=4)
        call_command('report_digest', stdout=open(os.devnull, 'w'))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('awaiting review', mail.outbox[0].body)
        self.assertIn('4 reports', mail.outbox[0].body)


class DiagnosticsUnlinkedTests(TestCase):
    """Sentry events are declared to Apple as not linked to the user."""

    def test_device_id_is_scrubbed_from_error_events(self):
        from django.conf import settings
        # the shape the Django integration sends: headers and body (env only
        # ever carries SERVER_NAME / SERVER_PORT)
        event = {'request': {'headers': {'X-Device-Id': 'd-123', 'User-Agent': 'Type/1'},
                             'data': {'device_id': 'd-123', 'reason': 'spam'}}}
        settings.SENTRY_SCRUBBER.scrub_event(event)
        flat = json.dumps(event, default=lambda o: getattr(o, 'value', repr(o)))
        self.assertNotIn('d-123', flat)
        self.assertEqual(event['request']['headers']['User-Agent'], 'Type/1')


class ContentBoxTests(RenderTestCase):
    """content_boxes are the true rectangles of what a post contains, so the
    client can keep overlay chrome off them."""

    def test_text_and_quote_strip_boxes(self):
        parent = self.make_post([text_element('PARENT', color='#000000')])
        repost = self.make_post([text_element('REPLY', y=500, color='#000000')],
                                is_repost=True, original_post=parent,
                                repost_geometry={'x': 200, 'y': 900, 'width': 600})
        boxes = repost.content_boxes
        self.assertEqual(len(boxes), 2)
        reply_box = min(boxes, key=lambda b: b[1])
        strip_box = max(boxes, key=lambda b: b[1])
        self.assertLess(reply_box[0], CANVAS_WIDTH / 2)          # centred text straddles the middle
        self.assertGreater(reply_box[2], CANVAS_WIDTH / 2)
        # the strip is its real rect, not the full canvas width
        self.assertEqual((strip_box[0], strip_box[2]), (200, 800))

    def test_backfill_matches_render(self):
        from django.core.management import call_command
        # stored the way the API stores them (make_post alone only sets the
        # in-memory copy, which a reload loses)
        elements = [text_element('BOX', color='#000000')]
        post = self.make_post(elements, text_elements=elements)
        rendered = post.content_boxes
        Post.objects.filter(pk=post.pk).update(content_boxes=None)
        call_command('refresh_content_boxes', stdout=open(os.devnull, 'w'))
        post.refresh_from_db()
        self.assertEqual(post.content_boxes, rendered)


class CanvasStateTests(RenderTestCase):
    """The composer's typed state is stored with the post and handed back only
    to its author, whose "Edit again" restores it."""

    STATE = {'version': 1, 'screenWidth': 402, 'screenHeight': 874,
             'textElements': [{'id': '1', 'content': 'THE PAYLOAD CONTRACT', 'x': 201, 'y': 437}],
             'backgroundColor': '#FFD700', 'repost': None}

    def _create(self, state, device='author-device'):
        with open(os.path.join(FIXTURES_DIR, 'post-payload.json')) as f:
            payload = json.load(f)
        payload['canvas_state'] = state
        return self.client.post('/api/posts/', payload, content_type='application/json',
                                HTTP_X_DEVICE_ID=device)

    def test_author_gets_the_state_back_and_others_do_not(self):
        created = self._create(self.STATE)
        self.assertEqual(created.status_code, 201, created.content)
        post_id = created.json()['id']
        mine = self.client.get(f'/api/posts/{post_id}/', HTTP_X_DEVICE_ID='author-device').json()
        self.assertEqual(mine['canvas_state'], self.STATE)
        self.assertTrue(mine['editable'])
        theirs = self.client.get(f'/api/posts/{post_id}/', HTTP_X_DEVICE_ID='someone-else').json()
        self.assertNotIn('canvas_state', theirs)
        self.assertFalse(theirs['editable'])

    def test_feed_marks_only_your_own_posts_editable(self):
        self._create(self.STATE)
        feed = lambda device: self.client.get('/api/feed/', HTTP_X_DEVICE_ID=device).json()['results']
        self.assertTrue(feed('author-device')[0]['editable'])
        self.assertFalse(feed('someone-else')[0]['editable'])
        self.assertNotIn('canvas_state', feed('author-device')[0])  # list stays light

    def test_malformed_state_is_rejected(self):
        self.assertEqual(self._create({'no': 'version'}).status_code, 400)
        self.assertEqual(self._create({'version': 1, 'blob': 'x' * 200_000}).status_code, 400)


class AccountDeletionTests(RenderTestCase):
    """Deleting an account removes the user's data everywhere, including where
    other people's reposts had it baked in."""

    GEOMETRY = {'x': 140, 'y': 900, 'width': 800}

    def _post(self, author, content, **overrides):
        elements = [text_element(content, color=overrides.pop('ink', '#000000'), y=overrides.pop('y', 500))]
        post = Post(author=author, text_content=content, image_width=CANVAS_WIDTH,
                    image_height=CANVAS_HEIGHT, text_elements=elements,
                    background_color=overrides.pop('background_color', '#F8F8FF'), **overrides)
        post._text_elements_data = elements
        post.save()
        return post

    def setUp(self):
        super().setUp()
        self.leaver = User.objects.create(device_id='leaver-device')
        self.quoter = User.objects.create(device_id='quoter-device')
        self.third = User.objects.create(device_id='third-device')
        # distinctive cyan background so any surviving trace is detectable
        self.original = self._post(self.leaver, 'GOODBYE', background_color='#00CED1')
        self.quote = self._post(self.quoter, 'QUOTING', is_repost=True, original_post=self.original,
                                repost_geometry=self.GEOMETRY, background_color='#F0FF00')
        self.quote_of_quote = self._post(self.third, 'DEEPER', is_repost=True, original_post=self.quote,
                                         repost_geometry=self.GEOMETRY, background_color='#FF90C2')

    def _pixels(self, post):
        return set(Image.open(post.rendered_image.path).convert('RGB').getdata())

    def test_deleting_a_post_keeps_other_peoples_reposts(self):
        self.original.delete()
        self.assertTrue(Post.objects.filter(pk=self.quote.pk).exists())
        self.assertTrue(Post.objects.filter(pk=self.quote_of_quote.pk).exists())

    def test_account_deletion_scrubs_the_user_everywhere(self):
        cyan, removed_fill = (0, 206, 209), (0x3D, 0x3D, 0x42)
        self.assertIn(cyan, self._pixels(self.quote))           # baked in before
        old_files = [self.original.rendered_image.path, self.quote.rendered_image.path,
                     self.quote_of_quote.rendered_image.path]

        response = self.client.delete('/api/users/me/', HTTP_X_DEVICE_ID='leaver-device')
        self.assertEqual(response.status_code, 204)

        self.assertFalse(User.objects.filter(device_id='leaver-device').exists())
        self.assertFalse(Post.objects.filter(pk=self.original.pk).exists())
        quote = Post.objects.get(pk=self.quote.pk)
        deeper = Post.objects.get(pk=self.quote_of_quote.pk)
        self.assertIsNone(quote.original_post_id)
        self.assertIn('removed', quote.repost_geometry)
        # the deleted post is gone from both surviving images, placeholder in its place
        for post in (quote, deeper):
            pixels = self._pixels(post)
            self.assertNotIn(cyan, pixels, f'{post.text_content} still shows the deleted post')
            self.assertIn(removed_fill, pixels, f'{post.text_content} has no placeholder')
        # the placeholder keeps its footprint inside the crop
        self.assertLessEqual(quote.top_y, 500)
        self.assertGreaterEqual(quote.bottom_y, quote.repost_geometry['removed']['y'] + 50)
        # every old image that showed the deleted post is gone from storage
        for path in old_files:
            self.assertFalse(os.path.exists(path), f'{path} survived')

    def test_deletion_is_idempotent_and_needs_a_device(self):
        self.assertEqual(self.client.delete('/api/users/me/', HTTP_X_DEVICE_ID='leaver-device').status_code, 204)
        self.assertEqual(self.client.delete('/api/users/me/', HTTP_X_DEVICE_ID='leaver-device').status_code, 204)
        self.assertEqual(self.client.delete('/api/users/me/').status_code, 400)


class InboundEmailTests(TestCase):
    """The support inbox webhook: signed requests only, forwarded with the
    sender as Reply-To."""
    SECRET = 'whsec_' + __import__('base64').b64encode(b'0123456789abcdef0123456789abcdef').decode()

    def sign(self, body, msg_id='msg_1', timestamp=None):
        import base64, hashlib, hmac, time
        timestamp = str(int(timestamp or time.time()))
        key = base64.b64decode(self.SECRET.split('_', 1)[1])
        sig = base64.b64encode(hmac.new(key, f'{msg_id}.{timestamp}.'.encode() + body, hashlib.sha256).digest()).decode()
        return {'HTTP_SVIX_ID': msg_id, 'HTTP_SVIX_TIMESTAMP': timestamp, 'HTTP_SVIX_SIGNATURE': f'v1,bogus v1,{sig}'}

    def post(self, event, headers):
        return self.client.post('/api/inbound-email/', data=json.dumps(event).encode(),
                                content_type='application/json', **headers)

    def test_signature_checks(self):
        from posts.inbound_email import signature_valid
        body = b'{"a":1}'
        h = self.sign(body)
        args = (h['HTTP_SVIX_ID'], h['HTTP_SVIX_TIMESTAMP'], body)
        self.assertTrue(signature_valid(self.SECRET, *args, h['HTTP_SVIX_SIGNATURE']))
        self.assertFalse(signature_valid(self.SECRET, *args[:2], b'{"a":2}', h['HTTP_SVIX_SIGNATURE']))
        self.assertFalse(signature_valid('', *args, h['HTTP_SVIX_SIGNATURE']))
        stale = self.sign(body, timestamp=1_000_000)
        self.assertFalse(signature_valid(self.SECRET, stale['HTTP_SVIX_ID'], stale['HTTP_SVIX_TIMESTAMP'],
                                         body, stale['HTTP_SVIX_SIGNATURE']))

    @override_settings(RESEND_WEBHOOK_SECRET=SECRET)
    def test_unsigned_requests_are_refused(self):
        response = self.client.post('/api/inbound-email/', data='{}', content_type='application/json')
        self.assertEqual(response.status_code, 401)

    @override_settings(RESEND_WEBHOOK_SECRET=SECRET, RESEND_API_KEY='re_test',
                       SUPPORT_FROM_EMAIL='Support <support@example.com>', SUPPORT_FORWARD_TO=['me@example.com'])
    def test_received_email_is_forwarded_with_reply_to_the_sender(self):
        from unittest import mock
        received = {'from': 'Reader <reader@example.org>', 'to': ['support@example.com'],
                    'subject': 'Hello', 'text': 'Love the app', 'html': '<p>Love the app</p>', 'attachments': []}
        calls = []

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            response = mock.Mock(status_code=200)
            response.json.return_value = received if method == 'GET' else {'id': 'sent_1'}
            return response

        event = {'type': 'email.received', 'data': {'email_id': 'abc-123'}}
        body = json.dumps(event).encode()
        with mock.patch('posts.inbound_email.requests.request', side_effect=fake_request):
            response = self.post(event, self.sign(body))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(calls[0][:2], ('GET', 'https://api.resend.com/emails/receiving/abc-123'))
        sent = calls[1][2]['json']
        self.assertEqual(sent['to'], ['me@example.com'])
        # replies go to a signed relay address, never straight to the reader
        from posts.inbound_email import relayed_email_id
        self.assertEqual(relayed_email_id(sent['reply_to']), 'abc-123')
        self.assertEqual(sent['subject'], '[Support] Hello')
        self.assertIn('Love the app', sent['text'])
        self.assertEqual(calls[1][2]['headers']['Authorization'], 'Bearer re_test')

    @override_settings(RESEND_WEBHOOK_SECRET=SECRET)
    def test_other_events_are_ignored(self):
        event = {'type': 'email.sent', 'data': {}}
        response = self.post(event, self.sign(json.dumps(event).encode()))
        self.assertEqual(response.status_code, 200)


class ColorRunTests(RenderTestCase):
    """Colour for selected text: ranges over the typed text, carried through
    sanitizing, list markers and wrapping to the right letters."""

    def visible_colors(self, element):
        post = Post(author=self.user, image_width=CANVAS_WIDTH, image_height=CANVAS_HEIGHT,
                    background_color='#F8F8FF')
        post._text_elements_data = [element]
        (normalized,) = post._collect_text_elements()
        return normalized.get('charColors')

    def test_ranges_map_to_visible_letters(self):
        colors = self.visible_colors(text_element(
            'ab cd', colorRuns=[{'start': 1, 'end': 4, 'color': '#ff1a1a'}]))
        # a b c d: the space is not counted
        self.assertEqual(colors, [None, '#FF1A1A', '#FF1A1A', None])

    def test_list_markers_and_invisibles_do_not_shift_colours(self):
        colors = self.visible_colors(text_element(
            'x​y\nz', listStyle='dash',
            colorRuns=[{'start': 2, 'end': 3, 'color': '#0000EE'}]))
        # "- xy\n- z": the dashes and the dropped zero-width space stay out of it
        self.assertEqual(colors, [None, None, '#0000EE', None, None])

    def test_malformed_ranges_are_dropped(self):
        self.assertIsNone(self.visible_colors(text_element('hello', colorRuns=[
            {'start': 0, 'end': 3, 'color': '#123456'},  # not a palette colour
            {'start': 'a', 'end': 2, 'color': '#FF1A1A'},
            {'start': 4, 'end': 2, 'color': '#FF1A1A'},
            'nonsense',
        ])))

    def test_range_renders_in_its_colour(self):
        post = self.make_post([text_element('AAAA BBBB', colorRuns=[{'start': 5, 'end': 9, 'color': '#0000EE'}])])
        img = self.open_render(post)
        colors = {c for _n, c in img.getcolors(maxcolors=1 << 20) if _n > 200}
        self.assertIn((0, 0, 0), colors)
        self.assertIn((0, 0, 238), colors)


class WrapSpacingTests(RenderTestCase):
    """Wrapping keeps spaces as typed, like the composer's text view; only
    the spaces at a wrap point go."""

    def wrap(self, content, max_width=10_000):
        post = Post(author=self.user, image_width=CANVAS_WIDTH, image_height=CANVAS_HEIGHT)
        font = post._load_font('arial-black', 60)
        return post._wrap_text_to_width(content, font, max_width)

    def test_leading_and_repeated_spaces_survive(self):
        self.assertEqual(self.wrap('  a  b\n c'), '  a  b\n c')

    def test_spaces_at_a_wrap_point_go(self):
        wrapped = self.wrap('aaaa bbbb cccc', max_width=400)
        self.assertNotIn(' \n', wrapped)
        self.assertNotIn('\n ', wrapped)
        self.assertEqual(wrapped.replace('\n', ' '), 'aaaa bbbb cccc')


class QuoteCropTests(RenderTestCase):
    """A quote shows the band of the original it was made from, frozen in
    repost_geometry, so recomputing the original's bounds never moves it."""

    def test_frozen_band_wins_over_the_originals_current_bounds(self):
        parent = self.make_post([text_element('PARENT', color='#000000')], background_color='#00CED1')
        geometry = {'x': 54, 'y': 600, 'width': 972, 'crop_top': parent.top_y, 'crop_bottom': parent.bottom_y}
        repost = self.make_post([text_element('REPLY', y=400)], is_repost=True,
                                original_post=parent, repost_geometry=geometry)
        before = repost._repost_strip_geometry()
        Post.objects.filter(pk=parent.pk).update(top_y=0, bottom_y=parent.image_height)
        repost.original_post.refresh_from_db()
        self.assertEqual(repost._repost_strip_geometry(), before)

    def test_quote_chain_names_each_level(self):
        from posts.serializers import PostListSerializer
        parent = self.make_post([text_element('PARENT', color='#000000')], background_color='#00CED1')
        repost = self.make_post([text_element('REPLY', y=400)], is_repost=True, original_post=parent,
                                repost_geometry={'x': 54, 'y': 600, 'width': 972})
        chain = PostListSerializer(context={}).get_quote_chain(repost)
        self.assertEqual(chain[0]['post_id'], str(parent.id))


class LimitsTests(TestCase):
    def test_limits_match_shared_file(self):
        from posts import limits
        shared = json.loads(open(os.path.join(os.path.dirname(__file__), '..', '..', 'shared', 'limits.json')).read())
        shared.pop('_comment')
        mine = {
            'canvasWidth': limits.CANVAS_WIDTH, 'canvasHeightMin': limits.CANVAS_HEIGHT_MIN,
            'canvasHeightMax': limits.CANVAS_HEIGHT_MAX, 'fontSizeMin': limits.FONT_SIZE_MIN,
            'fontSizeMax': limits.FONT_SIZE_MAX, 'maxTextElements': limits.MAX_TEXT_ELEMENTS,
            'maxPostLength': limits.MAX_POST_LENGTH, 'gradientStopsMin': limits.GRADIENT_STOPS_MIN,
            'gradientStopsMax': limits.GRADIENT_STOPS_MAX, 'maxColorRuns': limits.MAX_COLOR_RUNS,
        }
        self.assertEqual(mine, shared)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class PayloadValidationTests(TestCase):
    """The API checks what is drawn, not just the summary the client sends."""

    def setUp(self):
        # each test starts with fresh rate limits
        from django.core.cache import cache
        cache.clear()

    def payload(self, **overrides):
        body = {
            'text_content': 'hello',
            'text_elements': [{'content': 'hello', 'x': 540, 'y': 1000, 'fontSize': 60,
                               'color': '#000000', 'fontFamily': 'arial-black'}],
            'background_color': '#F8F8FF', 'canvas_width': 1080, 'canvas_height': 2340,
        }
        body.update(overrides)
        return body

    def post(self, body):
        return self.client.post('/api/posts/', data=json.dumps(body), content_type='application/json',
                                HTTP_X_DEVICE_ID='validation-test-device')

    def test_moderation_reads_the_drawn_text(self):
        body = self.payload(text_content='harmless', text_elements=[
            {'content': 'buy spam now', 'x': 540, 'y': 1000, 'fontSize': 60, 'color': '#000000'}])
        self.assertEqual(self.post(body).status_code, 400)

    def test_length_counts_every_element(self):
        long = {'content': 'x' * 300, 'x': 540, 'y': 1000, 'fontSize': 60, 'color': '#000000'}
        self.assertEqual(self.post(self.payload(text_elements=[long, dict(long, y=1400)])).status_code, 400)

    def test_canvas_size_is_bounded(self):
        self.assertEqual(self.post(self.payload(canvas_height=100_000)).status_code, 400)
        self.assertEqual(self.post(self.payload(canvas_width=5000)).status_code, 400)

    def test_font_sizes_are_clamped_not_refused(self):
        response = self.post(self.payload(font_size=5000, text_elements=[
            {'content': 'big', 'x': 540, 'y': 1000, 'fontSize': 99999, 'color': '#000000'}]))
        self.assertEqual(response.status_code, 201, response.content)
        post = Post.objects.get(id=response.json()['id'])
        self.assertEqual(post.text_elements[0]['fontSize'], 2000)

    def test_bad_colours_and_gradients_are_refused(self):
        bad = {'content': 'x', 'x': 540, 'y': 1000, 'fontSize': 60, 'color': 'red'}
        self.assertEqual(self.post(self.payload(text_elements=[bad])).status_code, 400)
        self.assertEqual(self.post(self.payload(background_gradient=['#FFF', 'nope'])).status_code, 400)

    def test_malformed_quote_geometry_is_dropped_not_a_500(self):
        parent = self.post(self.payload())
        body = self.payload(repost_data={'original_post_id': parent.json()['id'],
                                         'repost_geometry': {'x': 'a', 'width': None}})
        self.assertEqual(self.post(body).status_code, 201)


class OutlineTests(RenderTestCase):
    """The text border: stroked under the fill, OUTLINE_WIDTH_EM wide."""

    def test_border_is_drawn_round_the_letters(self):
        plain = self.make_post([text_element('MEME', color='#FFFFFF', fontFamily='impact')],
                               background_color='#0000EE')
        bordered = self.make_post([text_element('MEME', color='#FFFFFF', fontFamily='impact',
                                                outlineColor='#000000')], background_color='#0000EE')
        count = lambda post, rgb: sum(n for n, c in self.open_render(post).getcolors(1 << 20) if c == rgb)
        self.assertEqual(count(plain, (0, 0, 0)), 0)
        self.assertGreater(count(bordered, (0, 0, 0)), 1000)
        # the fill still shows inside the border
        self.assertGreater(count(bordered, (255, 255, 255)), 1000)

    def test_styled_text_gets_the_border_too(self):
        post = self.make_post([text_element('AB CD', color='#FFFFFF', fontFamily='impact', rainbow=True,
                                             outlineColor='#000000')], background_color='#0000EE')
        self.assertGreater(sum(n for n, c in self.open_render(post).getcolors(1 << 20) if c == (0, 0, 0)), 1000)

    def test_bad_border_colours_are_ignored(self):
        post = Post(author=self.user, image_width=CANVAS_WIDTH, image_height=CANVAS_HEIGHT)
        post._text_elements_data = [text_element('x', outlineColor='black')]
        self.assertIsNone(post._collect_text_elements()[0]['outlineColor'])

    def test_width_matches_shared_style(self):
        from posts import limits
        shared = json.loads(open(os.path.join(os.path.dirname(__file__), '..', '..', 'shared', 'style.json')).read())
        self.assertEqual(limits.OUTLINE_WIDTH_EM, shared['outlineWidthEm'])


@override_settings(RESEND_WEBHOOK_SECRET=InboundEmailTests.SECRET, RESEND_API_KEY='re_test',
                   SUPPORT_FROM_EMAIL='Support <support@example.com>', SUPPORT_FORWARD_TO=['me@example.com'])
class ReplyRelayTests(TestCase):
    """A reply from Gmail to the relay address goes out from support@."""

    def run_relay(self, reply):
        from unittest import mock
        from posts.inbound_email import handle_received_email
        original = {'from': 'Reader <reader@example.org>', 'to': ['support@example.com'],
                    'subject': 'Hello', 'message_id': '<orig@example.org>'}
        sent = []

        def fake_request(method, url, **kwargs):
            response = mock.Mock(status_code=200)
            if method == 'POST':
                sent.append(kwargs['json'])
                response.json.return_value = {'id': 'sent'}
            else:
                response.json.return_value = reply if url.endswith('/reply-1') else original
            return response

        with mock.patch('posts.inbound_email.requests.request', side_effect=fake_request):
            handle_received_email('reply-1')
        return sent

    def reply(self, **overrides):
        from posts.inbound_email import relay_address
        email = {'from': 'Tom <me@example.com>', 'to': [relay_address('orig-1')], 'subject': 'Re: [Support] Hello',
                 'text': 'Thanks!', 'authentication': {'dkim': 'pass', 'dmarc': 'pass', 'spf': 'pass'}}
        email.update(overrides)
        return email

    def test_reply_goes_out_from_support_threaded(self):
        (sent,) = self.run_relay(self.reply())
        self.assertEqual(sent['from'], 'Support <support@example.com>')
        self.assertEqual(sent['to'], ['Reader <reader@example.org>'])
        self.assertEqual(sent['subject'], 'Re: Hello')
        self.assertEqual(sent['headers']['In-Reply-To'], '<orig@example.org>')
        self.assertNotIn('me@example.com', json.dumps(sent))

    def test_forged_or_foreign_replies_are_refused(self):
        self.assertEqual(self.run_relay(self.reply(authentication={'dkim': 'fail', 'dmarc': 'fail'})), [])
        self.assertEqual(self.run_relay(self.reply(**{'from': 'someone@else.com'})), [])

    def test_a_tampered_relay_address_is_not_a_relay(self):
        from posts.inbound_email import relayed_email_id
        self.assertIsNone(relayed_email_id('reply+orig-1.0000000000@example.com'))
        self.assertIsNone(relayed_email_id('support@example.com'))


class TextlessRenderTests(RenderTestCase):
    """The post page draws text itself over a render without any."""

    def test_textless_render_has_the_background_and_no_ink(self):
        post = self.make_post([text_element('INK', color='#000000')], background_color='#F0FF00')
        self.assertTrue(post.textless_image)
        img = Image.open(post.textless_image.path).convert('RGB')
        self.assertEqual(img.size, (post.image_width, post.image_height))
        self.assertEqual({c for _n, c in img.getcolors(1 << 20)}, {(240, 255, 0)})

    def test_a_quote_composites_its_parents_textless_render(self):
        parent = self.make_post([text_element('PARENT', color='#000000')], background_color='#00CED1')
        repost = self.make_post([text_element('REPLY', y=400, color='#000000')], background_color='#F0FF00',
                                is_repost=True, original_post=parent,
                                repost_geometry={'x': 54, 'y': 900, 'width': 972})
        img = Image.open(repost.textless_image.path).convert('RGB')
        # no black ink anywhere: neither the reply's text nor the parent's
        self.assertNotIn((0, 0, 0), {c for _n, c in img.getcolors(1 << 20)})

    def test_both_serializers_send_it_and_the_chain(self):
        from posts.serializers import PostSerializer, PostListSerializer
        parent = self.make_post([text_element('PARENT')], background_color='#00CED1')
        repost = self.make_post([text_element('REPLY', y=400)], is_repost=True, original_post=parent,
                                repost_geometry={'x': 54, 'y': 900, 'width': 972})
        for serializer in (PostSerializer, PostListSerializer):
            data = serializer(repost, context={}).data
            self.assertTrue(data['textless_image_url'])
            self.assertEqual(data['quote_chain'][0]['post_id'], str(parent.id))
            self.assertIn('background_gradient', data['quote_chain'][0])
            self.assertEqual(data['text_plan']['version'], Post.TEXT_PLAN_VERSION)
            self.assertEqual(data['quote_chain'][0]['text_plan'], parent.text_plan)
            self.assertEqual(data['quote_chain'][0]['crop_top'], parent.top_y)


# --- Draw-list parity -------------------------------------------------------
# The post page draws a post's text from Post.text_plan (and each quoted
# level's plan) over textless_image. These tests repaint posts the way the
# app does - from the plan alone, glyph runs at their pen position and
# baseline - and compare with the real render, across every font and style
# and nested quotes. If the plan and the render ever disagree, these fail.

from posts.models import Post as _Post  # noqa: E402

FONT_KEYS = [key for key, _label in Post.FONT_CHOICES]

STYLE_CASES = {
    'plain': {},
    'wrapped': {'content': 'a long line of text that has to wrap across the canvas at least twice over here'},
    'multiline': {'content': 'first line\nsecond, longer line\nthird'},
    'left': {'content': 'left aligned\ntwo lines', 'align': 'left'},
    'right': {'content': 'right aligned\ntwo lines', 'align': 'right'},
    'rainbow': {'rainbow': True},
    'duo': {'alternateColors': ['#FF1A1A', '#0000EE']},
    'runs': {'colorRuns': [{'start': 2, 'end': 7, 'color': '#0000EE'}]},
    'spacing': {'letterSpacing': 18},
    'underline': {'underline': True, 'content': 'underlined\ntwice'},
    'chip': {'hasBackground': True, 'backgroundColor': '#F9FF4F'},
    'bullets': {'listStyle': 'bullet', 'content': 'one\ntwo\nthree'},
    'numbers': {'listStyle': 'number', 'content': 'one\ntwo'},
    'bold': {'bold': True},
    'italic': {'italic': True},
    'outline': {'outlineColor': '#F8F8FF', 'content': 'border\nround it'},
    'outline_rainbow': {'outlineColor': '#000000', 'rainbow': True},
    'opacity': {'opacity': 0.45},
    'glow': {'glow': True},
}


class TextPlanParityTests(RenderTestCase):

    def repaint(self, post):
        """The text-free render with every plan painted on it from the plan's
        own numbers, as the app places them."""
        from PIL import ImageFilter, ImageFont
        img = Image.open(post.textless_image.path).convert('RGBA')

        def paint(target, plan_el, scale=1.0, dx=0.0, dy=0.0, clip=None):
            path = next(os.path.join(Post._REPO_FONTS, f) for f in os.listdir(Post._REPO_FONTS)
                        if os.path.splitext(f)[0] == plan_el['face'])
            font = ImageFont.truetype(path, max(1, int(round(plan_el['size'] * scale))))
            layer = Image.new('RGBA', target.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(layer)
            P = lambda x, y: (dx + x * scale, dy + y * scale)
            for chip in plan_el['chips']:
                x0, y0, x1, y1 = chip['rect']
                draw.rectangle((*P(x0, y0), *P(x1, y1)), fill=chip['fill'])
            outline, stroke = plan_el['outline'], int(round(plan_el['stroke'] * scale))
            ink_layer = Image.new('RGBA', target.size, (0, 0, 0, 0))
            ink = ImageDraw.Draw(ink_layer)
            for stroke_pass in ([True] if outline else []) + [False]:
                extra = dict(stroke_width=stroke, stroke_fill=outline) if stroke_pass else {}
                for run in plan_el['runs']:
                    ink.text(P(run['left'], run['baseline']), run['text'], font=font, anchor='ls',
                             fill=outline if stroke_pass else run['fill'], **extra)
                for line in plan_el['lines']:
                    w = line['width'] * scale
                    ink.line((*P(*line['from']), *P(*line['to'])), fill=outline if stroke_pass else line['fill'],
                             width=int(round(w + 2 * stroke if stroke_pass else w)))
            if plan_el['glow']:
                halo = ink_layer.filter(ImageFilter.GaussianBlur(plan_el['glow'] * scale))
                layer.paste(halo, (0, 0), halo)
                layer.paste(halo, (0, 0), halo)
            layer.paste(ink_layer, (0, 0), ink_layer)
            if plan_el['opacity'] < 1:
                layer.putalpha(layer.getchannel('A').point(lambda a: int(a * plan_el['opacity'])))
            if clip:
                mask = Image.new('L', target.size, 0)
                ImageDraw.Draw(mask).rectangle(clip, fill=255)
                layer.putalpha(ImageChops.multiply(layer.getchannel('A'), mask))
            target.alpha_composite(layer)

        from posts.serializers import quote_chain_for
        chain = quote_chain_for(post, {})
        hidden = next((i for i, level in enumerate(chain) if level['hidden']), len(chain))
        for level in chain[:hidden]:
            if not level.get('text_plan'):
                continue
            rect = level['rect']
            scale = rect['width'] / level['strip']['image_width']
            for el in level['text_plan']['elements']:
                paint(img, el, scale, rect['x'], rect['y'] - level['crop_top'] * scale,
                      clip=(rect['x'], rect['y'], rect['x'] + rect['width'], rect['y'] + rect['height']))
        for el in post.text_plan['elements']:
            paint(img, el)
        return img.convert('RGB')

    def assert_parity(self, post, label, tolerance):
        rendered = Image.open(post.rendered_image.path).convert('RGB')
        repainted = self.repaint(post)
        band = (0, post.top_y, post.image_width, post.bottom_y)
        a, b = rendered.crop(band), repainted.crop(band)
        # A mark counts as misplaced only if nothing within 1px of it in the
        # other image matches: the plan stores positions to 0.01px and the
        # app draws them at sub-pixel precision, while Pillow rounds each
        # glyph to whole pixels - half a canvas pixel is 0.2pt on screen.
        # A wrong line break, size or spacing moves whole glyphs and fails.
        diff = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                shifted = ImageChops.offset(b, dx, dy)
                d = ImageChops.difference(a, shifted).convert('L')
                diff = d if diff is None else ImageChops.darker(diff, d)
        off = sum(n for value, n in enumerate(diff.histogram()) if value > 48)
        area = (band[2] - band[0]) * (band[3] - band[1])
        self.assertLess(off / area, tolerance, f'{label}: {off} px ({off / area:.4%}) differ between render and plan')

    def element(self, font, style, y=1100):
        overrides = dict(STYLE_CASES[style])
        el = text_element(overrides.pop('content', 'Quote Typ'), fontFamily=font, fontSize=84, y=y, color='#111111')
        el.update(overrides)
        return el

    # Per-glyph runs (rainbow, duo, spacing) round each glyph to whole
    # pixels on its own; a wrong break, size or spacing moves whole glyphs
    # and costs several percent
    TOLERANCE = 0.002

    def test_every_font_in_every_style(self):
        for font in FONT_KEYS:
            for style in STYLE_CASES:
                if style == 'glow':
                    continue
                with self.subTest(font=font, style=style):
                    post = self.make_post([self.element(font, style)], background_color='#00CED1')
                    self.assert_parity(post, f'{font}/{style}', self.TOLERANCE)

    def test_glow_changes_no_position(self):
        # A halo is blended, not placed: the app draws it as a shadow of the
        # same radius. What must hold is that glowing text is laid out
        # exactly like the same text without it.
        for font in FONT_KEYS:
            with self.subTest(font=font):
                glowing = self.make_post([self.element(font, 'glow')]).text_plan['elements'][0]
                plain = self.make_post([self.element(font, 'plain')]).text_plan['elements'][0]
                self.assertGreater(glowing.pop('glow'), 0)
                plain.pop('glow')
                self.assertEqual(glowing, plain)

    def test_mixed_fonts_in_one_post(self):
        elements = [self.element(font, style, y=300 + i * 260)
                    for i, (font, style) in enumerate(zip(FONT_KEYS, ['plain', 'rainbow', 'chip', 'outline', 'bullets',
                                                                       'underline', 'runs', 'duo', 'spacing', 'bold',
                                                                       'italic', 'opacity', 'numbers']))]
        post = self.make_post(elements, background_color='#FAEBD7')
        self.assert_parity(post, 'mixed', self.TOLERANCE)

    def test_nested_quotes_three_deep(self):
        a = self.make_post([self.element('courier-prime', 'multiline'), self.element('impact', 'outline', y=1500)],
                           background_color='#F0FF00')
        b = self.make_post([self.element('cabin-sketch', 'rainbow', y=300)], background_color='#0000EE',
                           is_repost=True, original_post=a, repost_geometry={'x': 54, 'y': 700, 'width': 972})
        c = self.make_post([self.element('petit-formal', 'chip', y=250)], background_color='#FF90C2',
                           is_repost=True, original_post=b, repost_geometry={'x': 80, 'y': 600, 'width': 920})
        # quoted text is resampled into its strip on the server; the app
        # draws it sharp at that size - close, not pixel-equal
        self.assert_parity(c, 'nested', 0.02)

    def test_every_plan_face_is_a_shipped_font_file(self):
        post = self.make_post([self.element(font, 'plain', y=200 + i * 150) for i, font in enumerate(FONT_KEYS)])
        shipped = {os.path.splitext(f)[0] for f in os.listdir(Post._REPO_FONTS)}
        for el in post.text_plan['elements']:
            self.assertIn(el['face'], shipped)


class FontMetricsTableTests(TestCase):
    """The app places drawn text by FONT_METRICS (frontend constants): every
    face's ascent and line gap must be the font file's own."""

    def test_table_matches_the_font_files(self):
        import re
        from fontTools.ttLib import TTFont
        path = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'src', 'constants', 'fontMetrics.ts')
        if not os.path.exists(path):
            # a repo check: the server is deployed without the app's source
            self.skipTest('frontend source not present (deployed server)')
        table = open(path).read()
        for name in os.listdir(Post._REPO_FONTS):
            face = os.path.splitext(name)[0]
            with self.subTest(face=face):
                m = re.search(r'\b%s: \{ ascent: ([0-9.]+),[^}]*?(?:lineGap: ([0-9.]+))?\s*\}' % face, table)
                self.assertIsNotNone(m, f'{face} missing from FONT_METRICS')
                font = TTFont(os.path.join(Post._REPO_FONTS, name))
                upm = font['head'].unitsPerEm
                hhea = font['hhea']
                self.assertAlmostEqual(float(m.group(1)), (hhea.ascent + hhea.lineGap) / upm, places=3)
                self.assertAlmostEqual(float(m.group(2) or 0), hhea.lineGap / upm, places=3)
