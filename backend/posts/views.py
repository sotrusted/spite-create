from rest_framework import generics, status, permissions, exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from .throttles import RealIPThrottle, DeviceThrottle, PostCreateThrottle, PostCreateIPThrottle
from django.db import IntegrityError, transaction
from django.db.models import Q, Prefetch, F
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import JsonResponse
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import uuid
import os
import time
from django.core.cache import cache
from .models import Post, PostReport
from .serializers import (
    PostSerializer, PostListSerializer, PostReportSerializer,
    UserReportSerializer, MuteUserSerializer, UserCreateSerializer,
    UserProfileSerializer
)
from users.models import BlockedUser, MutedUser, UserReport
import json

User = get_user_model()
channel_layer = get_channel_layer()


class FeedPagination(CursorPagination):
    """Custom pagination for feed with larger page size"""
    page_size = 20
    ordering = '-created_at'
    cursor_query_param = 'cursor'
    page_size_query_param = 'page_size'
    max_page_size = 50


class PostCreateView(generics.CreateAPIView):
    """Create new posts"""
    serializer_class = PostSerializer
    permission_classes = [permissions.AllowAny]  # Anonymous posting allowed
    throttle_classes = [PostCreateThrottle, PostCreateIPThrottle]

    # The app sends one Idempotency-Key per post and the same one on Retry. A
    # retry of a post the server already made (it timed out on the phone but
    # went through) gets that post back instead of becoming a second one; a
    # retry arriving while the first is still rendering waits for it.
    IDEMPOTENCY_TTL = 24 * 3600
    IDEMPOTENCY_WAIT = 20  # seconds

    def create(self, request, *args, **kwargs):
        key = request.headers.get('Idempotency-Key', '')
        if not 0 < len(key) <= 64:
            return super().create(request, *args, **kwargs)
        self._client_key = key
        user = self.get_or_create_user()
        slot = f'post-idem:{user.pk}:{key}'
        deadline = time.monotonic() + self.IDEMPOTENCY_WAIT
        while not cache.add(slot, 'pending', 2 * self.IDEMPOTENCY_WAIT):
            held = cache.get(slot)
            if held and held != 'pending':
                post = Post.objects.filter(pk=held, author=user).first()
                if post:
                    return Response(PostSerializer(post, context=self.get_serializer_context()).data,
                                    status=status.HTTP_201_CREATED)
                cache.delete(slot)  # deleted since: post it again
                continue
            if time.monotonic() > deadline:
                return Response({'detail': 'Still posting - try again in a moment'},
                                status=status.HTTP_409_CONFLICT)
            time.sleep(0.25)
        try:
            response = super().create(request, *args, **kwargs)
        except Exception:
            cache.delete(slot)
            raise
        if response.status_code == status.HTTP_201_CREATED and response.data.get('id'):
            cache.set(slot, str(response.data['id']), self.IDEMPOTENCY_TTL)
        else:
            cache.delete(slot)
        return response

    def perform_create(self, serializer):
        """Save post with author and send realtime notification"""
        # Get or create anonymous user
        user = self.get_or_create_user()
        
        # perform_create's return value is ignored by DRF, so a refusal has
        # to be raised - returning a Response here used to fall through to a
        # 201 for a post that was never saved
        if not user.can_post():
            raise exceptions.PermissionDenied('You are temporarily restricted from posting')

        # Save the post. The serializer broadcasts the new post over the
        # WebSocket with full crop geometry, so no second notification here.
        serializer.save(author=user)

        user.last_post_time = timezone.now()
        user.save(update_fields=['last_post_time'])

    def get_or_create_user(self):
        return get_or_create_user_from_request(self.request)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['client_key'] = getattr(self, '_client_key', None)
        return context


class FeedListView(generics.ListAPIView):
    """Get paginated feed of posts"""
    serializer_class = PostListSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = FeedPagination
    throttle_classes = [RealIPThrottle, DeviceThrottle]
    
    def get_queryset(self):
        """Get posts excluding muted users and hidden posts"""
        queryset = Post.objects.filter(is_hidden=False).select_related('author')
        
        # Exclude posts from shadowbanned users
        queryset = queryset.exclude(author__is_shadowbanned=True)
        
        # Exclude muted authors and blocked authors (both directions)
        user = self.get_user_from_request()
        if user:
            muted_user_ids = MutedUser.objects.filter(
                user=user
            ).values_list('muted_user_id', flat=True)
            if muted_user_ids:
                queryset = queryset.exclude(author_id__in=muted_user_ids)

            blocked_ids = self.get_blocked_author_ids(user)
            if blocked_ids:
                queryset = queryset.exclude(author_id__in=blocked_ids)

        return queryset.select_related('original_post__author')

    def get_blocked_author_ids(self, user):
        """Users blocked by the viewer plus users who blocked the viewer.
        Computed once per request: the queryset and the serializer both need it."""
        if not hasattr(self, '_blocked_ids'):
            if user is None:
                self._blocked_ids = set()
            else:
                pairs = BlockedUser.objects.filter(
                    Q(user=user) | Q(blocked_user=user)
                ).values_list('user_id', 'blocked_user_id')
                self._blocked_ids = {
                    other for pair in pairs for other in pair if other != user.id
                }
        return self._blocked_ids

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.filter_queryset(self.get_queryset()))
        self._ancestors = self.fetch_ancestors(page or [])
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @staticmethod
    def fetch_ancestors(posts, max_depth=6):
        """Every post quoted, at any depth, by the posts on this page - one
        query per LEVEL rather than per ancestor per post, so a page of deep
        quote chains costs at most max_depth queries."""
        ancestors = {}
        frontier = {p.original_post_id for p in posts if p.is_repost and p.original_post_id}
        for _ in range(max_depth):
            frontier -= ancestors.keys()
            if not frontier:
                break
            # (with their authors: the chain asks whether each is banned)
            fetched = list(Post.objects.filter(id__in=frontier).select_related('author'))
            ancestors.update((a.id, a) for a in fetched)
            frontier = {a.original_post_id for a in fetched if a.is_repost and a.original_post_id}
        return ancestors

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['blocked_author_ids'] = self.get_blocked_author_ids(self.get_user_from_request())
        context['ancestors'] = getattr(self, '_ancestors', {})
        return context

    def get_user_from_request(self):
        """The viewer, looked up (never created) once per request."""
        if not hasattr(self, '_viewer'):
            device_id = self.request.META.get('HTTP_X_DEVICE_ID')
            self._viewer = User.objects.filter(device_id=device_id).first() if device_id else None
        return self._viewer


class PostDetailView(generics.RetrieveAPIView):
    """Get individual post details"""
    serializer_class = PostSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'id'
    
    def get_queryset(self):
        """Get posts excluding hidden ones"""
        return Post.objects.filter(
            is_hidden=False
        ).select_related('author')
    
    def retrieve(self, request, *args, **kwargs):
        post = self.get_object()
        # Atomic in the database: a read-modify-write lost counts whenever two
        # people opened the same post at once
        Post.objects.filter(pk=post.pk).update(view_count=F('view_count') + 1)
        post.view_count += 1
        return Response(self.get_serializer(post).data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def report_post(request, post_id):
    """Report a post for moderation"""
    try:
        post = Post.objects.get(id=post_id, is_hidden=False)
    except Post.DoesNotExist:
        return Response({'error': 'Post not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get or create user
    user = get_or_create_user_from_request(request)
    
    # (the post reported is the URL's: a "post" in the body used to win)
    serializer = PostReportSerializer(
        data={**_body(request), 'post': post.id},
        context={'request': request, 'reporter': user}
    )

    if serializer.is_valid():
        try:
            with transaction.atomic():
                serializer.save(reporter=user)
        except IntegrityError:  # the same report, twice at once
            return Response({'message': 'Report submitted successfully'})
        
        # Check if post should be auto-flagged
        report_count = PostReport.objects.filter(post=post).count()
        if report_count >= 3:  # Auto-flag after 3 reports
            post.is_flagged = True
            post.save()
        
        return Response({'message': 'Report submitted successfully'})
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def report_user(request, user_handle):
    """Report a user for moderation"""
    reported_user = user_from_handle(user_handle)
    if reported_user is None:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create user
    user = get_or_create_user_from_request(request)

    serializer = UserReportSerializer(
        data={**_body(request), 'reported_user': reported_user.id},
        context={'request': request, 'reporter': user}
    )

    if serializer.is_valid():
        try:
            with transaction.atomic():
                serializer.save(reporter=user)
        except IntegrityError:  # the same report, twice at once
            return Response({'message': 'User reported successfully'})

        # Increment user's report count
        reported_user.increment_report_count()
        
        return Response({'message': 'User reported successfully'})
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def mute_user(request, user_handle):
    """Mute a user to hide their posts"""
    muted_user = user_from_handle(user_handle)
    if muted_user is None:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get or create user
    user = get_or_create_user_from_request(request)
    if user == muted_user:
        return Response({'error': 'You cannot mute yourself'}, status=status.HTTP_400_BAD_REQUEST)

    # Create mute relationship
    mute, created = MutedUser.objects.get_or_create(
        user=user,
        muted_user=muted_user
    )
    
    if created:
        return Response({'message': f'User {user_handle} has been muted'})
    else:
        return Response({'message': f'User {user_handle} is already muted'})


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def block_user(request, user_handle):
    """Block a user: hides posts in both directions and hides quoted strips"""
    blocked_user = user_from_handle(user_handle)
    if blocked_user is None:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    user = get_or_create_user_from_request(request)
    if user == blocked_user:
        return Response({'error': 'You cannot block yourself'}, status=status.HTTP_400_BAD_REQUEST)

    _, created = BlockedUser.objects.get_or_create(user=user, blocked_user=blocked_user)
    if created:
        return Response({'message': f'User {user_handle} has been blocked'})
    return Response({'message': f'User {user_handle} is already blocked'})


@api_view(['DELETE'])
@permission_classes([permissions.AllowAny])
def unblock_user(request, user_handle):
    """Unblock a user"""
    blocked_user = user_from_handle(user_handle)
    if blocked_user is None:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    user = get_or_create_user_from_request(request)
    deleted_count, _ = BlockedUser.objects.filter(user=user, blocked_user=blocked_user).delete()
    if deleted_count > 0:
        return Response({'message': f'User {user_handle} has been unblocked'})
    return Response({'message': f'User {user_handle} was not blocked'})


@api_view(['DELETE'])
@permission_classes([permissions.AllowAny])
def unmute_user(request, user_handle):
    """Unmute a user"""
    muted_user = user_from_handle(user_handle)
    if muted_user is None:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get or create user
    user = get_or_create_user_from_request(request)
    
    # Remove mute relationship
    deleted_count, _ = MutedUser.objects.filter(
        user=user,
        muted_user=muted_user
    ).delete()
    
    if deleted_count > 0:
        return Response({'message': f'User {user_handle} has been unmuted'})
    else:
        return Response({'message': f'User {user_handle} was not muted'})


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def create_user(request):
    """Create a new anonymous user"""
    serializer = UserCreateSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        profile_serializer = UserProfileSerializer(user)
        return Response(profile_serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH'])
@permission_classes([permissions.AllowAny])
def user_profile(request):
    """Get current user profile"""
    user = get_or_create_user_from_request(request)
    if request.method == 'GET':
        serializer = UserProfileSerializer(user)
        return Response(serializer.data)

    serializer = UserProfileSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


DEVICE_ID_MAX = User._meta.get_field('device_id').max_length


def _body(request):
    """The request's JSON body as a dict (anything else is no fields)."""
    return dict(request.data.items()) if hasattr(request.data, 'items') else {}


def user_from_handle(handle):
    """The user a handle names, or None. An unsigned post shows an alias in
    place of its author's handle (serializers.author_alias): that names the
    post's author, without saying who they are."""
    from .serializers import ALIAS_PREFIX
    if handle.startswith(ALIAS_PREFIX):
        try:
            post = Post.objects.select_related('author').get(id=uuid.UUID(handle[len(ALIAS_PREFIX):]))
        except (ValueError, Post.DoesNotExist):
            return None
        return post.author
    return User.objects.filter(handle=handle).first()


def get_or_create_user_from_request(request):
    """The user behind the request's X-Device-Id, created on first sight.

    Every client sends a device id. A request without one is refused: minting
    a fresh anonymous user for it (the old behaviour) grew the users table by
    a row per call and gave the caller an identity nothing could ever reuse.
    get_or_create already retries the lookup if two first requests race on
    the unique device_id.
    """
    device_id = request.META.get('HTTP_X_DEVICE_ID')
    if not device_id:
        raise exceptions.ValidationError({'detail': 'X-Device-Id header required'})
    # (longer than the column, Postgres refuses the insert: a 500)
    if len(device_id) > DEVICE_ID_MAX or '\x00' in device_id:
        raise exceptions.ValidationError({'detail': 'X-Device-Id is not valid'})
    user, _ = User.objects.get_or_create(
        device_id=device_id,
        defaults={'is_anonymous_mode': True},
    )
    return user


@api_view(['DELETE'])
@permission_classes([permissions.AllowAny])
def delete_account(request):
    """Delete the requesting device's account and everything it made.
    Idempotent: a device with no account gets the same 204."""
    from .account import delete_account as run_deletion
    device_id = request.META.get('HTTP_X_DEVICE_ID')
    if not device_id:
        raise exceptions.ValidationError({'detail': 'X-Device-Id header required'})
    user = User.objects.filter(device_id=device_id).first()
    if user is not None:
        run_deletion(user)
    return Response(status=status.HTTP_204_NO_CONTENT)


UPLOAD_FORMATS = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif'}


def _store_upload(request, folder, formats, max_bytes):
    """Check an uploaded image and store it. The file is what Pillow says it
    is, never what the request claims: the name's extension and the content
    type used to be trusted, so anything (an .html page, say) could be put
    on the media domain. Stored as <folder>/<uuid>.<ext>, the only names the
    renderer will open (Post._open_media_image)."""
    from django.conf import settings
    from PIL import Image
    if not getattr(settings, 'ALLOW_IMAGE_POSTS', False):
        return Response({'error': 'Image uploads are disabled'}, status=status.HTTP_403_FORBIDDEN)
    image_file = request.FILES.get('image')
    if image_file is None:
        return Response({'error': 'No image file provided'}, status=status.HTTP_400_BAD_REQUEST)
    if image_file.size > max_bytes:
        return Response({'error': f'File too large (max {max_bytes // (1024 * 1024)}MB)'},
                        status=status.HTTP_400_BAD_REQUEST)
    data = image_file.read()
    try:
        import io
        with Image.open(io.BytesIO(data)) as probe:
            image_format = probe.format
            probe.verify()
    except Exception:
        image_format = None
    if image_format not in formats:
        return Response({'error': 'Invalid file type'}, status=status.HTTP_400_BAD_REQUEST)
    filename = f"{folder}/{uuid.uuid4()}.{UPLOAD_FORMATS[image_format]}"
    file_path = default_storage.save(filename, ContentFile(data))
    return Response({'url': default_storage.url(file_path), 'filename': filename})


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def upload_background(request):
    """Upload a background image and return the URL"""
    return _store_upload(request, 'backgrounds', ('JPEG', 'PNG', 'WEBP'), 10 * 1024 * 1024)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def upload_sticker(request):
    """Upload a sticker image and return the URL"""
    return _store_upload(request, 'stickers', ('JPEG', 'PNG', 'WEBP', 'GIF'), 5 * 1024 * 1024)


@api_view(['GET'])
def notifications_list(request):
    """Unread notifications for the requesting device's user (MVP: reposts).
    ?all=1 returns the latest 50 regardless of read state."""
    from .models import Notification
    device_id = request.META.get('HTTP_X_DEVICE_ID')
    user = User.objects.filter(device_id=device_id).first() if device_id else None
    if user is None:
        return Response({'results': [], 'unread_count': 0})
    qs = Notification.objects.filter(recipient=user).select_related('actor', 'post__original_post')
    if not request.GET.get('all'):
        qs = qs.filter(is_read=False)
    items = [
        {
            'id': n.id,
            'type': n.notif_type,
            # anonymous unless the quoting post is signed
            'actor_handle': n.actor.handle if n.post.is_signed else None,
            'post_id': str(n.post_id),
            'snippet': (n.post.original_post.text_content or '').strip()[:40] if n.post.original_post else '',
            'created_at': n.created_at.isoformat(),
            'is_read': n.is_read,
        }
        for n in qs[:50]
    ]
    return Response({'results': items, 'unread_count': qs.filter(is_read=False).count()})


@api_view(['POST'])
def notifications_mark_read(request):
    """Mark all of this user's notifications read."""
    from .models import Notification
    user = get_or_create_user_from_request(request)
    updated = Notification.objects.filter(recipient=user, is_read=False).update(is_read=True)
    return Response({'marked_read': updated})
