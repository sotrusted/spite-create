"""Find out why a phone gets no push notifications.

    manage.py push_check                 # who has a push token, and what they asked for
    manage.py push_check --send HANDLE   # send that user a test push and say what became of it

A test push is followed to its receipt: Expo accepts a message first (the
ticket) and only afterwards reports what Apple said (the receipt), which is
where a missing or wrong APNs key shows up.
"""
import time

import requests
from django.core.management.base import BaseCommand

from posts.push import EXPO_PUSH_URL
from users.models import User

RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'


class Command(BaseCommand):
    help = 'List push tokens, or send one user a test push and report its receipt.'

    def add_arguments(self, parser):
        parser.add_argument('--send', metavar='HANDLE', help='send this user a test push')

    def handle(self, *args, send=None, **options):
        if not send:
            users = User.objects.exclude(push_token='').order_by('-last_login', 'handle')
            self.stdout.write(f'{users.count()} of {User.objects.count()} users have a push token')
            for u in users:
                self.stdout.write(
                    f'  @{u.handle}: quotes {"on" if u.notify_replies else "off"}, '
                    f'every post {"on" if u.notify_all_posts else "off"}')
            return

        user = User.objects.filter(handle=send.lstrip('@')).first()
        if not user:
            self.stdout.write(f'No user @{send}')
            return
        if not user.push_token:
            self.stdout.write(
                f'@{user.handle} has no push token: the phone never registered one '
                '(notifications not allowed on the phone, or an old build).')
            return
        ticket = requests.post(EXPO_PUSH_URL, timeout=10, json=[{
            'to': user.push_token, 'title': 'Typee test', 'body': 'Push notifications work.', 'sound': 'default',
        }]).json()
        self.stdout.write(f'ticket: {ticket}')
        ticket_id = ((ticket.get('data') or [{}])[0]).get('id')
        if not ticket_id:
            return
        for _ in range(6):
            time.sleep(5)
            receipts = requests.post(RECEIPTS_URL, timeout=10, json={'ids': [ticket_id]}).json()
            if (receipts.get('data') or {}).get(ticket_id):
                self.stdout.write(f'receipt: {receipts["data"][ticket_id]}')
                return
        self.stdout.write('no receipt after 30s (Expo has not heard back from Apple yet)')
