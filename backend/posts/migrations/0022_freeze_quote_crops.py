"""Freeze, on every existing quote, the band of the original it shows.

Bounds stop being capped at 5:4 after this (the feed shrinks tall cards
instead), so an original's top_y/bottom_y may grow. A quote baked before
then was laid out around the capped band; recording that band in its
repost_geometry keeps the reply exactly as it was.
"""
from django.conf import settings
from django.db import migrations


def freeze(apps, schema_editor):
    Post = apps.get_model('posts', 'Post')
    for post in Post.objects.filter(is_repost=True, original_post__isnull=False).select_related('original_post').iterator():
        geometry = post.repost_geometry if isinstance(post.repost_geometry, dict) else None
        if not geometry or not geometry.get('width') or geometry.get('crop_bottom') is not None:
            continue
        original = post.original_post
        height = original.image_height or settings.POST_IMAGE_HEIGHT
        top = original.top_y if original.top_y is not None else 0
        bottom = original.bottom_y if original.bottom_y is not None else height
        if bottom <= top:
            top, bottom = 0, height
        geometry.update(crop_top=int(top), crop_bottom=int(bottom))
        Post.objects.filter(pk=post.pk).update(repost_geometry=geometry)


class Migration(migrations.Migration):
    dependencies = [('posts', '0021_cursive_and_wide_fonts')]
    operations = [migrations.RunPython(freeze, migrations.RunPython.noop)]
