import json
import math
import os
import re
import uuid
from rest_framework import serializers
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Post, PostReport
from users.models import User, UserReport, MutedUser


from . import limits
from . import push

CANVAS_STATE_VERSIONS = {1}
HEX_COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')
CANVAS_STATE_MAX_BYTES = 100_000
# The most extra band (canvas px, each side) a quote may show around what it quotes
QUOTE_MARGIN_MAX = 400


def _is_liked(post, context):
    """Has the viewer hearted this post? A list view hands over the liked ids
    of its whole page (one query); a single post asks for itself."""
    liked = context.get('liked_ids')
    if liked is not None:
        return post.pk in liked
    request = context.get('request')
    device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None
    if not device_id:
        return False
    from .models import PostLike
    return PostLike.objects.filter(post=post, user__device_id=device_id).exists()


def _is_author(post, context):
    """True when the request comes from the post author's device."""
    request = context.get('request')
    device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None
    return bool(device_id) and getattr(post.author, 'device_id', None) == device_id



def _follow_kept(runs, kept):
    """Colour ranges (offsets into the typed text) moved onto the sanitised
    text, so each colour stays on its letters when characters before it are
    dropped. Ranges left empty go; malformed ones pass through to the
    renderer, which ignores them."""
    from bisect import bisect_left
    moved = []
    for run in runs:
        start, end = (run.get('start'), run.get('end')) if isinstance(run, dict) else (None, None)
        if not (isinstance(start, int) and isinstance(end, int)):
            moved.append(run)
            continue
        start, end = bisect_left(kept, start), bisect_left(kept, end)
        if end > start:
            moved.append({**run, 'start': start, 'end': end})
    return moved

ANONYMOUS_AVATAR_COLOR = '#4ECDC4'
ALIAS_PREFIX = '~'


def author_alias(post):
    """What stands in for the handle of an unsigned post's author: a name
    for "whoever wrote this post" that says nothing about who that is, and
    is different on every post. The mute, block and report endpoints take
    it in place of a handle (views.user_from_handle)."""
    return f'{ALIAS_PREFIX}{post.id.hex}'


def author_for(post):
    """A post's author as the API shows them. Unsigned posts are anonymous:
    the real handle (and the profile colour, which the author chooses) went
    out on every post, so anyone reading the API could tell which unsigned
    posts were one person's."""
    if post.is_signed:
        return {'handle': post.author.handle, 'avatar_color': post.author.avatar_color}
    return {'handle': author_alias(post), 'avatar_color': ANONYMOUS_AVATAR_COLOR}


def plan_for(post):
    """The post's draw list, unless it is too long to send: text styled
    letter by letter has an entry per letter, and with no limit on a post's
    length one long post weighed megabytes in every feed page it was on.
    Without it the post page shows the server's image (still exact, only
    not redrawn sharp when zoomed)."""
    plan = post.text_plan
    if not isinstance(plan, dict):
        return plan
    marks = sum(
        len(element.get(key) or [])
        for element in plan.get('elements') or [] if isinstance(element, dict)
        for key in ('runs', 'chips', 'lines')
    )
    return plan if marks <= limits.TEXT_PLAN_MAX_MARKS else None


def is_withheld(post):
    """A post moderation has taken down: hidden, or by a banned author. It
    is not shown where it is quoted either."""
    return post.is_hidden or post.author.is_shadowbanned


def _absolute(image, context):
    if not image:
        return None
    request = context.get('request')
    return request.build_absolute_uri(image.url) if request else image.url


def quote_chain_for(obj, context):
    return _quote_chain(obj, context)[0]


def textless_url_for(obj, context):
    """The text-free render, offered only when the quote chain reaches the
    innermost post: the post page draws text for chain levels alone, so a
    level past the end of the chain would show bare."""
    return _absolute(obj.textless_image, context) if _quote_chain(obj, context)[1] else None


def _banned_words():
    """Whole words and phrases from settings.BANNED_WORDS_FILE (one per line,
    # for comments), read again when the file changes. No file, no filter."""
    from django.conf import settings
    path = str(settings.BANNED_WORDS_FILE)
    try:
        stamp = os.path.getmtime(path)
    except OSError:
        return None
    cached = _banned_words.cache
    if cached is None or cached[0] != (path, stamp):
        with open(path, encoding='utf-8') as fh:
            words = [line.strip().lower() for line in fh if line.strip() and not line.startswith('#')]
        pattern = re.compile(r'(?<!\w)(?:' + '|'.join(re.escape(w) for w in words) + r')(?!\w)') if words else None
        cached = _banned_words.cache = ((path, stamp), pattern)
    return cached[1]


_banned_words.cache = None


def _quote_chain(obj, context):
    """(chain, complete), built once per post per serialization."""
    cached = getattr(obj, '_quote_chain_cache', None)
    if cached is None:
        cached = obj._quote_chain_cache = _build_quote_chain(obj, context)
    return cached


def _build_quote_chain(obj, context):
    """Every quoted ancestor with its strip rect mapped into THIS post's
    canvas coordinates, enabling per-level collapse in the feed.
    Level i entry: where ancestor i's strip sits (rect, root canvas px),
    what to draw when levels >= i collapse (the ancestor's reply-only
    strip source), and the chip content for hiding level i."""
    if not obj.is_repost or not obj.original_post_id:
        return [], True
    blocked_ids = context.get('blocked_author_ids') or set()
    request = context.get('request')
    # The feed batch-loads every ancestor on the page (one query per
    # level); following current.original_post instead costs a query per
    # ancestor per post. Falls back to the FK outside the feed.
    ancestors = context.get('ancestors') or {}

    def url_of(image):
        if not image:
            return None
        return request.build_absolute_uri(image.url) if request else image.url

    chain = []
    current = obj
    # Cumulative transform from current level's canvas into root canvas
    offset_x, offset_y, scale = 0.0, 0.0, 1.0
    for _depth in range(limits.QUOTE_CHAIN_DEPTH):
        if not current.is_repost or not current.original_post_id:
            return chain, True
        geometry = current.repost_geometry
        parent = ancestors.get(current.original_post_id) or current.original_post
        if not (isinstance(geometry, dict) and geometry.get('width')):
            return chain, False
        parent_width = parent.image_width or 1080
        withheld = is_withheld(parent)
        crop_top, crop_bottom = Post.quoted_crop(parent, geometry)
        level_scale = geometry['width'] / parent_width

        rect = {
            'x': int(offset_x + geometry.get('x', 0) * scale),
            'y': int(offset_y + geometry.get('y', 0) * scale),
            'width': int(geometry['width'] * scale),
            'height': int((crop_bottom - crop_top) * level_scale * scale),
        }

        # What to draw for this ancestor when deeper levels collapse:
        # its reply-only render if it is itself a repost, else its full
        # render (leaf posts have no quote to hide)
        if parent.is_repost and parent.response_image:
            strip_source = {
                'url': url_of(parent.response_image),
                'top_y': parent.response_top_y or 0,
                'bottom_y': parent.response_bottom_y or 0,
                'image_width': parent.image_width,
                'image_height': parent.image_height,
            }
        else:
            strip_source = {
                'url': url_of(parent.rendered_image),
                'top_y': crop_top,
                'bottom_y': crop_bottom,
                'image_width': parent.image_width,
                'image_height': parent.image_height,
            }

        chain.append({
            'rect': rect,
            'strip': strip_source,
            # tapping this level opens (or, double-tapped, quotes) this post
            'post_id': str(parent.id),
        # the top of the band of the parent this quote shows (parent canvas
        # px): rect's top edge is this row of the parent
        'crop_top': crop_top,
            'snippet': '' if withheld else (parent.text_content or '').strip()[:24],
            'background_color': parent.background_color,
            # the masthead samples its costume from every level of the
            # page, quoted ancestors included - not just top-level posts
            'font_choice': parent.font_choice,
        # the post page draws each level's text itself, over the text-free
        # render; rainbow text needs to know a gradient lies under it
        'background_gradient': parent.background_gradient,
            'text_elements': [] if withheld else parent.text_elements,
        # the parent's text as its render drew it (parent canvas px)
        'text_plan': None if withheld else plan_for(parent),
            # covered for this viewer: its author is blocked (either way
            # round), or moderation took the post down
            'hidden': parent.author_id in blocked_ids or withheld,
        })

        # Descend: next level's coordinates live inside this strip,
        # which shows parent cropped from its top_y
        offset_x = rect['x']
        offset_y = rect['y'] - crop_top * level_scale * scale
        scale = scale * level_scale
        current = parent
    return chain, not (current.is_repost and current.original_post_id)


class PostSerializer(serializers.ModelSerializer):
    """Serializer for Post model with full create/read capabilities"""
    author = serializers.SerializerMethodField()
    text_plan = serializers.SerializerMethodField()
    rendered_image_url = serializers.SerializerMethodField()
    repost_data = serializers.JSONField(write_only=True, required=False)
    original_post = serializers.PrimaryKeyRelatedField(read_only=True)
    repost_screenshot_url = serializers.SerializerMethodField()
    canvas_width = serializers.IntegerField(write_only=True, required=False)
    canvas_height = serializers.IntegerField(write_only=True, required=False)
    canvas_state = serializers.JSONField(required=False, allow_null=True)
    editable = serializers.SerializerMethodField()
    is_author = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    textless_image_url = serializers.SerializerMethodField()
    quote_chain = serializers.SerializerMethodField()
    
    class Meta:
        model = Post
        fields = [
            'id', 'author', 'text_content', 'text_elements', 'sticker_elements', 'font_choice', 'font_size',
            'text_color', 'background_color', 'background_gradient',
            'background_image', 'background_image_scale', 'background_image_position',
            'crop_top', 'crop_bottom',
            'has_outline', 'outline_color', 'rendered_image_url',
            'created_at', 'view_count', 'is_repost', 'original_post', 
            'repost_screenshot_url', 'repost_data', 'canvas_width', 'canvas_height',
            'is_signed', 'signature_style',
            'image_width', 'image_height', 'top_y', 'bottom_y', 'content_boxes',
            'canvas_state', 'editable', 'textless_image_url', 'quote_chain', 'text_plan', 'is_author',
            'like_count', 'liked',
        ]
        read_only_fields = ['id', 'author', 'text_plan', 'rendered_image_url', 'created_at', 'view_count', 'like_count', 
                           'is_repost', 'original_post', 'repost_screenshot_url',
                           'image_width', 'image_height', 'top_y', 'bottom_y', 'content_boxes']
        extra_kwargs = {
            'text_content': {'allow_blank': True}
        }
    
    def get_rendered_image_url(self, obj):
        """Get the full URL for the rendered image"""
        if obj.rendered_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.rendered_image.url)
            return obj.rendered_image.url
        return None
    
    def get_textless_image_url(self, obj):
        return textless_url_for(obj, self.context)

    def get_author(self, obj):
        return author_for(obj)

    def get_text_plan(self, obj):
        return plan_for(obj)

    def get_quote_chain(self, obj):
        return quote_chain_for(obj, self.context)

    def get_repost_screenshot_url(self, obj):
        """Get the full URL for the repost screenshot"""
        if obj.repost_screenshot:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.repost_screenshot.url)
            return obj.repost_screenshot.url
        return None
    
    def validate_canvas_width(self, value):
        if value != limits.CANVAS_WIDTH:
            raise serializers.ValidationError(f'canvas_width must be {limits.CANVAS_WIDTH}')
        return value

    def validate_canvas_height(self, value):
        if not limits.CANVAS_HEIGHT_MIN <= value <= limits.CANVAS_HEIGHT_MAX:
            raise serializers.ValidationError(
                f'canvas_height must be {limits.CANVAS_HEIGHT_MIN}-{limits.CANVAS_HEIGHT_MAX}')
        return value

    def validate_text_elements(self, value):
        """What is actually drawn: each element's text is sanitised, sizes are
        clamped to the drawable range, colours must be #RRGGBB, fonts must be
        ones the server has. Moderation and the length limit then run on the
        drawn text (validate builds text_content from it)."""
        from .models import _sanitize_kept
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('text_elements must be a list')
        if len(value) > limits.MAX_TEXT_ELEMENTS:
            raise serializers.ValidationError(f'At most {limits.MAX_TEXT_ELEMENTS} text elements')
        fonts = {key for key, _label in Post.FONT_CHOICES}
        cleaned = []
        for element in value:
            if not isinstance(element, dict) or not isinstance(element.get('content', ''), str):
                raise serializers.ValidationError('Each text element must be an object with text content')
            element = dict(element)
            raw = element.get('content') or ''
            kept = _sanitize_kept(raw)
            element['content'] = ''.join(raw[i] for i in kept)
            try:
                size = float(element.get('fontSize', 24))
                for axis in ('x', 'y'):
                    if axis in element:
                        element[axis] = float(element[axis])
                        if not math.isfinite(element[axis]):
                            raise ValueError
            except (TypeError, ValueError):
                raise serializers.ValidationError('Text element sizes and positions must be numbers')
            if not math.isfinite(size):
                raise serializers.ValidationError('Text element sizes must be numbers')
            # the renderer does arithmetic on these: one that is not a
            # number failed the render, and the post was saved as an error card
            for key in ('letterSpacing', 'opacity'):
                if element.get(key) is not None:
                    if isinstance(element[key], bool) or not isinstance(element[key], (int, float)) \
                            or not math.isfinite(element[key]):
                        raise serializers.ValidationError(f'Text element {key} must be a number')
            element['fontSize'] = min(max(size, limits.FONT_SIZE_MIN), limits.FONT_SIZE_MAX)
            if element.get('outlineColor') is not None and not (
                    isinstance(element['outlineColor'], str) and HEX_COLOR.match(element['outlineColor'])):
                raise serializers.ValidationError('Text element outlineColor must be #RRGGBB or null')
            for key in ('color', 'backgroundColor'):
                if key in element and not (isinstance(element[key], str) and HEX_COLOR.match(element[key])):
                    raise serializers.ValidationError(f'Text element {key} must be #RRGGBB')
            if element.get('fontFamily') not in fonts:
                element['fontFamily'] = 'arial-black'
            runs = element.get('colorRuns')
            if runs is not None and (not isinstance(runs, list) or len(runs) > limits.MAX_COLOR_RUNS):
                raise serializers.ValidationError('colorRuns must be a list of at most '
                                                  f'{limits.MAX_COLOR_RUNS} ranges')
            if runs and len(kept) < len(raw):
                element['colorRuns'] = _follow_kept(runs, kept)
            # Where the composer's lines break (offsets into the typed text):
            # moved onto the sanitised text like the colours. Anything
            # malformed goes, and the server wraps the text itself.
            breaks = element.pop('breaks', None)
            if (isinstance(breaks, list) and len(breaks) <= len(raw)
                    and all(isinstance(b, int) and not isinstance(b, bool) and 0 < b <= len(raw) for b in breaks)):
                from bisect import bisect_left
                element['breaks'] = sorted({bisect_left(kept, b) for b in breaks})
            cleaned.append(element)
        return cleaned

    def validate_background_gradient(self, value):
        if value in (None, []):
            return value
        if (
            not isinstance(value, list)
            or not limits.GRADIENT_STOPS_MIN <= len(value) <= limits.GRADIENT_STOPS_MAX
            or not all(isinstance(c, str) and HEX_COLOR.match(c) for c in value)
        ):
            raise serializers.ValidationError(
                f'background_gradient must be {limits.GRADIENT_STOPS_MIN}-'
                f'{limits.GRADIENT_STOPS_MAX} #RRGGBB colours')
        return value

    def validate_repost_data(self, value):
        """{original_post_id, repost_geometry?: {x, y, width}} - numbers, or
        the geometry is dropped (the server then places the quote itself)."""
        if not value:
            return None
        if not isinstance(value, dict):
            raise serializers.ValidationError('repost_data must be an object')
        # The quoted post has to be there: an id that was not one answered
        # 500, a missing post made a "repost" of nothing, and a post taken
        # down by moderation could still be quoted back into the feed
        try:
            original = Post.objects.select_related('author').get(
                id=uuid.UUID(str(value.get('original_post_id'))))
        except (ValueError, Post.DoesNotExist):
            raise serializers.ValidationError('The quoted post no longer exists')
        if is_withheld(original):
            raise serializers.ValidationError('The quoted post no longer exists')
        value['original_post'] = original
        geometry = value.get('repost_geometry')
        if geometry is not None:
            try:
                value['repost_geometry'] = {
                    'x': int(geometry.get('x', 0)),
                    'y': int(geometry.get('y', 0)),
                    'width': int(geometry['width']),
                    # extra band above and below the quoted content, as the
                    # composer showed it (absent from older apps: none)
                    'margin': min(max(int(geometry.get('margin') or 0), 0), QUOTE_MARGIN_MAX),
                }
                if value['repost_geometry']['width'] <= 0:
                    raise ValueError
            except (AttributeError, KeyError, TypeError, ValueError):
                value['repost_geometry'] = None
        return value

    def validate_canvas_state(self, value):
        if value is None:
            return None
        if not isinstance(value, dict) or value.get('version') not in CANVAS_STATE_VERSIONS:
            raise serializers.ValidationError('canvas_state must be a versioned CanvasState object')
        if len(json.dumps(value)) > CANVAS_STATE_MAX_BYTES:
            raise serializers.ValidationError('canvas_state is too large')
        return value

    def get_editable(self, obj):
        return obj.canvas_state is not None and _is_author(obj, self.context)

    def get_liked(self, obj):
        return _is_liked(obj, self.context)

    def get_is_author(self, obj):
        # the post page's menu: your own post offers Edit, not Report/Mute/Block
        return _is_author(obj, self.context)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # The saved composer state is the author's working file, not part of
        # the published post
        if not _is_author(instance, self.context):
            data.pop('canvas_state', None)
        return data

    def create(self, validated_data):
        """Create a post and preload text elements for rendering."""
        repost_data = validated_data.pop('repost_data', None)
        text_elements = validated_data.get('text_elements')
        canvas_width = validated_data.pop('canvas_width', None)
        canvas_height = validated_data.pop('canvas_height', None)

        if text_elements is None:
            text_elements = []
            validated_data['text_elements'] = text_elements

        if canvas_width:
            validated_data['image_width'] = canvas_width
        if canvas_height:
            validated_data['image_height'] = canvas_height

        if repost_data:
            validated_data['is_repost'] = True
            validated_data['original_post'] = repost_data['original_post']
            # WYSIWYG strip placement from the composer (canvas px)
            geometry = repost_data.get('repost_geometry')
            if isinstance(geometry, dict) and geometry.get('width'):
                validated_data['repost_geometry'] = {
                    'x': int(geometry.get('x', 0)),
                    'y': int(geometry.get('y', 0)),
                    'width': int(geometry['width']),
                }
                # The band of the original this quote shows, as of now
                original = validated_data.get('original_post')
                if original:
                    top, bottom = Post.quoted_crop(original, None)
                    margin = int(geometry.get('margin') or 0)
                    top = max(0, top - margin)
                    bottom = min(original.image_height or settings.POST_IMAGE_HEIGHT, bottom + margin)
                    validated_data['repost_geometry'].update(crop_top=top, crop_bottom=bottom)

        # A repost may not reuse its parent's background color: the quote
        # chip carries that color, so the repost must differ for it to read.
        # Compare the effective color (payload value or the model default).
        original = validated_data.get('original_post')
        if original:
            chosen = validated_data.get('background_color') or Post._meta.get_field('background_color').default
            if chosen == original.background_color:
                validated_data['background_color'] = Post.get_next_background_color(
                    original.background_color
                )

        author = validated_data.get('author')
        prefers_signed = False
        preferred_style = 'default'
        if author:
            prefers_signed = getattr(author, 'default_signed_posts', False)
            preferred_style = getattr(author, 'preferred_signature_style', 'default') or 'default'

        provided_is_signed = None
        if hasattr(self, 'initial_data') and 'is_signed' in self.initial_data:
            raw = self.initial_data.get('is_signed')
            # JSON true/false; a string "false" must not read as true
            provided_is_signed = raw.strip().lower() in ('true', '1') if isinstance(raw, str) else bool(raw)

        is_signed = provided_is_signed if provided_is_signed is not None else prefers_signed

        signature_style = validated_data.get('signature_style') or ''
        if is_signed:
            if not signature_style:
                signature_style = preferred_style
        else:
            signature_style = ''

        validated_data['is_signed'] = is_signed
        validated_data['signature_style'] = signature_style

        post = Post(**validated_data)
        post._text_elements_data = text_elements
        post.save()
        
        # Broadcast new post to WebSocket clients
        self._broadcast_new_post(post)
        
        return post
    
    def validate_text_content(self, value):
        """Validate text content"""
        from django.conf import settings
        from .models import _sanitize_glyphs
        value = _sanitize_glyphs(value)
        
        # Allow empty text content (will be validated in validate() method)
        if value.strip():
            banned = _banned_words()
            if banned is not None and banned.search(value.lower()):
                raise serializers.ValidationError("Content contains inappropriate language")
        
        return value
    
    def _broadcast_new_post(self, post):
        """Broadcast new post to WebSocket clients"""
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                # Create post data for broadcast
                post_data = {
                    'id': str(post.id),
                    'text_content': post.text_content,
                    'sticker_elements': post.sticker_elements,  # Include stickers
                    'author': author_for(post),
                    # the key the author's app sent with the post: how it
                    # knows this one, arriving over the socket, is its own
                    'client_key': self.context.get('client_key') or None,
                    'background_color': post.background_color,
                    'rendered_image_url': self.get_rendered_image_url(post),
                    'created_at': post.created_at.isoformat(),
                    'view_count': post.view_count,
                    'is_repost': post.is_repost,
                    'is_signed': post.is_signed,
                    'signature_style': post.signature_style,
                    'image_width': post.image_width,
                    'image_height': post.image_height,
                    'top_y': post.top_y,
                    'bottom_y': post.bottom_y,
                    'content_boxes': post.content_boxes,
                }
                
                # If it's a repost, include original post data plus the
                # collapsed-render fields and quote chip data. Per-viewer
                # hiding is not applied over broadcast; the next feed fetch
                # filters for each viewer.
                if post.is_repost and post.original_post:
                    post_data['original_post'] = str(post.original_post.id)
                    post_data['repost_screenshot_url'] = self.get_repost_screenshot_url(post)
                    if post.response_image:
                        request = self.context.get('request')
                        url = post.response_image.url
                        post_data['response_image_url'] = request.build_absolute_uri(url) if request else url
                    post_data['response_top_y'] = post.response_top_y
                    post_data['response_bottom_y'] = post.response_bottom_y
                    post_data['quote'] = {
                        'hidden': False,
                        'snippet': (post.original_post.text_content or '').strip()[:24],
                        'background_color': post.original_post.background_color,
                    }
                
                # Broadcast to feed group
                async_to_sync(channel_layer.group_send)(
                    "feed_updates",
                    {
                        "type": "new_post",
                        "post_data": post_data,
                        "count": 1
                    }
                )
        except Exception as e:
            # Don't fail post creation if WebSocket broadcast fails
            print(f"Failed to broadcast new post: {e}")

        # Everyone the new post quotes hears of it: the author of the post it
        # answers, and of every post further up the chain it carries - once
        # each, with the snippet of their own nearest post, and never the
        # quoter themself. Stored for the next app open, sent live to their
        # WS group, and pushed to their phone.
        told = {post.author_id}
        try:
            from .models import Notification
            ancestor = post.original_post if post.is_repost else None
            for _depth in range(limits.QUOTE_CHAIN_DEPTH):
                if ancestor is None:
                    break
                if ancestor.author_id not in told:
                    told.add(ancestor.author_id)
                    notification = Notification.objects.create(
                        recipient_id=ancestor.author_id,
                        actor=post.author,
                        post=post,
                        notif_type='repost',
                    )
                    snippet = (ancestor.text_content or '').strip()[:40]
                    async_to_sync(channel_layer.group_send)(
                        f"user_{ancestor.author_id}",
                        {
                            "type": "repost_notification",
                            "notification_id": notification.id,
                            # posts are anonymous unless signed: the quoter's
                            # handle goes out only with a signed quote
                            "actor_handle": post.author.handle if post.is_signed else None,
                            "post_id": str(post.id),
                            "snippet": snippet,
                        }
                    )
                    push.notify_quoted(ancestor.author, post, snippet)
                ancestor = ancestor.original_post if ancestor.is_repost else None
        except Exception as e:
            print(f"Failed to create repost notification: {e}")

        try:
            push.notify_new_post(post, exclude=told)
        except Exception as e:
            print(f"Failed to push new post: {e}")

    def validate_font_size(self, value):
        """Validate font size is within reasonable bounds.
        Sizes are in canvas pixels (1080-wide canvas), so scaled-up display
        text legitimately reaches several hundred px."""
        return min(max(value, limits.FONT_SIZE_MIN), limits.FONT_SIZE_MAX)
    
    def validate_text_color(self, value):
        """Validate color format"""
        # (int(x, 16) also takes '+12345' and ' 12345', which then failed
        # the render)
        if not isinstance(value, str) or not HEX_COLOR.match(value):
            raise serializers.ValidationError("Color must be in #RRGGBB format")
        return value
    
    def validate_background_color(self, value):
        """Validate background color format"""
        return self.validate_text_color(value)
    
    def validate(self, data):
        """Validate that either text content or background image is present"""
        from django.conf import settings

        # The drawn text is the post's text: summarise it from the elements
        # (the client's summary could say anything) and moderate that
        elements = data.get('text_elements')
        if elements:
            data['text_content'] = self.validate_text_content(
                ' '.join(e['content'] for e in elements if e['content'].strip()))
        text_content = data.get('text_content', '').strip()
        background_image = data.get('background_image')

        if not getattr(settings, 'ALLOW_IMAGE_POSTS', False):
            if background_image or data.get('sticker_elements'):
                raise serializers.ValidationError("Image posts are not enabled")
            if not text_content:
                raise serializers.ValidationError("Text content must be provided")
        elif not text_content and not background_image:
            raise serializers.ValidationError("Either text content or background image must be provided")

        return data
    

class PostListSerializer(serializers.ModelSerializer):
    """Lighter serializer for feed/list views"""
    author = serializers.SerializerMethodField()
    text_plan = serializers.SerializerMethodField()
    rendered_image_url = serializers.SerializerMethodField()
    response_image_url = serializers.SerializerMethodField()
    quote = serializers.SerializerMethodField()
    quote_chain = serializers.SerializerMethodField()
    repost_screenshot_url = serializers.SerializerMethodField()
    editable = serializers.SerializerMethodField()
    is_author = serializers.SerializerMethodField()
    liked = serializers.SerializerMethodField()
    # the feed hands its post to the post page, which draws over this
    textless_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'author', 'text_content', 'text_elements', 'sticker_elements', 'rendered_image_url',
            'created_at', 'view_count', 'is_repost', 'original_post',
            'is_signed', 'signature_style', 'background_color', 'background_gradient', 'font_choice',
            'response_image_url', 'response_top_y', 'response_bottom_y', 'quote', 'quote_chain',
            'repost_screenshot_url', 'image_width', 'image_height', 'top_y', 'bottom_y',
            'content_boxes', 'editable', 'textless_image_url', 'text_plan', 'is_author',
            'like_count', 'liked',
        ]

    def get_editable(self, obj):
        # author is select_related on the feed, so this costs no query
        return obj.canvas_state is not None and _is_author(obj, self.context)

    def get_liked(self, obj):
        return _is_liked(obj, self.context)

    def get_is_author(self, obj):
        return _is_author(obj, self.context)

    def get_author(self, obj):
        return author_for(obj)

    def get_text_plan(self, obj):
        return plan_for(obj)

    def get_quote_chain(self, obj):
        return quote_chain_for(obj, self.context)

    def get_textless_image_url(self, obj):
        return textless_url_for(obj, self.context)

    def get_response_image_url(self, obj):
        """Collapsed-repost render (response only, no quoted strip)"""
        if obj.response_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.response_image.url)
            return obj.response_image.url
        return None

    def get_quote(self, obj):
        """Quote chip data for collapsed reposts. hidden is per-viewer:
        true when the quoted author is blocked in either direction."""
        if not obj.is_repost or not obj.original_post_id:
            return None
        original = obj.original_post
        blocked_ids = self.context.get('blocked_author_ids') or set()
        if original.author_id in blocked_ids or is_withheld(original):
            return {'hidden': True}
        snippet = (original.text_content or '').strip()[:24]
        quote = {
            'hidden': False,
            'snippet': snippet,
            'background_color': original.background_color,
        }
        geometry = obj.repost_geometry
        if isinstance(geometry, dict) and geometry.get('width') and original.image_width:
            scale = geometry['width'] / original.image_width
            crop_top, crop_bottom = Post.quoted_crop(original, geometry)
            quote['geometry'] = {
                'x': geometry.get('x', 0),
                'y': geometry.get('y', 0),
                'width': geometry['width'],
                'height': int((crop_bottom - crop_top) * scale),
            }
        return quote
    
    def get_rendered_image_url(self, obj):
        """Get the full URL for the rendered image"""
        if obj.rendered_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.rendered_image.url)
            return obj.rendered_image.url
        return None
    
    def get_repost_screenshot_url(self, obj):
        """Get the full URL for the repost screenshot"""
        if obj.repost_screenshot:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.repost_screenshot.url)
            return obj.repost_screenshot.url
        return None


class PostReportSerializer(serializers.ModelSerializer):
    """Serializer for reporting posts"""
    
    class Meta:
        model = PostReport
        fields = ['post', 'reason', 'description']
    
    def validate(self, data):
        """Ensure user hasn't already reported this post"""
        reporter = self.context.get('reporter')
        if reporter and PostReport.objects.filter(reporter=reporter, post=data['post']).exists():
            raise serializers.ValidationError("You have already reported this post")
        return data


class UserReportSerializer(serializers.ModelSerializer):
    """Serializer for reporting users"""
    
    class Meta:
        model = UserReport
        fields = ['reported_user', 'reason', 'description']
    
    def validate(self, data):
        """Ensure user hasn't already reported this user"""
        reporter = self.context.get('reporter')
        if reporter and reporter == data['reported_user']:
            raise serializers.ValidationError("You cannot report yourself")
        if reporter and UserReport.objects.filter(
                reporter=reporter, reported_user=data['reported_user']).exists():
            raise serializers.ValidationError("You have already reported this user")
        return data


class MuteUserSerializer(serializers.ModelSerializer):
    """Serializer for muting users"""
    
    class Meta:
        model = MutedUser
        fields = ['muted_user']
    
    def validate(self, data):
        """Ensure user isn't trying to mute themselves"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if request.user == data['muted_user']:
                raise serializers.ValidationError("You cannot mute yourself")
        return data


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating anonymous users"""
    
    class Meta:
        model = User
        fields = ['device_id']
        # an account nothing identifies could never be used again: every
        # call without a device id used to add one
        extra_kwargs = {'device_id': {'required': True, 'allow_null': False, 'allow_blank': False}}
        
    def create(self, validated_data):
        """Create a new anonymous user with auto-generated handle"""
        user = User.objects.create(
            device_id=validated_data.get('device_id'),
            is_anonymous_mode=True
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile information"""
    total_posts = serializers.SerializerMethodField()

    def get_total_posts(self, obj):
        return obj.posts.filter(is_hidden=False).count()

    preferred_signature_style = serializers.ChoiceField(
        choices=[(key, key) for key in Post.SIGNATURE_STYLES.keys()],
        required=False
    )
    
    class Meta:
        model = User
        fields = [
            'handle', 'avatar_color', 'is_anonymous_mode',
            'date_joined', 'posts_count_today', 'total_posts',
            'default_signed_posts', 'preferred_signature_style',
            'signature_font', 'signature_color',
            'push_token', 'notify_replies', 'notify_all_posts',
        ]
        read_only_fields = ['date_joined', 'posts_count_today', 'total_posts']
        extra_kwargs = {'push_token': {'write_only': True}}

    def validate_push_token(self, value):
        import re
        value = (value or '').strip()
        if value and not re.fullmatch(r'Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,150}\]', value):
            raise serializers.ValidationError('Not a push token.')
        return value


    def validate_handle(self, value):
        import re
        value = (value or '').strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,29}', value):
            raise serializers.ValidationError(
                'Handles are 3-30 characters: lowercase letters, numbers, hyphens'
            )
        existing = User.objects.filter(handle=value)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('That handle is taken')
        return value

    def validate_signature_font(self, value):
        valid = {key for key, _label in Post.FONT_CHOICES}
        if value not in valid:
            raise serializers.ValidationError('Invalid font')
        return value

    @staticmethod
    def _hex_color(value):
        import re
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', value or ''):
            raise serializers.ValidationError('Color must be in #RRGGBB format')
        return value.upper()

    def validate_signature_color(self, value):
        return self._hex_color(value) if value else value

    # The profile square's colour, chosen by its owner
    def validate_avatar_color(self, value):
        return self._hex_color(value)

    def validate_preferred_signature_style(self, value):
        value = (value or '').lower()
        if value not in Post.SIGNATURE_STYLES:
            raise serializers.ValidationError('Invalid signature style')
        return value

    def update(self, instance, validated_data):
        style = validated_data.get('preferred_signature_style')
        if style:
            validated_data['preferred_signature_style'] = style.lower()
        token = validated_data.get('push_token')
        if token:
            # one phone, one account: a reinstall makes a new account with
            # the same token, and the old one must stop ringing this phone
            User.objects.filter(push_token=token).exclude(pk=instance.pk).update(push_token='')
        return super().update(instance, validated_data)
