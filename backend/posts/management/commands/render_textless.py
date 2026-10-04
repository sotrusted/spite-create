"""Give every post its text-free render and draw list (Post.textless_image,
Post.text_plan), oldest first
so each quote composites an already-done parent. Re-renders the post (new
image URLs; layout unchanged: quotes keep their frozen bands). Old image
files are deleted once the new ones are saved. Idempotent: skips posts
that already have one.

    ./venv/bin/python manage.py render_textless
"""
from django.core.management.base import BaseCommand
from django.db.models import Q

from posts.account import _delete_files, _post_files
from posts.models import Post


class Command(BaseCommand):
    help = 'Render text-free images for posts that lack them'

    def handle(self, *args, **options):
        done = 0
        missing = Q(textless_image='') | Q(textless_image__isnull=True) | Q(text_plan__isnull=True)
        for post in Post.objects.filter(missing).order_by('created_at').iterator():
            stale = _post_files(post)
            post.generate_image()
            post.save()
            _delete_files(name for name in stale if name not in _post_files(post))
            done += 1
        self.stdout.write(self.style.SUCCESS(f'{done} post(s) rendered'))
