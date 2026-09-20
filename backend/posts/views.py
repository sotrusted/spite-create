from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from django.db.models import Q, Prefetch
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import JsonResponse
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import uuid
import os
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


class PostCreateThrottle(UserRateThrottle):
    """Custom throttle for post creation"""
    scope = 'post_create'


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
    throttle_classes = [PostCreateThrottle]
    
    def perform_create(self, serializer):
        """Save post with author and send realtime notification"""
        # Get or create anonymous user
        user = self.get_or_create_user()
        
        # Check if user can post
        if not user.can_post():
            return Response(
                {'error': 'You are temporarily restricted from posting'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        
        # Save the post. The serializer broadcasts the new post over the
        # WebSocket with full crop geometry, so no second notification here.
        post = serializer.save(author=user)

        # Update user's last post time
        user.last_post_time = timezone.now()
        user.save()
    
    def get_or_create_user(self):
        """Get or create anonymous user based on device ID"""
        device_id = self.request.META.get('HTTP_X_DEVICE_ID')
        
        if device_id:
            user, created = User.objects.get_or_create(
                device_id=device_id,
                defaults={'is_anonymous_mode': True}
            )
            return user
        else:
            # Create completely anonymous user
            return User.objects.create(
                is_anonymous_mode=True
            )
    

class FeedListView(generics.ListAPIView):
    """Get paginated feed of posts"""
    serializer_class = PostListSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = FeedPagination
    throttle_classes = [AnonRateThrottle, UserRateThrottle]
    
    def get_queryset(self):
        """Get posts excluding muted users and hidden posts"""
        queryset = Post.objects.filter(
            is_hidden=False
        ).select_related('author').prefetch_related(
            'reports'
        )
        
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
        """Users blocked by the viewer plus users who blocked the viewer."""
        blocked = set(BlockedUser.objects.filter(user=user).values_list('blocked_user_id', flat=True))
        blocked |= set(BlockedUser.objects.filter(blocked_user=user).values_list('user_id', flat=True))
        return blocked

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = self.get_user_from_request()
        context['blocked_author_ids'] = self.get_blocked_author_ids(user) if user else set()
        return context
    
    def get_user_from_request(self):
        """Get user from device ID or authentication"""
        device_id = self.request.META.get('HTTP_X_DEVICE_ID')
        if device_id:
            try:
                return User.objects.get(device_id=device_id)
            except User.DoesNotExist:
                pass
        return None


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
        """Increment view count when post is viewed"""
        response = super().retrieve(request, *args, **kwargs)
        
        # Increment view count
        post = self.get_object()
        post.view_count += 1
        post.save(update_fields=['view_count'])
        
        return response


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
    
    serializer = PostReportSerializer(
        data={'post': post.id, **request.data},
        context={'request': request}
    )
    
    if serializer.is_valid():
        report = serializer.save(reporter=user)
        
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
    try:
        reported_user = User.objects.get(handle=user_handle)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get or create user
    user = get_or_create_user_from_request(request)
    
    serializer = UserReportSerializer(
        data={'reported_user': reported_user.id, **request.data},
        context={'request': request}
    )
    
    if serializer.is_valid():
        report = serializer.save(reporter=user)
        
        # Increment user's report count
        reported_user.increment_report_count()
        
        return Response({'message': 'User reported successfully'})
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def mute_user(request, user_handle):
    """Mute a user to hide their posts"""
    try:
        muted_user = User.objects.get(handle=user_handle)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Get or create user
    user = get_or_create_user_from_request(request)
    
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
    try:
        blocked_user = User.objects.get(handle=user_handle)
    except User.DoesNotExist:
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
    try:
        blocked_user = User.objects.get(handle=user_handle)
    except User.DoesNotExist:
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
    try:
        muted_user = User.objects.get(handle=user_handle)
    except User.DoesNotExist:
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


def get_or_create_user_from_request(request):
    """Helper function to get or create user from request"""
    device_id = request.META.get('HTTP_X_DEVICE_ID')
    
    if device_id:
        user, created = User.objects.get_or_create(
            device_id=device_id,
            defaults={'is_anonymous_mode': True}
        )
        return user
    else:
        # Create completely anonymous user; handle is auto-generated in save()
        return User.objects.create(
            is_anonymous_mode=True
        )


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def upload_background(request):
    """Upload a background image and return the URL"""
    from django.conf import settings
    if not getattr(settings, 'ALLOW_IMAGE_POSTS', False):
        return JsonResponse({'error': 'Image uploads are disabled'}, status=403)
    try:
        if 'image' not in request.FILES:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        
        image_file = request.FILES['image']
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if image_file.content_type not in allowed_types:
            return JsonResponse({'error': 'Invalid file type'}, status=400)
        
        # Validate file size (max 10MB for backgrounds)
        if image_file.size > 10 * 1024 * 1024:
            return JsonResponse({'error': 'File too large (max 10MB)'}, status=400)
        
        # Generate unique filename
        file_extension = os.path.splitext(image_file.name)[1]
        filename = f"backgrounds/{uuid.uuid4()}{file_extension}"
        
        # Save the file
        file_path = default_storage.save(filename, ContentFile(image_file.read()))
        file_url = default_storage.url(file_path)
        
        return JsonResponse({
            'url': file_url,
            'filename': filename
        })
        
    except Exception as e:
        print(f"Error uploading background image: {e}")
        return JsonResponse({'error': 'Failed to upload image'}, status=500)

def upload_sticker(request):
    """Upload a sticker image and return the URL"""
    from django.conf import settings
    if not getattr(settings, 'ALLOW_IMAGE_POSTS', False):
        return JsonResponse({'error': 'Image uploads are disabled'}, status=403)
    try:
        if 'image' not in request.FILES:
            return JsonResponse({'error': 'No image file provided'}, status=400)
        
        image_file = request.FILES['image']
        
        # Validate file type
        allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if image_file.content_type not in allowed_types:
            return JsonResponse({'error': 'Invalid file type'}, status=400)
        
        # Validate file size (max 5MB)
        if image_file.size > 5 * 1024 * 1024:
            return JsonResponse({'error': 'File too large (max 5MB)'}, status=400)
        
        # Generate unique filename
        file_extension = os.path.splitext(image_file.name)[1]
        filename = f"stickers/{uuid.uuid4()}{file_extension}"
        
        # Save the file
        file_path = default_storage.save(filename, ContentFile(image_file.read()))
        file_url = default_storage.url(file_path)
        
        return JsonResponse({
            'url': file_url,
            'filename': filename
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@api_view(['GET'])
def notifications_list(request):
    """Unread notifications for the requesting device's user (MVP: reposts).
    ?all=1 returns the latest 50 regardless of read state."""
    from .models import Notification
    user = get_or_create_user_from_request(request)
    qs = Notification.objects.filter(recipient=user).select_related('actor', 'post')
    if not request.GET.get('all'):
        qs = qs.filter(is_read=False)
    items = [
        {
            'id': n.id,
            'type': n.notif_type,
            'actor_handle': n.actor.handle,
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
