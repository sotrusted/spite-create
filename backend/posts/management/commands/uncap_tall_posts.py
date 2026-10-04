"""Re-render the posts whose stored bounds were cut at the old 5:4 cap.

Bounds are a post's whole content extent now (the feed shrinks tall cards
to fit instead of cropping them). Posts saved before that have top_y /
bottom_y cut to exactly the cap height; re-rendering them recomputes the
full extent. Quotes of them keep their frozen band (migration 0022), so no
reply moves. Old image files are deleted once the new ones are saved.

    ./venv/bin/python manage.py uncap_tall_posts --dry-run
    ./venv/bin/python manage.py uncap_tall_posts
"""
from django.core.management.base import BaseCommand

from posts.account import _delete_files, _post_files
from posts.models import Post

OLD_CAP_ASPECT = 1.25


class Command(BaseCommand):
    help = 'Re-render posts whose bounds were capped at 5:4 (full content extent)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        capped = [
            post for post in Post.objects.exclude(top_y=None).exclude(bottom_y=None).iterator()
            if post.image_width and post.bottom_y - post.top_y == int(round(post.image_width * OLD_CAP_ASPECT))
        ]
        self.stdout.write(f'{len(capped)} capped post(s)')
        if options['dry_run']:
            return
        for post in capped:
            stale = _post_files(post)
            before = (post.top_y, post.bottom_y)
            post.generate_image()
            post.save()
            _delete_files(name for name in stale if name not in _post_files(post))
            self.stdout.write(f'  {post.id}: {before} -> {(post.top_y, post.bottom_y)}')
        self.stdout.write(self.style.SUCCESS('done'))
