"""Email a digest of recent post reports (App Store guideline 1.2: act on
reports). Run daily from cron on the VM:

    0 13 * * * cd /path/to/backend && ./venv/bin/python manage.py report_digest

Sends nothing when there are no new reports. --hours widens the window.
"""
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.utils import timezone

from posts.models import PostReport


class Command(BaseCommand):
    help = 'Email a digest of post reports filed in the last N hours (default 24)'

    def add_arguments(self, parser):
        parser.add_argument('--hours', type=int, default=24)

    def handle(self, *args, **options):
        since = timezone.now() - timedelta(hours=options['hours'])
        reports = (
            PostReport.objects.filter(created_at__gte=since)
            .select_related('post', 'post__author', 'reporter')
            .order_by('post_id', 'created_at')
        )
        if not reports:
            self.stdout.write('No new reports; no digest sent.')
            return

        lines = []
        for r in reports:
            author = r.post.author
            lines.append(
                f"- [{r.reason}] post {r.post.id} by @{author.handle}"
                f" (author reports: {author.report_count},"
                f" shadowbanned: {author.is_shadowbanned})\n"
                f"  reported by @{r.reporter.handle}"
                + (f": {r.description}" if r.description else "")
                + f"\n  text: {(r.post.text_content or '')[:120]!r}"
            )

        body = (
            f"{reports.count()} report(s) in the last {options['hours']}h:\n\n"
            + '\n\n'.join(lines)
            + f"\n\nReview in admin: /admin/posts/postreport/"
        )
        send_mail(
            subject=f"[Typing] {reports.count()} new report(s)",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[settings.REPORT_DIGEST_EMAIL],
        )
        self.stdout.write(self.style.SUCCESS(f'Digest sent: {reports.count()} report(s).'))
