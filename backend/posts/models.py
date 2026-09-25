from django.db import models
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFilter, ImageFont, features
import io
import os
import re
import unicodedata
import uuid
import hashlib

# Glyph-bomb protection: strip what breaks rendering or spoofs layout while
# keeping the ornamental characters the app celebrates. Removes control
# chars (except newline), zero-width/invisible spam, directional overrides,
# and caps combining-mark stacking (zalgo) at 2 marks per base glyph.
_INVISIBLES = re.compile('[\u0000-\u0008\u000B-\u001F\u007F\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]')


def _report_render_error(message, exc):
    """Render failures degrade silently by design (a post still saves), which
    once hid a broken repost composite in production for days. Log loudly and
    send to Sentry when it is configured."""
    import logging
    logging.getLogger(__name__).exception('%s: %s', message, exc)
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    except Exception:
        pass


# Extra breathing room on the reply's outer edge of a quote composite
REPLY_EDGE_MARGIN = 48

# A post must be tall enough to carry the overlay chrome the feed draws on it
# (the quote button and its inset). A one-line post used to crop shorter than
# the button sitting on it. Canvas px; MIN_CROP_CANVAS_PX mirrors it client side.


def _sanitize_glyphs(text):
    if not text:
        return text
    text = _INVISIBLES.sub('', text)
    out = []
    marks_on_base = 0
    for ch in text:
        if unicodedata.combining(ch):
            marks_on_base += 1
            if marks_on_base > 2:
                continue
        else:
            marks_on_base = 0
        out.append(ch)
    return ''.join(out)

# Per-character palette for rainbow text. Must match rainbowPalette in
# frontend/src/constants/colors.ts so the preview cycles identically.
RAINBOW_TEXT_PALETTE = [
    '#FF1A1A', '#FF9500', '#FFD700', '#32CD32', '#00CED1', '#9932CC'
]

# Raqm applies kerning the way CoreText does in the composer preview; without
# it Pillow uses raw advance widths and text renders slightly wider than the
# preview. Requires libfribidi to be loadable at runtime.
FONT_LAYOUT_ENGINE = (
    ImageFont.Layout.RAQM if features.check('raqm') else ImageFont.Layout.BASIC
)


class Post(models.Model):
    """
    Main post model that stores both text content and rendered image
    """
    
    # Font choices for text rendering
    FONT_CHOICES = [
        ('arial-black', 'Arial Black'),
        ('crimson-text', 'Crimson Text'),
        ('papyrus', 'Papyrus'),
        ('impact', 'Impact'),
        ('courier-prime', 'Courier Prime'),
        ('caveat', 'Caveat'),
    ]
    
    # Color presets (old school internet + modern)
    COLOR_PRESETS = [
        '#F8F8FF', '#FAEBD7', '#B7BEC7', '#3D3D42', '#000000', '#690016',
        '#FF1A1A', '#FF940A', '#F0FF00', '#CCFF00', '#32CD32', '#00CED1',
        '#0000EE', '#4169E1', '#AB00FF', '#9932CC', '#FF1493', '#FF90C2'
    ]

    SIGNATURE_STYLES = {
        'default': {
            'band_color': '#050505',
            'text_color': '#F9F9F9',
        },
        'pulse': {
            'band_color': '#FF1A1A',
            'text_color': '#FFFFFF',
        },
        'noir': {
            'band_color': '#161616',
            'text_color': '#F2F2F2',
        },
    }
    
    @classmethod
    def get_next_background_color(cls, current_color):
        """Get the next background color in the sequence for reposts"""
        try:
            current_index = cls.COLOR_PRESETS.index(current_color)
            return cls.COLOR_PRESETS[(current_index + 1) % len(cls.COLOR_PRESETS)]
        except ValueError:
            # If current color is not in the list, return the first color
            return cls.COLOR_PRESETS[0]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posts')
    
    # Text content
    text_content = models.TextField(max_length=500)
    
    # NEW: Multiple text elements support
    text_elements = models.JSONField(null=True, blank=True, help_text="Array of text elements with positioning and styling")
    
    # NEW: Sticker elements support
    sticker_elements = models.JSONField(null=True, blank=True, help_text="Array of sticker elements with positioning and scaling")
    
    # Styling options (kept for backward compatibility)
    font_choice = models.CharField(max_length=20, choices=FONT_CHOICES, default='arial-black')
    font_size = models.IntegerField(default=24, help_text="Font size in pixels")
    text_color = models.CharField(max_length=7, default='#FF1A1A')
    background_color = models.CharField(max_length=7, default='#F8F8FF')
    background_gradient = models.JSONField(null=True, blank=True, help_text="Gradient colors as array")
    background_image = models.TextField(null=True, blank=True, help_text="Background image URI")
    background_image_scale = models.FloatField(null=True, blank=True, help_text="Background image scale factor")
    background_image_position = models.JSONField(null=True, blank=True, help_text="Background image position {x, y}")
    # User-chosen crop band from the composer's crop bars (canvas px). When
    # set, an image post is cropped to this band in the feed instead of
    # occupying the full canvas.
    crop_top = models.IntegerField(null=True, blank=True, help_text="Crop band top in canvas px")
    crop_bottom = models.IntegerField(null=True, blank=True, help_text="Crop band bottom in canvas px")
    has_outline = models.BooleanField(default=False)
    outline_color = models.CharField(max_length=7, default='#000000')
    
    # Generated image
    rendered_image = models.ImageField(upload_to='posts/', null=True, blank=True)
    image_width = models.IntegerField(default=800)
    image_height = models.IntegerField(default=1200)
    
    # Y bounds for efficient reposting
    top_y = models.IntegerField(null=True, blank=True, help_text="Top Y coordinate of content")
    bottom_y = models.IntegerField(null=True, blank=True, help_text="Bottom Y coordinate of content")

    # Collapsed-repost render: the response alone, without the quoted strip.
    # The feed shows this by default; tapping the quote chip swaps in the
    # full composite (rendered_image).
    response_image = models.ImageField(upload_to='posts/', null=True, blank=True)
    response_top_y = models.IntegerField(null=True, blank=True)
    response_bottom_y = models.IntegerField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Moderation
    is_hidden = models.BooleanField(default=False)
    is_flagged = models.BooleanField(default=False)
    moderation_notes = models.TextField(blank=True)
    
    # Analytics (optional for MVP)
    view_count = models.PositiveIntegerField(default=0)

    # Signature system
    is_signed = models.BooleanField(default=False, help_text="Whether the post was published with a signature")
    signature_style = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Identifier for the signature preset used when the post is signed"
    )

    # Repost functionality
    is_repost = models.BooleanField(default=False)
    original_post = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='reposts')
    repost_screenshot = models.ImageField(upload_to='reposts/', null=True, blank=True)
    # WYSIWYG placement of the quoted strip, as shown in the composer:
    # {x, y, width} in canvas px. The bake puts the strip exactly here.
    repost_geometry = models.JSONField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['author', '-created_at']),
        ]
    
    def save(self, *args, **kwargs):
        # Generate rendered image if text content has changed
        if not self.rendered_image or self._state.adding:
            self.generate_image()
        super().save(*args, **kwargs)
    
    def generate_image(self):
        """Render the post. Non-reposts get one image; reposts get two: the
        full composite (rendered_image, whole chain baked with inset quoting)
        and the response-only render (response_image) that the feed shows
        while the repost is collapsed."""
        try:
            text_elements = self._collect_text_elements()

            canvas_width = int(self.image_width or settings.POST_IMAGE_WIDTH)
            canvas_height = int(self.image_height or settings.POST_IMAGE_HEIGHT)
            self.image_width = canvas_width
            self.image_height = canvas_height

            # Response bounds come first: the quoted strip stacks directly
            # above the response content (quote-then-reply order), so its
            # position depends on where the response sits
            response_top, response_bottom = self._calculate_vertical_bounds(
                text_elements, include_repost=False
            )
            has_response_content = bool(text_elements or self.sticker_elements)
            self._strip_anchor_bottom = response_bottom if has_response_content else None

            final_top, final_bottom = self._calculate_vertical_bounds(text_elements)
            img = self._render_canvas(text_elements, include_original=True)
            final_bottom = self._draw_signature(img, final_bottom)
            final_top, final_bottom = self._cap_bounds_height(final_top, final_bottom)
            self.top_y = int(final_top)
            self.bottom_y = int(final_bottom)
            self._save_render(img, self.rendered_image, f"{self.id}.png")

            if self.is_repost and self.original_post:
                response_img = self._render_canvas(text_elements, include_original=False)
                response_bottom = self._draw_signature(response_img, response_bottom)
                response_top, response_bottom = self._cap_bounds_height(response_top, response_bottom)
                self.response_top_y = int(response_top)
                self.response_bottom_y = int(response_bottom)
                self._save_render(response_img, self.response_image, f"{self.id}_response.png")

        except Exception as e:
            _report_render_error(f'Error generating image for post {self.id}', e)
            self._create_fallback_image()

    def _render_canvas(self, text_elements, include_original):
        img = self._create_background(int(self.image_height or settings.POST_IMAGE_HEIGHT))
        draw = ImageDraw.Draw(img)
        if include_original and self.is_repost and self.original_post and self.original_post.rendered_image:
            self._composite_original(img)
        for element in text_elements:
            self._draw_text_element(img, draw, element)
        self._draw_stickers(img)
        return img

    def _save_render(self, img, field, filename):
        img_io = io.BytesIO()
        img.save(img_io, format='PNG', quality=settings.POST_IMAGE_QUALITY)
        img_io.seek(0)
        field.save(filename, ContentFile(img_io.read()), save=False)

    def _contrast_text_color(self, background_hex):
        try:
            r, g, b = (int(background_hex[i:i + 2], 16) for i in (1, 3, 5))
        except Exception:
            return '#000000'
        luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return '#000000' if luminance > 128 else '#FFFFFF'

    def _draw_signature(self, img, content_bottom):
        """Signing renders the author's handle as a small line under the
        content, in the author's chosen font and color (auto-contrast when
        unset or unreadable). Returns the new bottom bound."""
        if not self.is_signed or not self.author_id:
            return content_bottom

        canvas_height = int(self.image_height or settings.POST_IMAGE_HEIGHT)
        sig_size = max(18, int(int(self.image_width) * 0.028))
        font_family = getattr(self.author, 'signature_font', '') or 'arial-black'
        font = self._load_font(font_family, sig_size)

        color = getattr(self.author, 'signature_color', '') or ''
        fallback = self._contrast_text_color(self.background_color)
        if not color:
            color = fallback
        else:
            # Override unreadable custom colors
            try:
                cr, cg, cb = (int(color[i:i + 2], 16) for i in (1, 3, 5))
                br, bg_, bb = (int(self.background_color[i:i + 2], 16) for i in (1, 3, 5))
                if abs(cr - br) + abs(cg - bg_) + abs(cb - bb) < 120:
                    color = fallback
            except Exception:
                color = fallback

        y_center = min(content_bottom + sig_size, canvas_height - sig_size)
        draw = ImageDraw.Draw(img)
        draw.text(
            (int(self.image_width) / 2, y_center),
            f"@{self.author.handle}",
            font=font,
            fill=color,
            anchor='mm',
        )
        return min(canvas_height, y_center + sig_size + 10)

    def _get_signature_font(self, font_size):
        return self._load_font('arial-black', font_size)

    def _collect_text_elements(self):
        elements = getattr(self, '_text_elements_data', None)
        if elements is None:
            elements = self.text_elements or []

        if not elements and self.text_content:
            elements = [{
                'content': self.text_content,
                'x': self.image_width // 2,
                'y': self.image_height // 2,
                'fontSize': self.font_size,
                'color': self.text_color,
                'fontFamily': self.font_choice,
                'hasBackground': False,
                'backgroundColor': '#FFFFFF',
            }]

        width = float(self.image_width or settings.POST_IMAGE_WIDTH)
        height = float(self.image_height or settings.POST_IMAGE_HEIGHT)

        normalized = []
        for element in elements:
            content = _sanitize_glyphs((element.get('content') or '').rstrip())
            if not content:
                continue

            normalized_element = {
                'content': content,
                'x': float(element.get('x', width / 2)),
                'y': float(element.get('y', height / 2)),
                'fontSize': float(element.get('fontSize', self.font_size)),
                'color': element.get('color', self.text_color),
                'fontFamily': element.get('fontFamily', self.font_choice),
                'hasBackground': bool(element.get('hasBackground')),
                'backgroundColor': element.get('backgroundColor', '#FFFFFF'),
                'letterSpacing': float(element.get('letterSpacing') or 0),
                'glow': bool(element.get('glow')),
                'rainbow': bool(element.get('rainbow')),
                'alternateColors': self._normalize_alternate_colors(
                    element.get('alternateColors')
                ),
                'align': element.get('align') if element.get('align') in ('left', 'center', 'right') else 'center',
                'bold': bool(element.get('bold')),
                'italic': bool(element.get('italic')),
                'underline': bool(element.get('underline')),
                'listStyle': element.get('listStyle') if element.get('listStyle') in ('bullet', 'dash', 'star', 'number') else 'none',
                'opacity': min(max(float(element.get('opacity') or 1), 0.05), 1.0),
            }

            # Lists: prefix each typed line and force left alignment (the
            # composer preview applies the identical transform)
            if normalized_element['listStyle'] != 'none':
                lines = content.split('\n')
                counter = 0
                prefixed = []
                markers = {'bullet': '\u2022 ', 'dash': '- ', 'star': '* '}
                for line in lines:
                    if not line.strip():
                        prefixed.append(line)
                        continue
                    if normalized_element['listStyle'] == 'number':
                        counter += 1
                        prefixed.append(f'{counter}. ' + line)
                    else:
                        prefixed.append(markers[normalized_element['listStyle']] + line)
                content = '\n'.join(prefixed)
                normalized_element['content'] = content
                normalized_element['align'] = 'left'

            # The composer displays text in an input that is 90 percent of the
            # canvas width and wraps it. PIL only breaks on explicit newlines,
            # so wrap here to keep the rendered layout close to the preview.
            font = self._get_font_for_element(normalized_element)
            normalized_element['content'] = self._wrap_text_to_width(
                content, font, width * 0.9,
                letter_spacing=normalized_element['letterSpacing'],
            )

            normalized.append(normalized_element)

        return normalized

    def _spaced_text_width(self, draw, text, font, letter_spacing):
        """Width of a line of text including per-character letter spacing."""
        if not letter_spacing:
            return draw.textlength(text, font=font)
        width = sum(draw.textlength(ch, font=font) for ch in text)
        if len(text) > 1:
            width += letter_spacing * (len(text) - 1)
        return width

    def _wrap_text_to_width(self, content, font, max_width, letter_spacing=0):
        """Word-wrap text so no line exceeds max_width at the given font."""
        dummy = Image.new('RGB', (1, 1))
        draw = ImageDraw.Draw(dummy)

        wrapped_lines = []
        for line in content.split('\n'):
            words = line.split(' ')
            current = ''
            for word in words:
                candidate = f"{current} {word}".strip()
                if not current or self._spaced_text_width(draw, candidate, font, letter_spacing) <= max_width:
                    current = candidate
                else:
                    wrapped_lines.append(current)
                    current = word
            wrapped_lines.append(current)

        return '\n'.join(wrapped_lines)

    # Feed posts are capped at 5:4 portrait so the collage stays scannable;
    # taller content is cropped centered on its extent
    MAX_POST_ASPECT = 1.25

    def _cap_bounds_height(self, top, bottom):
        canvas_height = int(self.image_height or settings.POST_IMAGE_HEIGHT)
        max_height = int(round(int(self.image_width) * self.MAX_POST_ASPECT))
        if bottom - top <= max_height:
            return (int(top), int(bottom))
        center = (top + bottom) / 2
        new_top = max(0, int(center - max_height / 2))
        new_bottom = min(canvas_height, new_top + max_height)
        return (new_top, new_bottom)

    def _calculate_vertical_bounds(self, text_elements, include_repost=True):
        canvas_height = int(self.image_height or settings.POST_IMAGE_HEIGHT)

        # Image backgrounds keep the full canvas unless the composer's crop
        # bars defined a band; then the feed shows exactly that band (plus
        # any text/stickers placed outside it).
        crop_band = None
        if self.background_image:
            if (
                self.crop_top is not None
                and self.crop_bottom is not None
                and self.crop_bottom > self.crop_top
            ):
                crop_band = (
                    max(0, int(self.crop_top)),
                    min(canvas_height, int(self.crop_bottom)),
                )
            else:
                return self._cap_bounds_height(0, canvas_height)

        # A gradient spans the canvas, so cropping to the text showed a slice
        # where the ramp had barely moved - it read as a flat colour in the
        # feed. Gradient posts keep the whole canvas (capped to 5:4).
        if self.background_gradient and len(self.background_gradient) >= 2:
            return self._cap_bounds_height(0, canvas_height)

        has_repost_layer = include_repost and self.is_repost and self.original_post
        if not text_elements and not has_repost_layer and not self.sticker_elements:
            if crop_band:
                return self._cap_bounds_height(*crop_band)
            return self._cap_bounds_height(0, canvas_height)

        bounds = []
        for element in text_elements:
            element_bounds = self._measure_text_bounds(element)
            if element_bounds:
                bounds.append(element_bounds)

        # Add sticker bounds to ensure they're included in the crop
        if self.sticker_elements:
            for sticker in self.sticker_elements:
                x = int(sticker.get('x', 0))
                y = int(sticker.get('y', 0))
                width = int(sticker.get('width', 60))
                height = int(sticker.get('height', 60))
                scale = float(sticker.get('scale', 1.0))
                
                # Calculate sticker bounds (centered at x, y)
                final_width = int(width * scale)
                final_height = int(height * scale)
                left = x - final_width // 2
                top = y - final_height // 2
                right = left + final_width
                bottom = top + final_height
                
                bounds.append((left, top, right, bottom))

        # The reply's own outer edge gets extra room so it does not sit flush
        # against the crop when a quote anchors the other side.
        reply_margin_top = 0
        reply_margin_bottom = 0
        if has_repost_layer:
            geometry = self._repost_strip_geometry()
            if geometry:
                strip_top = max(0, geometry['paste_y'])
                strip_bottom = min(canvas_height, geometry['paste_y'] + geometry['strip_height'])
                if bounds:
                    reply_mid = (min(b[1] for b in bounds) + max(b[3] for b in bounds)) / 2
                    if reply_mid < (strip_top + strip_bottom) / 2:
                        reply_margin_top = REPLY_EDGE_MARGIN
                    else:
                        reply_margin_bottom = REPLY_EDGE_MARGIN
                bounds.append((0, strip_top, int(self.image_width), strip_bottom))

        if not bounds:
            if crop_band:
                return self._cap_bounds_height(*crop_band)
            return self._cap_bounds_height(0, canvas_height)

        min_y = min(b[1] for b in bounds)
        max_y = max(b[3] for b in bounds)

        margin = 40
        final_top = max(0, int(min_y - margin - reply_margin_top))
        final_bottom = min(canvas_height, int(max_y + margin + reply_margin_bottom))

        # The crop bars are authoritative: content inside the band never
        # widens the crop, but content placed outside it is never cut off
        if crop_band:
            final_top = final_top if min_y < crop_band[0] else crop_band[0]
            final_bottom = final_bottom if max_y > crop_band[1] else crop_band[1]
            final_top = min(final_top, crop_band[0])
            final_bottom = max(final_bottom, crop_band[1])

        # These bounds are the post's CONTENT extent, not its display height.
        # A card in the feed pads a short post out to MIN_CROP_CANVAS_PX so it
        # can carry the [Aa] chrome, but that padding is the card's business:
        # baking it in here would also inflate every quoted strip cut from
        # this post, since _repost_strip_geometry crops on top_y/bottom_y.
        if final_bottom <= final_top:
            final_bottom = min(canvas_height, final_top + 1)
            if final_bottom <= final_top:
                final_top = max(0, final_bottom - 1)

        return self._cap_bounds_height(final_top, final_bottom)

    @staticmethod
    def _diagonal_gradient(width, height, stops):
        """Top-left to bottom-right ramp across every stop.

        Matches the composer's LinearGradient start (0,0) -> end (1,1). iOS
        projects each point onto the real diagonal (in points, not unit
        space): t = (x*w + y*h) / (w^2 + h^2). Isolines are therefore
        perpendicular to the diagonal, not corner to corner - fitted against
        a simulator capture to within 1 colour unit. Built from C-level
        Pillow ops (two ramps blended, then a 256-entry palette) since a
        per-pixel Python loop over 2.5M pixels would dominate render time.
        """
        ramp = Image.linear_gradient('L')  # 256x256, 0 at top -> 255 at bottom
        vertical = ramp.resize((width, height), Image.BILINEAR)
        horizontal = ramp.rotate(90, expand=True)  # 0 at left -> 255 at right
        horizontal = horizontal.resize((width, height), Image.BILINEAR)
        # t = a*(x/w) + b*(y/h), with a = w^2/(w^2+h^2) and b = 1 - a
        b = (height * height) / float(width * width + height * height)
        t = Image.blend(horizontal, vertical, b)

        # Interpolate across EVERY stop, not just the ends, so a rainbow
        # (or any multi-stop preset) renders as designed.
        rgb = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in stops]
        segments = len(rgb) - 1
        palette = []
        for level in range(256):
            pos = (level / 255) * segments
            seg = min(int(pos), segments - 1)
            ratio = pos - seg
            a, b = rgb[seg], rgb[seg + 1]
            palette.extend(int(round(a[k] * (1 - ratio) + b[k] * ratio)) for k in range(3))
        t.putpalette(palette)  # 'L' -> 'P' in place
        return t.convert('RGB')

    def _create_background(self, height):
        width = int(self.image_width or settings.POST_IMAGE_WIDTH)
        height = int(height)
        
        # Create base background
        if self.background_gradient and len(self.background_gradient) >= 2:
            stops = [c for c in self.background_gradient if isinstance(c, str) and len(c) == 7]
            if len(stops) < 2:
                stops = [self.background_gradient[0], self.background_gradient[-1]]
            background = self._diagonal_gradient(width, height, stops)
        else:
            background = Image.new('RGB', (width, height), self.background_color)
        
        # Add image background if present
        if self.background_image:
            try:
                from urllib.parse import urlparse
                
                # Download and composite the image background
                print(f"Processing image background: {self.background_image}")
                
                bg_img = None
                
                # For local file URIs (like from expo-image-picker)
                if self.background_image.startswith('file://'):
                    # Remove file:// prefix for local files
                    local_path = self.background_image.replace('file://', '')
                    if os.path.exists(local_path):
                        bg_img = Image.open(local_path)
                    else:
                        print(f"Local image file not found: {local_path}")
                        return background
                        
                # For /media/ paths (local media files)
                elif '/media/' in self.background_image:
                    # Extract the path after /media/
                    media_path = self.background_image.split('/media/')[-1]
                    file_path = os.path.join(settings.MEDIA_ROOT, media_path)
                    print(f"Loading background from local media: {file_path}")
                    if os.path.exists(file_path):
                        bg_img = Image.open(file_path)
                    else:
                        print(f"Background file not found: {file_path}")
                        return background
                        
                # For HTTP URLs, download the image
                elif self.background_image.startswith(('http://', 'https://')):
                    import urllib.request
                    print(f"Downloading background from URL: {self.background_image}")
                    with urllib.request.urlopen(self.background_image) as response:
                        bg_img = Image.open(response)
                else:
                    print(f"Unsupported background image format: {self.background_image}")
                    return background
                
                if bg_img is None:
                    print(f"Failed to load background image")
                    return background
                
                # Fix EXIF orientation (phones often rotate images)
                try:
                    from PIL import ImageOps
                    bg_img = ImageOps.exif_transpose(bg_img)
                    print(f"Applied EXIF orientation correction")
                except Exception as e:
                    print(f"Could not apply EXIF correction: {e}")
                
                # Convert to RGB if needed
                if bg_img.mode != 'RGB':
                    bg_img = bg_img.convert('RGB')
                
                # Apply scale and position
                scale = self.background_image_scale or 1.0
                position = self.background_image_position or {'x': 0, 'y': 0}
                
                print(f"Background image dimensions: {bg_img.size}")
                print(f"Canvas dimensions: {width}x{height}")
                print(f"Scale to apply: {scale}")
                
                # Scale the image
                if scale != 1.0:
                    new_width = int(bg_img.width * scale)
                    new_height = int(bg_img.height * scale)
                    bg_img = bg_img.resize((new_width, new_height), Image.LANCZOS)
                
                # Create a new background with the image
                final_bg = background.copy()
                
                # Calculate position (center + offset)
                x_offset = (width - bg_img.width) // 2 + int(position['x'])
                y_offset = (height - bg_img.height) // 2 + int(position['y'])
                
                # Paste the background image
                final_bg.paste(bg_img, (x_offset, y_offset))
                background = final_bg
                
                print(f"✅ Image background composited successfully")
                
            except Exception as e:
                print(f"Error processing image background: {e}")
                import traceback
                traceback.print_exc()
        
        return background

    def _repost_strip_geometry(self):
        """Where the original's cropped content strip lands on this canvas.

        The strip (the original's top_y..bottom_y region, i.e. what the feed
        shows) is scaled to this canvas width and centered vertically, so the
        reposter's own background stays visible above and below it. Shared by
        the compositor and the crop-bounds calculation.
        """
        original = self.original_post
        if not original or not original.rendered_image:
            return None

        orig_width = original.image_width or settings.POST_IMAGE_WIDTH
        orig_height = original.image_height or settings.POST_IMAGE_HEIGHT
        crop_top = original.top_y if original.top_y is not None else 0
        crop_bottom = original.bottom_y if original.bottom_y is not None else orig_height
        if crop_bottom <= crop_top:
            crop_top, crop_bottom = 0, orig_height

        # Quoted strips are inset with a hairline so quotation reads visually;
        # nested composites naturally produce nested frames (chain depth cue)
        canvas_width = int(self.image_width)
        canvas_height = int(self.image_height or settings.POST_IMAGE_HEIGHT)

        stored = self.repost_geometry or {}
        if stored.get('width') and stored.get('y') is not None:
            # WYSIWYG: the strip goes exactly where the composer showed it
            # A quote may be enlarged past the canvas edges (the composer
            # allows it), so the strip can be wider than the canvas and land
            # at negative coordinates. PIL crops the overflow; the only
            # guard is that some of it stays on frame.
            strip_width = max(1, min(canvas_width * 3, int(stored['width'])))
            scale = float(strip_width) / float(orig_width)
            strip_height = max(1, int(round((crop_bottom - crop_top) * scale)))
            edge = 40
            paste_x = max(-strip_width + edge, min(canvas_width - edge, int(stored.get('x', 0))))
            paste_y = max(-strip_height + edge, min(canvas_height - edge, int(stored['y'])))
        else:
            # Fallback (no geometry sent): inset strip below the response
            # content, or centered when there is no response content
            inset = int(round(canvas_width * 0.08))
            strip_width = canvas_width - 2 * inset
            scale = float(strip_width) / float(orig_width)
            strip_height = max(1, int(round((crop_bottom - crop_top) * scale)))
            paste_x = inset
            anchor_bottom = getattr(self, '_strip_anchor_bottom', None)
            if anchor_bottom is not None:
                paste_y = min(canvas_height - strip_height - 10, int(anchor_bottom) + 40)
                paste_y = max(0, paste_y)
            else:
                paste_y = (canvas_height - strip_height) // 2

        return {
            'crop_top': int(crop_top),
            'crop_bottom': int(crop_bottom),
            'strip_width': strip_width,
            'strip_height': strip_height,
            'paste_x': paste_x,
            'paste_y': paste_y,
        }

    def _composite_original(self, img):
        try:
            geometry = self._repost_strip_geometry()
            if geometry is None:
                return

            # Storage-agnostic read: .path raises NotImplementedError on S3,
            # which used to be swallowed and silently drop the quoted strip
            with self.original_post.rendered_image.open('rb') as fh:
                original_img = Image.open(io.BytesIO(fh.read())).convert('RGB')
            strip = original_img.crop(
                (0, geometry['crop_top'], original_img.width, geometry['crop_bottom'])
            )
            strip = strip.resize(
                (geometry['strip_width'], geometry['strip_height']), Image.LANCZOS
            )
            img.paste(strip, (geometry['paste_x'], geometry['paste_y']))

            # Hairline frame around the quoted strip
            draw = ImageDraw.Draw(img)
            draw.rectangle(
                (
                    geometry['paste_x'] - 1,
                    geometry['paste_y'] - 1,
                    geometry['paste_x'] + geometry['strip_width'],
                    geometry['paste_y'] + geometry['strip_height'],
                ),
                outline='#88888A',
                width=2,
            )
        except Exception as e:
            _report_render_error('Error compositing quoted parent strip', e)

    @classmethod
    def _normalize_alternate_colors(cls, value):
        """Validate a two-colour per-letter cycle.

        Only colours from the app's own palette are accepted - the composer
        can only offer those, so anything else is a malformed or hand-crafted
        payload and is dropped rather than rendered. Returns None unless
        exactly two distinct valid colours came through, so the caller can
        treat it as a plain on/off.
        """
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return None
        presets = {c.upper() for c in cls.COLOR_PRESETS}
        colors = []
        for entry in value:
            if not isinstance(entry, str):
                return None
            entry = entry.strip().upper()
            if entry not in presets:
                return None
            colors.append(entry)
        if colors[0] == colors[1]:
            return None
        return colors

    def _is_styled_text(self, element):
        """Styled text (rainbow, letter-spaced, underlined, or chipped)
        needs the per-line layout path instead of PIL's multiline_text."""
        return bool(
            element.get('rainbow') or element.get('letterSpacing')
            or element.get('underline') or element.get('hasBackground')
            or element.get('alternateColors')
        )

    def _glow_radius(self, element):
        return max(4, int(element['fontSize'] * 0.12))

    def _styled_text_layout(self, element, font):
        """Per-line layout for styled text: (lines[(text, width)], line_height,
        gap, total_height). Anchored like multiline anchor='mm'."""
        dummy = Image.new('RGB', (1, 1))
        draw = ImageDraw.Draw(dummy)
        spacing = element.get('letterSpacing') or 0
        ascent, descent = font.getmetrics()
        line_height = ascent + descent
        gap = 4  # matches PIL multiline_text default spacing
        lines = [
            (line, self._spaced_text_width(draw, line, font, spacing))
            for line in element['content'].split('\n')
        ]
        total_height = len(lines) * line_height + (len(lines) - 1) * gap
        return lines, line_height, gap, total_height

    def _ink_bbox(self, element, font):
        """Raw text bounds (no background padding, no glow padding)."""
        content = element['content']
        if not content:
            return None

        if self._is_styled_text(element):
            lines, _line_height, _gap, total_height = self._styled_text_layout(element, font)
            max_width = max(width for _text, width in lines)
            return (
                element['x'] - max_width / 2,
                element['y'] - total_height / 2,
                element['x'] + max_width / 2,
                element['y'] + total_height / 2,
            )

        try:
            dummy = Image.new('RGB', (10, 10))
            draw = ImageDraw.Draw(dummy)
            bbox = draw.multiline_textbbox((0, 0), content, font=font, align='center', anchor='mm')
        except Exception:
            return None
        return (
            element['x'] + bbox[0],
            element['y'] + bbox[1],
            element['x'] + bbox[2],
            element['y'] + bbox[3],
        )

    def _measure_text_bounds(self, element):
        font = self._get_font_for_element(element)
        bbox = self._ink_bbox(element, font)
        if bbox is None:
            return None
        left, top, right, bottom = bbox

        if element.get('glow'):
            pad = self._glow_radius(element) * 2
            left -= pad
            right += pad
            top -= pad
            bottom += pad

        if element.get('hasBackground'):
            padding_x = 8
            padding_y = 4
            left -= padding_x
            right += padding_x
            top -= padding_y
            bottom += padding_y

        return (int(left), int(top), int(right), int(bottom))

    def _render_text_ink(self, draw, element, font, include_chips=True):
        """Draw the element's text onto the given draw surface. Handles the
        per-character path (rainbow colors, letter spacing) and the standard
        multiline path identically to how the composer previews them."""
        content = element['content']

        align = element.get('align', 'center')

        if not self._is_styled_text(element):
            draw.multiline_text(
                (element['x'], element['y']),
                content,
                font=font,
                fill=element['color'],
                align=align,
                anchor='mm',
            )
            return

        spacing = element.get('letterSpacing') or 0
        # Rainbow and two-colour alternation are one mechanism: a palette
        # advanced per non-space character. An explicit pair wins over
        # rainbow so a duo choice is never silently overridden.
        cycle_palette = element.get('alternateColors') or None
        if not cycle_palette and element.get('rainbow'):
            cycle_palette = RAINBOW_TEXT_PALETTE
        lines, line_height, gap, total_height = self._styled_text_layout(element, font)
        top = element['y'] - total_height / 2
        max_width = max(width for _text, width in lines)

        underline = bool(element.get('underline'))
        ascent, _descent = font.getmetrics()
        size = element.get('fontSize', 24)

        def line_x(width):
            if align == 'left':
                return element['x'] - max_width / 2
            if align == 'right':
                return element['x'] + max_width / 2 - width
            return element['x'] - width / 2

        # Per-line chips: each line gets its own rectangle wrapping just
        # that line (staircase), drawn before any ink
        if include_chips and element.get('hasBackground'):
            pad_x, pad_y = 8, 4
            for i, (line, width) in enumerate(lines):
                if not line.strip():
                    continue
                x = line_x(width)
                ly = top + i * (line_height + gap)
                draw.rectangle(
                    (x - pad_x, ly - pad_y, x + width + pad_x, ly + line_height + pad_y),
                    fill=element.get('backgroundColor', '#FFFFFF'),
                )

        color_index = 0
        for i, (line, width) in enumerate(lines):
            x = line_x(width)
            y = top + i * (line_height + gap)
            line_start_x = x
            if cycle_palette or spacing:
                for ch in line:
                    if cycle_palette and not ch.isspace():
                        fill = cycle_palette[color_index % len(cycle_palette)]
                        color_index += 1
                    else:
                        fill = element['color']
                    draw.text((x, y), ch, font=font, fill=fill)
                    x += draw.textlength(ch, font=font) + spacing
            else:
                # Whole-line draw keeps kerning (underline-only path)
                draw.text((line_start_x, y), line, font=font, fill=element['color'])
            if underline and line.strip():
                underline_y = y + ascent + max(2, int(size * 0.04))
                draw.line(
                    (line_start_x, underline_y, line_start_x + width, underline_y),
                    fill=element['color'],
                    width=max(2, int(size // 16)),
                )

    def _draw_text_element(self, img, draw, element):
        content = element['content']
        if not content:
            return

        font = self._get_font_for_element(element)
        opacity = float(element.get('opacity') or 1)

        if opacity < 1:
            # Whole element (chips + ink + glow) fades as one layer, exactly
            # like the composer's Text opacity
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            layer_draw = ImageDraw.Draw(layer)
            if element.get('glow'):
                glow_src = Image.new('RGBA', img.size, (0, 0, 0, 0))
                glow_draw = ImageDraw.Draw(glow_src)
                self._render_text_ink(glow_draw, element, font, include_chips=False)
                glow_layer = glow_src.filter(ImageFilter.GaussianBlur(self._glow_radius(element)))
                layer.paste(glow_layer, (0, 0), glow_layer)
                layer.paste(glow_layer, (0, 0), glow_layer)
            self._render_text_ink(layer_draw, element, font)
            layer.putalpha(layer.getchannel('A').point(lambda a: int(a * opacity)))
            img.paste(layer, (0, 0), layer)
            return

        if element.get('glow'):
            # Blurred copy of the ink underneath the sharp ink, pasted twice
            # so the halo reads at feed size
            layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
            layer_draw = ImageDraw.Draw(layer)
            self._render_text_ink(layer_draw, element, font, include_chips=False)
            glow_layer = layer.filter(ImageFilter.GaussianBlur(self._glow_radius(element)))
            img.paste(glow_layer, (0, 0), glow_layer)
            img.paste(glow_layer, (0, 0), glow_layer)

        self._render_text_ink(draw, element, font)

    # Candidate font paths per family; the first existing path wins. The repo
    # fonts (frontend/assets/fonts) come first: they are the exact files the
    # composer preview loads, so render parity holds on any machine.
    _REPO_FONTS = os.path.join(
        str(settings.BASE_DIR), '..', 'frontend', 'assets', 'fonts'
    )
    FONT_PATH_CANDIDATES = {
        'arial-black': [
            os.path.join(_REPO_FONTS, 'ArialBlack.ttf'),
            '/System/Library/Fonts/Supplemental/Arial Black.ttf',
            '/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf',
        ],
        'impact': [
            os.path.join(_REPO_FONTS, 'Impact.ttf'),
            '/System/Library/Fonts/Supplemental/Impact.ttf',
            '/usr/share/fonts/truetype/msttcorefonts/Impact.ttf',
        ],
        'crimson-text': [
            os.path.join(_REPO_FONTS, 'TimesNewRoman.ttf'),
            '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
            '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf',
        ],
        'papyrus': [
            os.path.join(_REPO_FONTS, 'Papyrus.ttf'),
            '/System/Library/Fonts/Supplemental/Papyrus.ttc',
        ],
        'courier-prime': [
            os.path.join(_REPO_FONTS, 'CourierPrime.ttf'),
        ],
        'caveat': [
            os.path.join(_REPO_FONTS, 'Caveat.ttf'),
        ],
    }

    # Real bold/italic faces per family - families without a face fall back
    # to regular (the composer does not offer the toggle for those)
    FONT_VARIANT_PATHS = {
        ('courier-prime', 'bold'): [os.path.join(_REPO_FONTS, 'CourierPrimeBold.ttf')],
        ('courier-prime', 'italic'): [os.path.join(_REPO_FONTS, 'CourierPrimeItalic.ttf')],
        ('courier-prime', 'bold_italic'): [os.path.join(_REPO_FONTS, 'CourierPrimeBoldItalic.ttf')],
        ('crimson-text', 'bold'): [os.path.join(_REPO_FONTS, 'TimesNewRomanBold.ttf')],
        ('crimson-text', 'italic'): [os.path.join(_REPO_FONTS, 'TimesNewRomanItalic.ttf')],
        ('crimson-text', 'bold_italic'): [os.path.join(_REPO_FONTS, 'TimesNewRomanBoldItalic.ttf')],
        ('caveat', 'bold'): [os.path.join(_REPO_FONTS, 'CaveatBold.ttf')],
    }
    _resolved_font_paths = {}

    @classmethod
    def _resolve_font_path(cls, font_family):
        """Find the first existing font file for a family, cached per process."""
        if font_family not in cls._resolved_font_paths:
            candidates = (
                cls.FONT_PATH_CANDIDATES.get(font_family)
                or cls.FONT_PATH_CANDIDATES['arial-black']
            )
            cls._resolved_font_paths[font_family] = next(
                (path for path in candidates if os.path.exists(path)), None
            )
        return cls._resolved_font_paths[font_family]

    def _load_font(self, font_family, font_size, bold=False, italic=False):
        font_size = max(8, int(round(font_size)))
        font_path = None
        if bold or italic:
            # Best available face: bold-italic, then bold, then italic
            for variant in (('bold_italic',) if bold and italic else ()) + \
                           (('bold',) if bold else ()) + \
                           (('italic',) if italic else ()):
                for candidate in self.FONT_VARIANT_PATHS.get((font_family, variant), []):
                    if os.path.exists(candidate):
                        font_path = candidate
                        break
                if font_path:
                    break
        if not font_path:
            font_path = self._resolve_font_path(font_family)
        if font_path:
            try:
                return ImageFont.truetype(
                    font_path, font_size, layout_engine=FONT_LAYOUT_ENGINE
                )
            except Exception as e:
                print(f"Failed to load font {font_path}: {e}")
        # Scalable fallback so the requested size is still respected
        try:
            return ImageFont.load_default(font_size)
        except TypeError:  # Pillow < 10.1 has no size parameter
            return ImageFont.load_default()

    def _get_font_for_element(self, element):
        return self._load_font(
            element.get('fontFamily', 'arial-black'),
            element.get('fontSize', self.font_size),
            bold=bool(element.get('bold')),
            italic=bool(element.get('italic')),
        )

    def _draw_stickers(self, img):
        """Draw sticker elements on the image"""
        if not self.sticker_elements:
            return
            
        try:
            for sticker in self.sticker_elements:
                self._draw_single_sticker(img, sticker)
        except Exception as e:
            print(f"Error drawing stickers: {e}")

    def _draw_single_sticker(self, img, sticker):
        """Draw a single sticker element (image)"""
        try:
            sticker_uri = sticker.get('uri', '')
            
            # All stickers are images - load and composite them
            self._draw_image_sticker(img, sticker)
                
        except Exception as e:
            print(f"Error drawing single sticker: {e}")

    def _draw_image_sticker(self, img, sticker):
        """Draw an image sticker by loading and compositing the image"""
        try:
            import requests
            from PIL import Image as PILImage
            from io import BytesIO
            import os
            
            sticker_uri = sticker.get('uri', '')
            x = int(sticker.get('x', 100))
            y = int(sticker.get('y', 100))
            width = int(sticker.get('width', 60))
            height = int(sticker.get('height', 60))
            scale = float(sticker.get('scale', 1.0))
            rotation = float(sticker.get('rotation', 0))
            shape = sticker.get('shape', 'full')  # Get shape field: 'full', 'square', 'rounded'
            
            # Calculate final dimensions
            final_width = int(width * scale)
            final_height = int(height * scale)
            
            # Load the sticker image
            sticker_img = None
            
            if sticker_uri.startswith(('http://', 'https://')):
                # Download from URL
                try:
                    response = requests.get(sticker_uri, timeout=5)
                    response.raise_for_status()
                    sticker_img = PILImage.open(BytesIO(response.content))
                except Exception as e:
                    print(f"Failed to download sticker from URL: {e}")
                    return
                    
            elif sticker_uri.startswith('/media/'):
                # Local media file - construct full path
                from django.conf import settings
                file_path = os.path.join(settings.MEDIA_ROOT, sticker_uri.replace('/media/', ''))
                if os.path.exists(file_path):
                    sticker_img = PILImage.open(file_path)
                else:
                    print(f"Sticker file not found: {file_path}")
                    return
                    
            elif sticker_uri.startswith('file://'):
                # Local file URI
                file_path = sticker_uri.replace('file://', '')
                if os.path.exists(file_path):
                    sticker_img = PILImage.open(file_path)
                else:
                    print(f"Sticker file not found: {file_path}")
                    return
                    
            elif os.path.exists(sticker_uri):
                # Direct file path
                sticker_img = PILImage.open(sticker_uri)
            else:
                print(f"Invalid sticker URI: {sticker_uri}")
                return
            
            if sticker_img is None:
                return
                
            # Convert to RGBA if needed
            if sticker_img.mode != 'RGBA':
                sticker_img = sticker_img.convert('RGBA')
            
            # Resize the sticker
            if sticker_img.size != (final_width, final_height):
                sticker_img = sticker_img.resize((final_width, final_height), PILImage.LANCZOS)
            
            # Apply rotation if needed
            if rotation != 0:
                sticker_img = sticker_img.rotate(rotation, expand=True)
                # Update dimensions after rotation
                final_width, final_height = sticker_img.size
            
            # Calculate position (center the sticker at x, y)
            paste_x = x - final_width // 2
            paste_y = y - final_height // 2
            
            # Ensure we don't paste outside the canvas
            paste_x = max(0, min(paste_x, img.width - final_width))
            paste_y = max(0, min(paste_y, img.height - final_height))
            
            # Composite the sticker onto the main image
            img.paste(sticker_img, (paste_x, paste_y), sticker_img)
            
        except Exception as e:
            print(f"Error drawing image sticker: {e}")
            import traceback
            traceback.print_exc()

    
    def _create_fallback_image(self):
        """Create a simple fallback image"""
        img = Image.new('RGB', (self.image_width, self.image_height), '#333333')
        draw = ImageDraw.Draw(img)
        
        # Simple text rendering
        font = ImageFont.load_default()
        text = "Error rendering post"
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        
        x = (self.image_width - text_width) // 2
        y = (self.image_height - text_height) // 2
        
        draw.text((x, y), text, font=font, fill='#FFFFFF')
        
        img_io = io.BytesIO()
        img.save(img_io, format='PNG')
        img_io.seek(0)
        
        filename = f"{self.id}_fallback.png"
        self.rendered_image.save(filename, ContentFile(img_io.read()), save=False)
    
    def get_content_hash(self):
        """Generate hash of content for duplicate detection"""
        content = f"{self.text_content}{self.font_choice}{self.font_size}{self.text_color}{self.background_color}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def __str__(self):
        return f"{self.author.handle}: {self.text_content[:50]}..."


class PostReport(models.Model):
    """Track reports against posts"""
    
    REPORT_REASONS = [
        ('spam', 'Spam'),
        ('harassment', 'Harassment'),
        ('inappropriate', 'Inappropriate Content'),
        ('fake', 'Fake/Misleading'),
        ('copyright', 'Copyright Violation'),
        ('other', 'Other'),
    ]
    
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='post_reports_made')
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='reports')
    reason = models.CharField(max_length=20, choices=REPORT_REASONS)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Moderation status
    is_reviewed = models.BooleanField(default=False)
    moderator_notes = models.TextField(blank=True)
    action_taken = models.CharField(max_length=100, blank=True)
    
    class Meta:
        unique_together = ['reporter', 'post']  # One report per user per post
    
    def __str__(self):
        return f"Report on {self.post.id} by {self.reporter.handle}"


class PostView(models.Model):
    """Track post views (optional for analytics)"""
    
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='views')
    viewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['post', 'viewer']  # One view per user per post
    
    def __str__(self):
        return f"View of {self.post.id}"


class Notification(models.Model):
    """In-app notifications. MVP: reposts of your posts. Delivered live over
    the per-user WebSocket group when the recipient is connected; fetched
    (unread) on app open otherwise. APNs push arrives with the EAS build."""

    NOTIF_TYPES = [('repost', 'Repost')]

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications_sent')
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='notifications')
    notif_type = models.CharField(max_length=20, choices=NOTIF_TYPES, default='repost')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notif_type}: @{self.actor.handle} -> @{self.recipient.handle}"
