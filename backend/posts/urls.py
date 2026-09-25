from django.urls import path
from . import views

app_name = 'posts'

urlpatterns = [
    # Post endpoints
    path('posts/', views.PostCreateView.as_view(), name='post-create'),
    path('posts/<uuid:id>/', views.PostDetailView.as_view(), name='post-detail'),
    path('feed/', views.FeedListView.as_view(), name='feed'),
    path('stickers/upload/', views.upload_sticker, name='upload-sticker'),
    path('backgrounds/upload/', views.upload_background, name='upload-background'),
    
    # Moderation endpoints
    path('posts/<uuid:post_id>/report/', views.report_post, name='report-post'),
    path('users/<str:user_handle>/report/', views.report_user, name='report-user'),
    path('users/<str:user_handle>/mute/', views.mute_user, name='mute-user'),
    path('users/<str:user_handle>/unmute/', views.unmute_user, name='unmute-user'),
    path('users/<str:user_handle>/block/', views.block_user, name='block-user'),
    path('users/<str:user_handle>/unblock/', views.unblock_user, name='unblock-user'),
    
    # User endpoints
    path('users/create/', views.create_user, name='create-user'),
    path('users/profile/', views.user_profile, name='user-profile'),
    path('users/me/', views.delete_account, name='delete-account'),
    path('notifications/', views.notifications_list, name='notifications'),
    path('notifications/read/', views.notifications_mark_read, name='notifications-read'),
]
