"""
ASGI config for tbd_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

Import order matters: get_asgi_application() initializes Django's app
registry and MUST run before importing anything that touches models
(posts.routing -> consumers -> auth models). runserver hides this;
standalone Daphne on the VM does not.
"""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tbd_backend.settings')

from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import posts.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            posts.routing.websocket_urlpatterns
        )
    ),
})
