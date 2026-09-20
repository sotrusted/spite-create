from rest_framework import serializers
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Post, PostReport
from users.models import User, UserReport, MutedUser


class AuthorSerializer(serializers.ModelSerializer):
    """Serializer for post author information"""
    class Meta:
        model = User
        fields = ['handle', 'avatar_color']


class PostSerializer(serializers.ModelSerializer):
    """Serializer for Post model with full create/read capabilities"""
    author = AuthorSerializer(read_only=True)
    rendered_image_url = serializers.SerializerMethodField()
    repost_data = serializers.JSONField(write_only=True, required=False)
    original_post = serializers.PrimaryKeyRelatedField(read_only=True)
    repost_screenshot_url = serializers.SerializerMethodField()
    canvas_width = serializers.IntegerField(write_only=True, required=False)
    canvas_height = serializers.IntegerField(write_only=True, required=False)
    
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
            'image_width', 'image_height', 'top_y', 'bottom_y'
        ]
        read_only_fields = ['id', 'author', 'rendered_image_url', 'created_at', 'view_count', 
                           'is_repost', 'original_post', 'repost_screenshot_url',
                           'image_width', 'image_height', 'top_y', 'bottom_y']
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
    
    def get_repost_screenshot_url(self, obj):
        """Get the full URL for the repost screenshot"""
        if obj.repost_screenshot:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.repost_screenshot.url)
            return obj.repost_screenshot.url
        return None
    
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
            original_post_id = repost_data.get('original_post_id')
            if original_post_id:
                try:
                    validated_data['original_post'] = Post.objects.get(id=original_post_id)
                except Post.DoesNotExist:
                    pass
            # WYSIWYG strip placement from the composer (canvas px)
            geometry = repost_data.get('repost_geometry')
            if isinstance(geometry, dict) and geometry.get('width'):
                validated_data['repost_geometry'] = {
                    'x': int(geometry.get('x', 0)),
                    'y': int(geometry.get('y', 0)),
                    'width': int(geometry['width']),
                }

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
            provided_is_signed = bool(self.initial_data.get('is_signed'))

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
        """Validate text content length and content"""
        from django.conf import settings
        from .models import _sanitize_glyphs
        value = _sanitize_glyphs(value)
        
        max_length = getattr(settings, 'MAX_POST_LENGTH', 500)
        if len(value) > max_length:
            raise serializers.ValidationError(f"Text content cannot exceed {max_length} characters")
        
        # Allow empty text content (will be validated in validate() method)
        if value.strip():
            # Basic profanity filter (in production, use a more sophisticated system)
            banned_words = self._get_banned_words()
            text_lower = value.lower()
            for word in banned_words:
                if word in text_lower:
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
                    'author': {
                        'handle': post.author.handle,
                        'avatar_color': post.author.avatar_color,
                    },
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

        # Repost notification for the quoted author: stored for the next
        # app open, plus a live nudge to their personal WS group
        try:
            original = post.original_post if post.is_repost else None
            if original and original.author_id != post.author_id:
                from .models import Notification
                notification = Notification.objects.create(
                    recipient=original.author,
                    actor=post.author,
                    post=post,
                    notif_type='repost',
                )
                async_to_sync(channel_layer.group_send)(
                    f"user_{original.author_id}",
                    {
                        "type": "repost_notification",
                        "notification_id": notification.id,
                        "actor_handle": post.author.handle,
                        "post_id": str(post.id),
                        "snippet": (original.text_content or '').strip()[:40],
                    }
                )
        except Exception as e:
            print(f"Failed to create repost notification: {e}")
    
    def validate_font_size(self, value):
        """Validate font size is within reasonable bounds.
        Sizes are in canvas pixels (1080-wide canvas), so scaled-up display
        text legitimately reaches several hundred px."""
        if value < 8 or value > 1000:
            raise serializers.ValidationError("Font size must be between 8 and 1000 canvas pixels")
        return value
    
    def validate_text_color(self, value):
        """Validate color format"""
        if not value.startswith('#') or len(value) != 7:
            raise serializers.ValidationError("Color must be in #RRGGBB format")
        try:
            int(value[1:], 16)
        except ValueError:
            raise serializers.ValidationError("Invalid color format")
        return value
    
    def validate_background_color(self, value):
        """Validate background color format"""
        return self.validate_text_color(value)
    
    def validate(self, data):
        """Validate that either text content or background image is present"""
        from django.conf import settings

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
    
    def _get_banned_words(self):
        """Get list of banned words (simplified version)"""
        # In production, load from file or database
        return ['spam', 'test_banned_word']  # Minimal list for demo


class PostListSerializer(serializers.ModelSerializer):
    """Lighter serializer for feed/list views"""
    author = AuthorSerializer(read_only=True)
    rendered_image_url = serializers.SerializerMethodField()
    response_image_url = serializers.SerializerMethodField()
    quote = serializers.SerializerMethodField()
    quote_chain = serializers.SerializerMethodField()
    repost_screenshot_url = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'author', 'text_content', 'text_elements', 'sticker_elements', 'rendered_image_url',
            'created_at', 'view_count', 'is_repost', 'original_post',
            'is_signed', 'signature_style', 'background_color', 'font_choice',
            'response_image_url', 'response_top_y', 'response_bottom_y', 'quote', 'quote_chain',
            'repost_screenshot_url', 'image_width', 'image_height', 'top_y', 'bottom_y'
        ]

    def get_quote_chain(self, obj):
        """Every quoted ancestor with its strip rect mapped into THIS post's
        canvas coordinates, enabling per-level collapse in the feed.
        Level i entry: where ancestor i's strip sits (rect, root canvas px),
        what to draw when levels >= i collapse (the ancestor's reply-only
        strip source), and the chip content for hiding level i."""
        if not obj.is_repost or not obj.original_post_id:
            return []
        blocked_ids = self.context.get('blocked_author_ids') or set()
        request = self.context.get('request')

        def url_of(image):
            if not image:
                return None
            return request.build_absolute_uri(image.url) if request else image.url

        chain = []
        current = obj
        # Cumulative transform from current level's canvas into root canvas
        offset_x, offset_y, scale = 0.0, 0.0, 1.0
        for _depth in range(6):
            if not current.is_repost or not current.original_post_id:
                break
            geometry = current.repost_geometry
            parent = current.original_post
            if not (isinstance(geometry, dict) and geometry.get('width')):
                break
            parent_width = parent.image_width or 1080
            crop_top = parent.top_y or 0
            crop_bottom = parent.bottom_y or (parent.image_height or 0)
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
                'snippet': (parent.text_content or '').strip()[:24],
                'background_color': parent.background_color,
                'hidden': parent.author_id in blocked_ids,
            })

            # Descend: next level's coordinates live inside this strip,
            # which shows parent cropped from its top_y
            offset_x = rect['x']
            offset_y = rect['y'] - crop_top * level_scale * scale
            scale = scale * level_scale
            current = parent
        return chain

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
        if original.author_id in blocked_ids:
            return {'hidden': True}
        snippet = (original.text_content or '').strip()[:24]
        quote = {
            'hidden': False,
            'snippet': snippet,
            'background_color': original.background_color,
        }
        geometry = obj.repost_geometry
        if (
            isinstance(geometry, dict) and geometry.get('width')
            and original.top_y is not None and original.bottom_y is not None
            and original.image_width
        ):
            scale = geometry['width'] / original.image_width
            quote['geometry'] = {
                'x': geometry.get('x', 0),
                'y': geometry.get('y', 0),
                'width': geometry['width'],
                'height': int((original.bottom_y - original.top_y) * scale),
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
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if PostReport.objects.filter(
                reporter=request.user,
                post=data['post']
            ).exists():
                raise serializers.ValidationError("You have already reported this post")
        return data


class UserReportSerializer(serializers.ModelSerializer):
    """Serializer for reporting users"""
    
    class Meta:
        model = UserReport
        fields = ['reported_user', 'reason', 'description']
    
    def validate(self, data):
        """Ensure user hasn't already reported this user"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if UserReport.objects.filter(
                reporter=request.user,
                reported_user=data['reported_user']
            ).exists():
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
        
    def create(self, validated_data):
        """Create a new anonymous user with auto-generated handle"""
        user = User.objects.create(
            device_id=validated_data.get('device_id'),
            is_anonymous_mode=True
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile information"""
    preferred_signature_style = serializers.ChoiceField(
        choices=[(key, key) for key in Post.SIGNATURE_STYLES.keys()],
        required=False
    )
    
    class Meta:
        model = User
        fields = [
            'handle', 'avatar_color', 'is_anonymous_mode',
            'date_joined', 'posts_count_today',
            'default_signed_posts', 'preferred_signature_style',
            'signature_font', 'signature_color',
        ]
        read_only_fields = ['date_joined', 'posts_count_today']

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

    def validate_signature_color(self, value):
        if not value:
            return value
        if not value.startswith('#') or len(value) != 7:
            raise serializers.ValidationError('Color must be in #RRGGBB format')
        try:
            int(value[1:], 16)
        except ValueError:
            raise serializers.ValidationError('Invalid color format')
        return value

    def validate_preferred_signature_style(self, value):
        value = (value or '').lower()
        if value not in Post.SIGNATURE_STYLES:
            raise serializers.ValidationError('Invalid signature style')
        return value

    def update(self, instance, validated_data):
        style = validated_data.get('preferred_signature_style')
        if style:
            validated_data['preferred_signature_style'] = style.lower()
        return super().update(instance, validated_data)
