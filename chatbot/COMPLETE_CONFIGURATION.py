# Complete URL and Routing Configuration

# ============================================================================
# 1. Django URL Configuration (urls.py)
# ============================================================================

from django.urls import path, include
from . import views, api_views

urlpatterns = [
    # Dashboard views
    path('live-chat/', views.live_chat_view, name='live_chat'),
    path('conversations/<uuid:conversation_id>/', views.conversation_detail_view, name='conversation_detail'),
    
    # API endpoints for manual responses
    path('api/send_manual_response/', api_views.send_manual_response, name='send_manual_response'),
    path('api/conversations/<uuid:conversation_id>/messages/', api_views.get_conversation_messages, name='get_conversation_messages'),
    path('api/conversations/<uuid:conversation_id>/end/', api_views.end_conversation, name='end_conversation'),
    
    # Chatbot API (existing)
    path('api/chat/<uuid:website_id>/', views.chat_api, name='chat_api'),
]

# ============================================================================
# 2. WebSocket Routing Configuration (routing.py)
# ============================================================================

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # WebSocket for chatbot conversations
    re_path(r'ws/chat/(?P<conversation_id>[\w-]+)/$', consumers.ChatConsumer.as_asgi()),
    
    # WebSocket for dashboard real-time updates
    re_path(r'ws/dashboard/$', consumers.DashboardConsumer.as_asgi()),
]

# ============================================================================
# 3. ASGI Configuration (asgi.py)
# ============================================================================

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import myapp.routing  # Replace 'myapp' with your actual app name

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            myapp.routing.websocket_urlpatterns
        )
    ),
})

# ============================================================================
# 4. Django Settings Configuration (settings.py)
# ============================================================================

# Add to your INSTALLED_APPS
INSTALLED_APPS = [
    # ... existing apps ...
    'channels',
    'channels_redis',  # if using Redis
    # ... your apps ...
]

# Channel Layers Configuration
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}

# If you don't have Redis, use in-memory backend (development only)
# CHANNEL_LAYERS = {
#     'default': {
#         'BACKEND': 'channels.layers.InMemoryChannelLayer',
#     },
# }

# WebSocket CORS settings (if needed)
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    # Add your frontend domains
]

CORS_ALLOW_CREDENTIALS = True

# ============================================================================
# 5. Required Model Structure
# ============================================================================

"""
Ensure your models have these fields:

class Website(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    system_prompt = models.TextField(default="You are a helpful assistant.")
    ai_model = models.CharField(max_length=50, default="gpt-3.5-turbo")

class Conversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='conversations')
    user_identifier = models.CharField(max_length=255, blank=True, null=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    requires_attention = models.BooleanField(default=False)
    
    @property
    def total_messages(self):
        return self.messages.count()

class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=[('user', 'User'), ('assistant', 'Assistant')])
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_manual_response = models.BooleanField(default=False)
    ai_model_used = models.CharField(max_length=50, blank=True, null=True)
"""

# ============================================================================
# 6. Deployment Commands
# ============================================================================

"""
# Install required packages
pip install channels channels-redis redis

# Start Redis server (if using Redis backend)
redis-server

# Run Django migrations
python manage.py makemigrations
python manage.py migrate

# Start Django development server with channels
python manage.py runserver

# For production, use Daphne or similar ASGI server
pip install daphne
daphne -p 8000 myproject.asgi:application
"""

# ============================================================================
# 7. Testing Configuration
# ============================================================================

"""
# Test WebSocket connections:

1. Open browser developer console
2. Navigate to /live-chat/
3. Check console for WebSocket connection messages:
   - "Dashboard WebSocket connected"
   - "Connected to real-time updates"

4. Open chatbot widget
5. Send a message
6. Check dashboard for real-time message appearance

# Test manual responses:

1. From dashboard, select a conversation
2. Type a response and hit Send
3. Check chatbot widget for immediate response
4. Verify message marked as "manual" in dashboard
"""

# ============================================================================
# 8. Error Debugging Guide
# ============================================================================

"""
Common Issues and Solutions:

1. WebSocket connection fails:
   - Check Redis is running: redis-cli ping
   - Verify CHANNEL_LAYERS settings
   - Check CORS settings for WebSocket
   - Ensure proper ASGI configuration

2. Messages not appearing in dashboard:
   - Check browser console for WebSocket errors
   - Verify user has access to website
   - Check Django logs for WebSocket messages
   - Ensure proper group subscriptions

3. Database errors:
   - Run migrations: python manage.py migrate
   - Check foreign key relationships
   - Verify UUID field configurations

4. Permission denied errors:
   - Ensure user is authenticated
   - Check website ownership relationships
   - Verify conversation access permissions

Debug WebSocket messages:
- Add console.log() statements in JavaScript
- Check Django logs with DEBUG=True
- Use Redis CLI to monitor channels: redis-cli monitor
"""

# ============================================================================
# 9. Performance Optimization
# ============================================================================

"""
For Production:

1. Use Redis for Channel Layers (not in-memory)
2. Configure Redis persistence and clustering
3. Use Daphne or uWSGI for ASGI serving
4. Set up proper logging and monitoring
5. Implement rate limiting for WebSocket connections
6. Use database connection pooling
7. Consider message archiving for old conversations

Redis Configuration:
- Set appropriate memory limits
- Configure persistence (AOF/RDB)
- Set up Redis clustering for high availability
- Monitor Redis memory usage

WebSocket Optimization:
- Limit concurrent connections per user
- Implement connection timeouts
- Use compression for large messages
- Batch database operations where possible
"""
