import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from .models import Post
from users.models import User


class FeedConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for realtime feed updates.
    Handles new post notifications and feed synchronization.
    """

    async def connect(self):
        """Accept the WebSocket connection and add to feed group"""
        self.group_name = "feed_updates"
        self.user_group = None

        # Join the feed group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        # Personal group for targeted notifications: the client identifies
        # itself with ?device=<X-Device-ID value> (same id REST auth uses)
        device_id = None
        try:
            from urllib.parse import parse_qs
            query = parse_qs(self.scope.get('query_string', b'').decode())
            device_id = (query.get('device') or [None])[0]
        except Exception:
            pass
        if device_id:
            user_id = await self.get_user_id(device_id)
            if user_id:
                self.user_group = f"user_{user_id}"
                await self.channel_layer.group_add(self.user_group, self.channel_name)

        await self.accept()
        
        # Send welcome message
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to the Typing Magazine feed'
        }))

    async def disconnect(self, close_code):
        """Leave the feed group when disconnecting"""
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
        if getattr(self, 'user_group', None):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive(self, text_data):
        """Handle messages from WebSocket"""
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            if message_type == 'ping':
                # Respond to ping with pong
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': text_data_json.get('timestamp')
                }))
            elif message_type == 'join_feed':
                # User wants to join the feed updates
                await self.send(text_data=json.dumps({
                    'type': 'feed_joined',
                    'message': 'Successfully joined feed updates'
                }))
            
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid JSON format'
            }))

    async def new_post(self, event):
        """Send new post notification to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'new_post',
            'post': event['post_data'],
            'count': event.get('count', 1)
        }))

    async def repost_notification(self, event):
        """Someone reposted one of this user's posts"""
        await self.send(text_data=json.dumps({
            'type': 'repost_notification',
            'notification_id': event['notification_id'],
            'actor_handle': event['actor_handle'],
            'post_id': event['post_id'],
            'snippet': event.get('snippet', ''),
        }))

    async def post_updated(self, event):
        """Send post update notification to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'post_updated',
            'post_id': event['post_id'],
            'changes': event['changes']
        }))

    async def post_removed(self, event):
        """Send post removal notification to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'post_removed',
            'post_id': event['post_id'],
            'reason': event.get('reason', 'moderated')
        }))

    async def user_banned(self, event):
        """Notify about user ban (affects their posts visibility)"""
        await self.send(text_data=json.dumps({
            'type': 'user_banned',
            'user_handle': event['user_handle'],
            'post_ids': event.get('post_ids', [])
        }))

    @database_sync_to_async
    def get_user_id(self, device_id):
        try:
            return User.objects.values_list('id', flat=True).get(device_id=device_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def get_post_data(self, post_id):
        """Get post data from database"""
        try:
            post = Post.objects.select_related('author').get(id=post_id)
            return {
                'id': str(post.id),
                'text_content': post.text_content,
                'author': {
                    'handle': post.author.handle,
                    'avatar_color': post.author.avatar_color,
                },
                'font_choice': post.font_choice,
                'font_size': post.font_size,
                'text_color': post.text_color,
                'background_color': post.background_color,
                'background_gradient': post.background_gradient,
                'has_outline': post.has_outline,
                'outline_color': post.outline_color,
                'rendered_image': post.rendered_image.url if post.rendered_image else None,
                'created_at': post.created_at.isoformat(),
                'view_count': post.view_count,
            }
        except Post.DoesNotExist:
            return None
