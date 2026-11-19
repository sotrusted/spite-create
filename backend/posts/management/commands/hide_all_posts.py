"""Clear the feed before launch without deleting anything: every post that is
visible now is marked hidden, and their ids are printed (one per line) so the
same set can be brought back.

    manage.py hide_all_posts              # how many would be hidden
    manage.py hide_all_posts --apply      # hide them, print their ids
    manage.py hide_all_posts --restore ids.txt   # un-hide the ids in a file
"""
from django.core.management.base import BaseCommand

from posts.models import Post


class Command(BaseCommand):
    help = 'Hide every visible post (reversible), or restore a saved set.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='actually hide the posts')
        parser.add_argument('--restore', metavar='FILE', help='un-hide the post ids listed in FILE')

    def handle(self, *args, apply=False, restore=None, **options):
        if restore:
            ids = [line.strip() for line in open(restore) if line.strip()]
            shown = Post.objects.filter(id__in=ids, is_hidden=True).update(is_hidden=False)
            self.stderr.write(f'{shown} posts shown again')
            return
        visible = Post.objects.filter(is_hidden=False)
        ids = [str(i) for i in visible.values_list('id', flat=True)]
        if not apply:
            self.stderr.write(f'{len(ids)} posts would be hidden (run with --apply)')
            return
        hidden = Post.objects.filter(id__in=ids).update(is_hidden=True)
        self.stdout.write('\n'.join(ids))
        self.stderr.write(f'{hidden} posts hidden')
