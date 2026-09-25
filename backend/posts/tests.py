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
from PIL import Image, ImageChops

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

    def test_tall_content_capped_at_max_aspect(self):
        post = self.make_post([
            text_element('TOP', y=200, fontSize=64),
            text_element('BOTTOM', y=2100, fontSize=64),
        ])
        max_height = int(CANVAS_WIDTH * 1.25)
        self.assertEqual(post.bottom_y - post.top_y, max_height,
                         'posts taller than 5:4 portrait must be capped')

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


class PerLineChipTests(RenderTestCase):
    def test_chips_wrap_each_line_not_the_block(self):
        post = self.make_post(
            [text_element('WIDE LINE OF TEXT HERE\nTINY', fontSize=72,
                          hasBackground=True, backgroundColor='#FFFFFF',
                          color='#000000')],
            background_color='#00CED1',
        )
        img = self.open_render(post)
        px = img.load()

        def white_width(y):
            xs = [x for x in range(0, CANVAS_WIDTH, 2)
                  if px[x, y] == (255, 255, 255)]
            return (max(xs) - min(xs)) if xs else 0

        # Find the two chip bands (rows containing white)
        rows = [y for y in range(post.top_y, post.bottom_y, 2) if white_width(y) > 40]
        self.assertTrue(rows, 'no chips rendered')
        # Adjacent line chips touch vertically (continuous staircase), so
        # compare widths near the top (wide line) vs bottom (tiny line)
        wide = white_width(rows[len(rows) // 4])
        tiny = white_width(rows[-max(2, len(rows) // 8)])
        self.assertGreater(wide, tiny * 2,
                           f'chips are not per-line (widths {wide} vs {tiny})')


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
        # A photo post is not cropped to its caption, but is capped at the
        # max post aspect (5:4 portrait), centered on the canvas
        max_height = int(CANVAS_WIDTH * 1.25)
        expected_top = max(0, int((CANVAS_HEIGHT / 2) - max_height / 2))
        self.assertEqual(post.top_y, expected_top)
        self.assertEqual(post.bottom_y, expected_top + max_height)

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
        # kept inside the 5:4 cap so the crop is not centre-cropped instead
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
