from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, UserReport, MutedUser


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin interface for User model"""
    list_display = ['handle', 'avatar_color', 'needs_review', 'is_shadowbanned', 'report_count',
                   'date_joined', 'last_post_time', 'is_anonymous_mode']
    list_filter = ['needs_review', 'is_shadowbanned', 'is_anonymous_mode', 'date_joined']
    search_fields = ['handle', 'device_id']
    readonly_fields = ['handle', 'date_joined', 'last_login']
    ordering = ['handle']  # Override default ordering
    
    fieldsets = (
        (None, {'fields': ('handle', 'email', 'device_id')}),
        ('Profile', {'fields': ('avatar_color', 'is_anonymous_mode')}),
        ('Moderation', {'fields': ('needs_review', 'is_shadowbanned', 'shadowban_reason', 'report_count')}),
        ('Rate Limiting', {'fields': ('last_post_time', 'posts_count_today')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    
    actions = ['shadowban_users', 'dismiss_review', 'remove_shadowban', 'reset_report_count']
    
    def shadowban_users(self, request, queryset):
        """Shadowban selected users"""
        count = queryset.update(is_shadowbanned=True, needs_review=False,
                                shadowban_reason=f"Reviewed by {request.user}")
        self.message_user(request, f"Shadowbanned {count} users")
    shadowban_users.short_description = "Shadowban selected users"
    
    def dismiss_review(self, request, queryset):
        """Reviewed and fine: leave the queue without a ban"""
        count = queryset.update(needs_review=False, report_count=0)
        self.message_user(request, f"Dismissed {count} users from review")
    dismiss_review.short_description = "Reviewed: no action (clear reports)"

    def remove_shadowban(self, request, queryset):
        """Remove shadowban from selected users"""
        count = queryset.update(is_shadowbanned=False, shadowban_reason="")
        self.message_user(request, f"Removed shadowban from {count} users")
    remove_shadowban.short_description = "Remove shadowban from selected users"
    
    def reset_report_count(self, request, queryset):
        """Reset report count for selected users"""
        count = queryset.update(report_count=0)
        self.message_user(request, f"Reset report count for {count} users")
    reset_report_count.short_description = "Reset report count"


@admin.register(UserReport)
class UserReportAdmin(admin.ModelAdmin):
    """Admin interface for UserReport model"""
    list_display = ['reporter', 'reported_user', 'reason', 'created_at']
    list_filter = ['reason', 'created_at']
    search_fields = ['reporter__handle', 'reported_user__handle']
    readonly_fields = ['created_at']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('reporter', 'reported_user')


@admin.register(MutedUser)
class MutedUserAdmin(admin.ModelAdmin):
    """Admin interface for MutedUser model"""
    list_display = ['user', 'muted_user', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__handle', 'muted_user__handle']
    readonly_fields = ['created_at']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'muted_user')
