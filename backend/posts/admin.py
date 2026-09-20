from django.contrib import admin
from django.utils.html import format_html
from .models import Post, PostReport, PostView


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    """Admin interface for Post model"""
    list_display = ['truncated_content', 'author', 'created_at', 'view_count', 
                   'is_hidden', 'is_flagged', 'report_count']
    list_filter = ['is_hidden', 'is_flagged', 'font_choice', 'created_at']
    search_fields = ['text_content', 'author__handle']
    readonly_fields = ['id', 'created_at', 'updated_at', 'view_count', 'rendered_image_preview']
    
    fieldsets = (
        (None, {'fields': ('id', 'author', 'text_content')}),
        ('Styling', {'fields': ('font_choice', 'font_size', 'text_color', 
                               'background_color', 'background_gradient', 
                               'has_outline', 'outline_color')}),
        ('Image', {'fields': ('rendered_image_preview', 'image_width', 'image_height')}),
        ('Moderation', {'fields': ('is_hidden', 'is_flagged', 'moderation_notes')}),
        ('Analytics', {'fields': ('view_count', 'created_at', 'updated_at')}),
    )
    
    actions = ['hide_posts', 'unhide_posts', 'flag_posts', 'unflag_posts']
    
    def truncated_content(self, obj):
        """Show truncated text content"""
        return obj.text_content[:50] + "..." if len(obj.text_content) > 50 else obj.text_content
    truncated_content.short_description = "Content"
    
    def report_count(self, obj):
        """Show number of reports for this post"""
        count = obj.reports.count()
        if count > 0:
            return format_html('<span style="color: red; font-weight: bold;">{}</span>', count)
        return count
    report_count.short_description = "Reports"
    
    def rendered_image_preview(self, obj):
        """Show preview of rendered image"""
        if obj.rendered_image:
            return format_html(
                '<img src="{}" style="max-width: 200px; max-height: 300px;" />',
                obj.rendered_image.url
            )
        return "No image"
    rendered_image_preview.short_description = "Rendered Image"
    
    def hide_posts(self, request, queryset):
        """Hide selected posts"""
        count = queryset.update(is_hidden=True)
        self.message_user(request, f"Hidden {count} posts")
    hide_posts.short_description = "Hide selected posts"
    
    def unhide_posts(self, request, queryset):
        """Unhide selected posts"""
        count = queryset.update(is_hidden=False)
        self.message_user(request, f"Unhidden {count} posts")
    unhide_posts.short_description = "Unhide selected posts"
    
    def flag_posts(self, request, queryset):
        """Flag selected posts for review"""
        count = queryset.update(is_flagged=True)
        self.message_user(request, f"Flagged {count} posts")
    flag_posts.short_description = "Flag selected posts"
    
    def unflag_posts(self, request, queryset):
        """Unflag selected posts"""
        count = queryset.update(is_flagged=False)
        self.message_user(request, f"Unflagged {count} posts")
    unflag_posts.short_description = "Unflag selected posts"
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author').prefetch_related('reports')


@admin.register(PostReport)
class PostReportAdmin(admin.ModelAdmin):
    """Admin interface for PostReport model"""
    list_display = ['post_content', 'reporter', 'reason', 'created_at', 
                   'is_reviewed', 'action_taken']
    list_filter = ['reason', 'is_reviewed', 'created_at']
    search_fields = ['post__text_content', 'reporter__handle', 'description']
    readonly_fields = ['created_at']
    
    fieldsets = (
        (None, {'fields': ('reporter', 'post', 'reason', 'description', 'created_at')}),
        ('Moderation', {'fields': ('is_reviewed', 'moderator_notes', 'action_taken')}),
    )
    
    actions = ['mark_reviewed', 'mark_unreviewed']
    
    def post_content(self, obj):
        """Show truncated post content"""
        content = obj.post.text_content
        return content[:30] + "..." if len(content) > 30 else content
    post_content.short_description = "Post Content"
    
    def mark_reviewed(self, request, queryset):
        """Mark reports as reviewed"""
        count = queryset.update(is_reviewed=True)
        self.message_user(request, f"Marked {count} reports as reviewed")
    mark_reviewed.short_description = "Mark as reviewed"
    
    def mark_unreviewed(self, request, queryset):
        """Mark reports as unreviewed"""
        count = queryset.update(is_reviewed=False)
        self.message_user(request, f"Marked {count} reports as unreviewed")
    mark_unreviewed.short_description = "Mark as unreviewed"
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('reporter', 'post__author')


@admin.register(PostView)
class PostViewAdmin(admin.ModelAdmin):
    """Admin interface for PostView model (analytics)"""
    list_display = ['post_content', 'viewer', 'ip_address', 'created_at']
    list_filter = ['created_at']
    search_fields = ['post__text_content', 'viewer__handle', 'ip_address']
    readonly_fields = ['created_at']
    
    def post_content(self, obj):
        """Show truncated post content"""
        content = obj.post.text_content
        return content[:30] + "..." if len(content) > 30 else content
    post_content.short_description = "Post Content"
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('post', 'viewer')
