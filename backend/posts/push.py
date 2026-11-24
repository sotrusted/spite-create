"""Push notifications to phones, through Expo's push service (which holds the
APNs key and talks to Apple).

Two kinds: someone quoted you (or a chain you wrote in), and - for those who
asked for it - every new post. Both are as anonymous as the post itself: a
handle is named only when the post is signed.

Sending happens on a background thread, after the request's transaction
commits: a slow or failing push service never delays or fails a post.
"""
import threading

import requests
from django.conf import settings
from django.db import transaction
from django.db.models import Q

from users.models import BlockedUser, MutedUser, User

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
BATCH = 100  # Expo's limit per request
SNIPPET = 80


def _who(post):
    return f'@{post.author.handle}' if post.is_signed else 'Someone'


def _withheld(post):
    return post.is_hidden or post.author.is_shadowbanned


def _snippet(text):
    text = ' '.join((text or '').split())
    return text if len(text) <= SNIPPET else text[:SNIPPET - 1].rstrip() + '…'


def _silenced_by(author_id):
    """Users who must not hear of this author's posts: those who muted them,
    and both sides of any block."""
    ids = set(MutedUser.objects.filter(muted_user_id=author_id).values_list('user_id', flat=True))
    for a, b in BlockedUser.objects.filter(
            Q(user_id=author_id) | Q(blocked_user_id=author_id)).values_list('user_id', 'blocked_user_id'):
        ids.update((a, b))
    ids.discard(author_id)
    return ids


def notify_quoted(recipient, post, quoted_snippet=''):
    """Tell one author their post (or a chain they wrote in) was quoted."""
    if not (recipient.push_token and recipient.notify_replies) or _withheld(post):
        return
    if recipient.id in _silenced_by(post.author_id):
        return
    said = _snippet(post.text_content)
    send([recipient.push_token], f'{_who(post)} quoted you',
         said or (f'"{quoted_snippet}"' if quoted_snippet else ''),
         {'post_id': str(post.id), 'kind': 'quote'})


def notify_new_post(post, exclude=()):
    """Tell everyone who asked to hear of every post. `exclude` is user ids
    who are not told: the author, and those already told they were quoted."""
    if _withheld(post):
        return
    skip = set(exclude) | {post.author_id} | _silenced_by(post.author_id)
    tokens = list(User.objects.filter(notify_all_posts=True, is_active=True)
                  .exclude(push_token='').exclude(id__in=skip)
                  .values_list('push_token', flat=True).distinct())
    if tokens:
        send(tokens, f'{_who(post)} posted', _snippet(post.text_content),
             {'post_id': str(post.id), 'kind': 'post'})


def send(tokens, title, body, data):
    """Queue one notification for these tokens, sent once the surrounding
    transaction commits (a rolled-back post is never announced)."""
    if not settings.PUSH_ENABLED or not tokens:
        return
    messages = [{'to': token, 'title': title, 'body': body, 'data': data, 'sound': 'default'}
                for token in tokens]
    transaction.on_commit(
        lambda: threading.Thread(target=deliver, args=(messages,), daemon=True).start())


def deliver(messages):
    """Post the messages to Expo. A token Apple no longer knows (the app was
    deleted) is forgotten, so it is not tried again."""
    for start in range(0, len(messages), BATCH):
        batch = messages[start:start + BATCH]
        try:
            response = requests.post(EXPO_PUSH_URL, json=batch, timeout=10)
            tickets = response.json().get('data') or []
        except Exception as e:
            print(f'Push send failed: {e}')
            continue
        for ticket in tickets:
            if ticket.get('status') == 'error':
                print(f'Push refused: {ticket.get("message")} ({(ticket.get("details") or {}).get("error")})')
        dead = [message['to'] for message, ticket in zip(batch, tickets)
                if ticket.get('status') == 'error'
                and (ticket.get('details') or {}).get('error') == 'DeviceNotRegistered']
        if dead:
            User.objects.filter(push_token__in=dead).update(push_token='')
