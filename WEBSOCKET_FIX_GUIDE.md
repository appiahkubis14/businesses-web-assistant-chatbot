# WebSocket Chat Dashboard Fix - Implementation Guide

## Problem Identified

When users send messages via the chatbot widget, the messages were not appearing in the dashboard. The issue was in the WebSocket communication flow between the chatbot and dashboard.

## Key Issues Fixed

### 1. **Dashboard Notification Not Working**
- **Problem**: `notify_dashboard_new_message()` was only logging, not sending WebSocket messages
- **Solution**: Implemented proper WebSocket group messaging to dashboard

### 2. **Missing WebSocket Subscriptions**
- **Problem**: Dashboard wasn't properly subscribing to website-specific channels
- **Solution**: Added auto-subscription logic for user's websites

### 3. **Incomplete Message Flow**
- **Problem**: Only user messages were being sent to dashboard, not AI responses
- **Solution**: Both user and AI messages now trigger dashboard notifications

### 4. **Syntax Errors in Group Messaging**
- **Problem**: `Conversation.website.id` instead of `conversation.website.id`
- **Solution**: Fixed variable references in WebSocket group sends

## Implementation Changes

### Backend Changes (consumers_fixed.py)

#### 1. Enhanced `notify_dashboard_new_message()` Method
```python
async def notify_dashboard_new_message(self, conversation, message):
    """Notify dashboard about new message"""
    try:
        # Send to all dashboard users for this website
        await self.channel_layer.group_send(
            f'dashboard_website_{conversation.website.id}',
            {
                'type': 'new_message',
                'message': {
                    'id': str(message.id),
                    'content': message.content,
                    'role': message.role,
                    'conversation_id': str(conversation.id),
                    'timestamp': message.timestamp.isoformat(),
                    'is_manual': getattr(message, 'is_manual_response', False)
                },
                'conversation_id': str(conversation.id),
                'website_id': conversation.website.id
            }
        )
```

#### 2. Auto-Subscription to User Websites
```python
async def auto_subscribe_to_websites(self):
    """Auto-subscribe to all user's websites"""
    try:
        user_websites = await self.get_user_websites()
        for website_id in user_websites:
            website_group = f'dashboard_website_{website_id}'
            
            await self.channel_layer.group_add(
                website_group,
                self.channel_name
            )
            
            self.subscribed_websites.add(website_id)
```

#### 3. Fixed Message Flow
- Both user messages AND AI responses now trigger dashboard notifications
- Proper error handling for WebSocket operations
- Improved typing indicator handling

### Frontend Changes (dashboard_websocket_fixed.js)

#### 1. Enhanced WebSocket Message Handling
```javascript
wsConnection.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    if (data.type === 'new_message') {
        updateConversationMessage(data.conversation_id, data.message);
        
        // If this message is for the current conversation, display it
        if (currentConversationId == data.conversation_id) {
            appendMessage(data.message);
            scrollMessagesToBottom();
        }
        
        // Show notification for new user messages
        if (data.message.role === 'user') {
            showToast(`New message from visitor`, 'info');
            playNotificationSound();
        }
    }
};
```

#### 2. Real-time Conversation Updates
- Live message previews in conversation list
- Automatic conversation reordering
- Visual indicators for new messages
- Toast notifications for user activity

#### 3. Improved Error Handling
- Automatic reconnection on WebSocket disconnect
- Fallback to HTTP when WebSocket unavailable
- User-friendly error messages

## WebSocket Flow

### Complete Message Flow:
1. **User sends message via chatbot widget**
   - Message → `ChatConsumer.handle_chat_message()`
   - Save user message → Database
   - **Notify dashboard** → `dashboard_website_{website_id}` group
   - Generate AI response
   - Save AI response → Database
   - **Notify dashboard** → `dashboard_website_{website_id}` group
   - Send AI response → Chatbot widget

2. **Dashboard receives real-time updates**
   - Dashboard WebSocket connects
   - Auto-subscribes to user's websites
   - Receives `new_message` events
   - Updates conversation list
   - Displays messages in current conversation
   - Shows notifications for new user messages

### WebSocket Groups:
- `chat_{conversation_id}` - Specific chatbot conversations
- `dashboard_website_{website_id}` - All dashboard users for a website
- `dashboard_user_{user_id}` - User-specific dashboard updates

## Testing the Fix

### 1. Start the Application
```bash
python manage.py runserver
```

### 2. Open Dashboard
- Navigate to `/live-chat/`
- Verify WebSocket connection established
- Check browser console for connection messages

### 3. Test Message Flow
- Open chatbot widget on website
- Send a message from visitor
- **Expected Result**: Message should appear immediately in dashboard
- **Check**: Conversation list updates with new message preview
- **Check**: Toast notification appears
- **Check**: Message count increases

### 4. Test Two-Way Communication
- Send response from dashboard
- **Expected Result**: Response appears in chatbot widget
- **Check**: Message marked as manual response in dashboard

## Key Features Added

### 1. **Real-time Message Sync**
- Instant message delivery to dashboard
- Live conversation updates
- Message count tracking

### 2. **Visual Indicators**
- Toast notifications for new messages
- Typing indicators (visitor typing)
- Manual response indicators
- Connection status indicators

### 3. **Error Resilience**
- Automatic WebSocket reconnection
- HTTP fallback for message sending
- Graceful error handling

### 4. **User Experience**
- Sound notifications (optional)
- Auto-scroll to new messages
- Conversation reordering by activity
- Visual conversation status

## Required Database Fields

Ensure your `Message` model has these fields:
```python
class Message(models.Model):
    # ... existing fields ...
    is_manual_response = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)
```

## Configuration Requirements

### 1. Django Channels Setup
```python
# settings.py
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}
```

### 2. WebSocket URL Routing
```python
# routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/chat/(?P<conversation_id>[\w-]+)/$', consumers.ChatConsumer.as_asgi()),
    re_path(r'ws/dashboard/$', consumers.DashboardConsumer.as_asgi()),
]
```

### 3. ASGI Configuration
```python
# asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import myapp.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            myapp.routing.websocket_urlpatterns
        )
    ),
})
```

## Troubleshooting

### 1. Messages Not Appearing in Dashboard
- Check browser console for WebSocket errors
- Verify Redis server is running
- Check Django logs for WebSocket connection messages
- Ensure user has access to website

### 2. WebSocket Connection Issues
- Verify CORS settings for WebSocket
- Check firewall/proxy settings
- Ensure proper ASGI server configuration

### 3. Database Errors
- Verify Message model has required fields
- Check foreign key relationships
- Ensure proper database migrations

## Performance Considerations

### 1. **WebSocket Group Management**
- Users only subscribe to their own websites
- Automatic cleanup on disconnect
- Efficient group messaging

### 2. **Message Handling**
- Batch database operations where possible
- Limit message history in conversations
- Use pagination for large conversation lists

### 3. **Error Recovery**
- Automatic reconnection with backoff
- Graceful degradation to HTTP
- Connection state management

This implementation provides a robust, real-time chat system with proper bidirectional communication between the chatbot widget and dashboard interface.
