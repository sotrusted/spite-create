"""Support inbox: mail to support@ (or any address) at the domain is received
by Resend, which calls this webhook; we fetch the message and forward it to
the people who answer support (SUPPORT_FORWARD_TO).

Replies go out from the support address, never a personal one. The forward's
Reply-To is a relay address, reply+<email id>.<signature>@<domain>; a reply
sent there comes back through this same webhook, is checked (it must be
from a SUPPORT_FORWARD_TO address, pass DKIM or DMARC, and carry a valid
signature), and is re-sent from SUPPORT_FROM_EMAIL to the original sender,
threaded onto their message. Attachments are not carried over (support
mail rarely has them); the forward says so and they stay retrievable in
the Resend dashboard.

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
from email.utils import parseaddr

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


RELAY_PREFIX = 'reply+'


def _relay_signature(email_id):
    return hmac.new(settings.RESEND_WEBHOOK_SECRET.encode(), email_id.encode(), hashlib.sha256).hexdigest()[:20]


def relay_address(email_id):
    domain = parseaddr(settings.SUPPORT_FROM_EMAIL)[1].split('@')[1]
    return f'{RELAY_PREFIX}{email_id}.{_relay_signature(email_id)}@{domain}'


def relayed_email_id(address):
    """The received email a relay address answers, or None if it is not a
    relay address or its signature is wrong."""
    local = parseaddr(address)[1].split('@')[0].lower()
    if not local.startswith(RELAY_PREFIX):
        return None
    email_id, _, signature = local[len(RELAY_PREFIX):].rpartition('.')
    if not email_id or not hmac.compare_digest(signature, _relay_signature(email_id)):
        return None
    return email_id


def _authenticated(email):
    """The receiving server's own verdict that the sender is who they say
    (DKIM or DMARC pass) - a From line alone can be forged."""
    auth = email.get('authentication') or {}
    return auth.get('dkim') == 'pass' or auth.get('dmarc') == 'pass'


def relay_reply(email, original_id):
    """A support reply from Gmail, re-sent from the support address."""
    sender = parseaddr(email.get('from') or '')[1].lower()
    allowed = {parseaddr(a)[1].lower() for a in settings.SUPPORT_FORWARD_TO}
    if sender not in allowed or not _authenticated(email):
        logger.warning('refused a relay reply from %s', sender or 'unknown')
        return None
    original = _resend('GET', f'/emails/receiving/{original_id}')
    subject = original.get('subject') or ''
    payload = {
        'from': settings.SUPPORT_FROM_EMAIL,
        'to': [original.get('from')],
        'subject': subject if subject.lower().startswith('re:') else f'Re: {subject}'.strip(),
        'text': email.get('text') or '',
    }
    if email.get('html'):
        payload['html'] = email['html']
    if original.get('message_id'):
        payload['headers'] = {'In-Reply-To': original['message_id'], 'References': original['message_id']}
    return _resend('POST', '/emails', json=payload)


def handle_received_email(email_id):
    email = _resend('GET', f'/emails/receiving/{email_id}')
    for address in email.get('to') or []:
        original_id = relayed_email_id(address)
        if original_id:
            return relay_reply(email, original_id)
    return forward_received_email(email_id, email)


def forward_received_email(email_id, email=None):
    email = email or _resend('GET', f'/emails/receiving/{email_id}')
    sender = email.get('from') or 'unknown sender'
    subject = email.get('subject') or '(no subject)'
    to = ', '.join(email.get('to') or [])
    note = f'From {sender} to {to}. Reply to answer them from the support address.'
    if email.get('attachments'):
        names = ', '.join(a.get('filename') or 'unnamed' for a in email['attachments'])
        note += f' Attachments not included ({names}); see the Resend dashboard.'
    text = f"{note}\n\n{email.get('text') or ''}"
    html = email.get('html')
    payload = {
        'from': settings.SUPPORT_FROM_EMAIL,
        'to': settings.SUPPORT_FORWARD_TO,
        'reply_to': relay_address(email_id),
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
        handle_received_email(email_id)
    except requests.RequestException:
        # 5xx makes Resend retry the delivery later
        logger.exception('forwarding inbound email %s failed', email_id)
        return HttpResponse(status=502)
    return JsonResponse({'forwarded': email_id})
