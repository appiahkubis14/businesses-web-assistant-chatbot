from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Chat WebSocket for visitors
    # Pattern: ws/chat/{website_id}/{conversation_id}/{user_identifier}/
    re_path(
        r'ws/chat/(?P<website_id>[0-9a-f-]+)/(?P<conversation_id>[0-9a-f-]+)/(?P<user_identifier>[^/]+)/$', 
        consumers.ChatConsumer.as_asgi()
    ),
    
    # Alternative pattern for new conversations (no conversation_id yet)
    # Pattern: ws/chat/{website_id}/new/{user_identifier}/
    re_path(
        r'ws/chat/(?P<website_id>[0-9a-f-]+)/new/(?P<user_identifier>[^/]+)/$', 
        consumers.ChatConsumer.as_asgi()
    ),
    
    # Dashboard WebSocket for authenticated users
    re_path(r'ws/dashboard/$', consumers.DashboardConsumer.as_asgi()),
]
