"""Rate limiting keyed on who is actually calling.

Behind nginx every request's REMOTE_ADDR is 127.0.0.1, so DRF's stock
throttles put the whole world in one bucket (10 posts/hour *globally*).
Identity here is the per-install device id; the abuse backstop is the real
client IP. nginx overwrites X-Real-IP with the socket peer address, so
unlike X-Forwarded-For it cannot be spoofed by the client.
"""
from rest_framework.throttling import SimpleRateThrottle


def real_ip(request):
    return (
        request.META.get('HTTP_X_REAL_IP')
        or request.META.get('REMOTE_ADDR')
        or 'unknown'
    )


class RealIPThrottle(SimpleRateThrottle):
    """Per-client-IP ceiling. Generous: carrier NAT puts many phones behind
    one address."""
    scope = 'anon'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': real_ip(request)}


class DeviceThrottle(SimpleRateThrottle):
    """Per-device limit (the app's notion of a user); falls back to IP for
    clients that send no device id."""
    scope = 'user'

    def get_cache_key(self, request, view):
        ident = request.META.get('HTTP_X_DEVICE_ID') or real_ip(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class PostCreateThrottle(DeviceThrottle):
    """Product rule: posts per device per hour."""
    scope = 'post_create'


class PostCreateIPThrottle(RealIPThrottle):
    """Backstop against rotating device ids to dodge the per-device rule."""
    scope = 'post_create_ip'
