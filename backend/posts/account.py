"""Account deletion (App Store guideline 5.1.1(v): in-app, and it must
actually remove the data).

Deleting an account removes the user, their posts, the reports they filed,
their mutes, blocks and notifications, and every image file of theirs. The
hard part is other people's reposts: a quote is baked into the reposter's
image, so leaving those images alone would keep the deleted post visible.
Every surviving repost that contained it - directly or deeper in a chain -
is re-rendered with a "post removed" placeholder in the quote's exact
footprint, and the old images (which still show the deleted post) go too.
"""
import logging

from django.core.files.storage import default_storage
from django.db import transaction

from .models import Post

logger = logging.getLogger(__name__)


def _delete_files(names):
    for name in names:
        if not name:
            continue
        try:
            default_storage.delete(name)
        except Exception:  # a missing object must not block deleting an account
            logger.warning('could not delete %s', name, exc_info=True)


def _post_files(post):
    return [
        post.rendered_image.name if post.rendered_image else None,
        post.response_image.name if post.response_image else None,
        post.repost_screenshot.name if post.repost_screenshot else None,
    ]


def delete_account(user):
    doomed = list(Post.objects.filter(author=user))
    doomed_ids = {p.id for p in doomed}

    # Every surviving post that contains a doomed post, at any depth,
    # oldest first so each re-render composites an already-fixed parent
    affected, frontier = [], set(doomed_ids)
    while frontier:
        children = list(Post.objects.filter(original_post_id__in=frontier).exclude(author=user))
        affected.extend(children)
        frontier = {c.id for c in children}
    affected.sort(key=lambda p: p.created_at)

    with transaction.atomic():
        # Freeze where each direct quote sat, before the link is nulled
        for child in affected:
            if child.original_post_id in doomed_ids:
                geometry = child._repost_strip_geometry()
                if geometry:
                    child.repost_geometry = {
                        **(child.repost_geometry or {}),
                        'removed': {
                            'x': geometry['paste_x'], 'y': geometry['paste_y'],
                            'width': geometry['strip_width'], 'height': geometry['strip_height'],
                        },
                    }
                    Post.objects.filter(pk=child.pk).update(repost_geometry=child.repost_geometry)
        files = [name for post in doomed for name in _post_files(post)]
        user.delete()  # cascades posts, reports, notifications, mutes, blocks

    _delete_files(files)

    for child in affected:
        child = Post.objects.get(pk=child.pk)  # fresh: link nulled, parent re-rendered
        stale = _post_files(child)
        child.generate_image()
        child.save()
        _delete_files(name for name in stale if name not in _post_files(child))

    return {'posts_deleted': len(doomed), 'reposts_rerendered': len(affected)}
