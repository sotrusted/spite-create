"""Support inbox: mail to support@ (or any address) at the domain is received
by Resend, which calls this webhook; we fetch the message and forward it to
the people who answer support (SUPPORT_FORWARD_TO).

The forward comes from the support address with Reply-To set to the
original sender, so replying from Gmail answers them directly. Attachments
are not carried over (support mail rarely has them); the forward says so
and they stay retrievable in the Resend dashboard.

Webhook requests are signed (Svix scheme): an HMAC-SHA256 over
"{svix-id}.{svix-timestamp}.{body}" with the endpoint's whsec_ secret.
Anything unsigned, mis-signed or stale is refused.
"""
import base64
import hashlib
import hmac
import json
import logging
import time

import requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)

RESEND_API = 'https://api.resend.com'
SIGNATURE_TOLERANCE_SECONDS = 5 * 60


def signature_valid(secret, msg_id, timestamp, body, signature_header, now=None):
    if not (secret and msg_id and timestamp and signature_header):
        return False
    try:
        if abs((now or time.time()) - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
            return False
        key = base64.b64decode(secret.split('_', 1)[1] if secret.startswith('whsec_') else secret)
    except (ValueError, TypeError):
        return False
    signed = f'{msg_id}.{timestamp}.'.encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    # The header may carry several space-separated "v1,<sig>" entries
    return any(
        hmac.compare_digest(part.split(',', 1)[1], expected)
        for part in signature_header.split()
        if part.startswith('v1,')
    )


def _resend(method, path, **kwargs):
    response = requests.request(
        method, f'{RESEND_API}{path}',
        headers={'Authorization': f'Bearer {settings.RESEND_API_KEY}'},
        timeout=15, **kwargs,
    )
    response.raise_for_status()
    return response.json()


def forward_received_email(email_id):
    email = _resend('GET', f'/emails/receiving/{email_id}')
    sender = email.get('from') or 'unknown sender'
    subject = email.get('subject') or '(no subject)'
    to = ', '.join(email.get('to') or [])
    note = f'Forwarded from {to}. Reply to answer {sender} directly.'
    if email.get('attachments'):
        names = ', '.join(a.get('filename') or 'unnamed' for a in email['attachments'])
        note += f' Attachments not included ({names}); see the Resend dashboard.'
    text = f"{note}\n\n{email.get('text') or ''}"
    html = email.get('html')
    payload = {
        'from': settings.SUPPORT_FROM_EMAIL,
        'to': settings.SUPPORT_FORWARD_TO,
        'reply_to': sender,
        'subject': f'[Support] {subject}',
        'text': text,
    }
    if html:
        payload['html'] = f'<p style="color:#666">{note}</p><hr>{html}'
    return _resend('POST', '/emails', json=payload)


@csrf_exempt
@require_POST
def resend_inbound_webhook(request):
    body = request.body
    if not signature_valid(
        settings.RESEND_WEBHOOK_SECRET,
        request.headers.get('svix-id'),
        request.headers.get('svix-timestamp'),
        body,
        request.headers.get('svix-signature'),
    ):
        return HttpResponse(status=401)
    try:
        event = json.loads(body)
    except ValueError:
        return HttpResponse(status=400)
    if event.get('type') != 'email.received':
        return JsonResponse({'ignored': event.get('type')})
    email_id = (event.get('data') or {}).get('email_id')
    if not email_id:
        return HttpResponse(status=400)
    try:
        forward_received_email(email_id)
    except requests.RequestException:
        # 5xx makes Resend retry the delivery later
        logger.exception('forwarding inbound email %s failed', email_id)
        return HttpResponse(status=502)
    return JsonResponse({'forwarded': email_id})
