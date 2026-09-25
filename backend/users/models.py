from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.crypto import get_random_string
import random


class User(AbstractUser):
    """
    Custom user model for semi-anonymous posting.
    Users get auto-generated handles and avatar colors.
    """
    
    AVATAR_COLORS = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
        '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
        '#A3CB38', '#1DD1A1', '#FF6348', '#E17055', '#74B9FF',
        '#00B894', '#FDCB6E', '#6C5CE7', '#A29BFE', '#FD79A8'
    ]
    
    # Remove username requirement for semi-anonymous nature
    username = None
    email = models.EmailField(unique=True, null=True, blank=True)
    
    # Semi-anonymous profile
    handle = models.CharField(max_length=50, unique=True)
    avatar_color = models.CharField(max_length=7, default='#4ECDC4')
    
    # Device identifier for anonymous users
    device_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    
    # Moderation fields
    is_shadowbanned = models.BooleanField(default=False)
    # Enough reports to need a human look. Reports alone never ban: a few
    # accounts could otherwise silence anyone.
    needs_review = models.BooleanField(default=False, db_index=True)
    shadowban_reason = models.TextField(blank=True)
    report_count = models.PositiveIntegerField(default=0)
    
    # Rate limiting
    last_post_time = models.DateTimeField(null=True, blank=True)
    posts_count_today = models.PositiveIntegerField(default=0)
    
    # User preferences
    is_anonymous_mode = models.BooleanField(default=True)
    default_signed_posts = models.BooleanField(default=False)
    preferred_signature_style = models.CharField(max_length=32, default='default')

    # Rendered signature customization: signing draws the handle as a small
    # line under the post content, in this font and color
    signature_font = models.CharField(max_length=20, default='arial-black')
    signature_color = models.CharField(max_length=7, blank=True, default='',
                                       help_text="Empty means auto-contrast against the post background")
    
    USERNAME_FIELD = 'handle'
    REQUIRED_FIELDS = []
    
    def save(self, *args, **kwargs):
        if not self.handle:
            self.handle = self.generate_unique_handle()
        if not self.avatar_color:
            self.avatar_color = random.choice(self.AVATAR_COLORS)
        super().save(*args, **kwargs)
    
    def generate_unique_handle(self):
        """Generate a unique anonymous handle like 'aqua-otter-931'"""
        adjectives = [
            'azure', 'crimson', 'emerald', 'golden', 'violet', 'coral', 'amber',
            'silver', 'ruby', 'sapphire', 'aqua', 'rose', 'mint', 'pearl',
            'bronze', 'crystal', 'jade', 'onyx', 'opal', 'ivory'
        ]
        
        animals = [
            'fox', 'wolf', 'bear', 'eagle', 'tiger', 'lion', 'dolphin', 'whale',
            'otter', 'falcon', 'hawk', 'raven', 'swan', 'crane', 'deer', 'elk',
            'lynx', 'puma', 'jaguar', 'panther', 'cobra', 'viper', 'gecko'
        ]
        
        while True:
            adjective = random.choice(adjectives)
            animal = random.choice(animals)
            number = random.randint(100, 999)
            handle = f"{adjective}-{animal}-{number}"
            
            if not User.objects.filter(handle=handle).exists():
                return handle
    
    def can_post(self):
        """Check if user can post based on rate limits and moderation status"""
        if self.is_shadowbanned:
            return False
        # Additional rate limiting logic can be added here
        return True
    
    def increment_report_count(self):
        """Count a report; at REVIEW_THRESHOLD queue the user for review.
        Banning is a moderator's decision (admin action), never automatic."""
        from django.conf import settings
        self.report_count += 1
        if self.report_count >= settings.REVIEW_THRESHOLD and not self.is_shadowbanned:
            self.needs_review = True
        self.save(update_fields=['report_count', 'needs_review'])
    
    def __str__(self):
        return self.handle


class UserReport(models.Model):
    """Track reports against users"""
    
    REPORT_REASONS = [
        ('spam', 'Spam'),
        ('harassment', 'Harassment'),
        ('inappropriate', 'Inappropriate Content'),
        ('fake', 'Fake/Misleading'),
        ('other', 'Other'),
    ]
    
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports_made')
    reported_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reports_received')
    reason = models.CharField(max_length=20, choices=REPORT_REASONS)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['reporter', 'reported_user']  # One report per user pair
    
    def __str__(self):
        return f"{self.reporter.handle} reported {self.reported_user.handle}"


class BlockedUser(models.Model):
    """Blocks are stronger than mutes: posts are hidden in both directions
    and quoted strips inside reposts are hidden bidirectionally."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocked_users')
    blocked_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocked_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'blocked_user']

    def __str__(self):
        return f"{self.user.handle} blocked {self.blocked_user.handle}"


class MutedUser(models.Model):
    """Track which users have muted which other users"""
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='muted_users')
    muted_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='muted_by')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['user', 'muted_user']
    
    def __str__(self):
        return f"{self.user.handle} muted {self.muted_user.handle}"
