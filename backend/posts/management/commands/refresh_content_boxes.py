"""Fill Post.content_boxes for posts rendered before the field existed.

Measures only - no image is re-rendered and top_y/bottom_y are untouched -
using the same bounds pass generate_image runs. Idempotent:

    ./venv/bin/python manage.py refresh_content_boxes          # missing only
    ./venv/bin/python manage.py refresh_content_boxes --all    # recompute all
"""
from django.core.management.base import BaseCommand

from posts.models import Post


class Command(BaseCommand):
    help = 'Compute content_boxes for posts that lack them (no re-render)'

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true', help='recompute every post')

    def handle(self, *args, **options):
        posts = Post.objects.all() if options['all'] else Post.objects.filter(content_boxes__isnull=True)
        done = 0
        for post in posts.iterator():
            post.content_boxes = None
            post._calculate_vertical_bounds(post._collect_text_elements())
            Post.objects.filter(pk=post.pk).update(content_boxes=post.content_boxes or [])
            done += 1
        self.stdout.write(self.style.SUCCESS(f'content_boxes written for {done} post(s)'))
