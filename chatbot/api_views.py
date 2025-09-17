# API Views for Manual Response Handling

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.utils import timezone
import json
import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Conversation, Message

logger = logging.getLogger(__name__)
channel_layer = get_channel_layer()

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def send_manual_response(request):
    """
    API endpoint for sending manual responses from dashboard
    """
    try:
        data = json.loads(request.body)
        conversation_id = data.get('conversation_id')
        message_content = data.get('message', '').strip()
        
        if not conversation_id or not message_content:
            return JsonResponse({
                'success': False,
                'error': 'Missing conversation_id or message'
            }, status=400)
        
        # Get conversation
        conversation = get_object_or_404(Conversation, id=conversation_id)
        
        # Check if user has access to this conversation's website
        if not hasattr(conversation.website, 'owner') or conversation.website.owner != request.user:
            return JsonResponse({
                'success': False,
                'error': 'Access denied'
            }, status=403)
        
        # Save message to database
        message = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=message_content,
            is_manual_response=True
        )
        
        # Send message to the specific chatbot conversation via WebSocket
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'chat_{conversation_id}',
                {
                    'type': 'chat_message_from_dashboard',
                    'message': message_content,
                    'role': 'assistant',
                    'conversation_id': conversation_id,
                    'timestamp': timezone.now().isoformat(),
                    'agent_id': request.user.id
                }
            )
            
            # Also notify all dashboard users for this website
            async_to_sync(channel_layer.group_send)(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'new_message',
                    'message': {
                        'id': str(message.id),
                        'content': message_content,
                        'role': 'assistant',
                        'conversation_id': conversation_id,
                        'timestamp': message.timestamp.isoformat(),
                        'is_manual': True,
                        'agent_id': request.user.id
                    },
                    'conversation_id': conversation_id,
                    'website_id': conversation.website.id
                }
            )
        
        return JsonResponse({
            'success': True,
            'message_id': str(message.id),
            'timestamp': message.timestamp.isoformat()
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON'
        }, status=400)
    except Exception as e:
        logger.error(f"Error sending manual response: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Internal server error'
        }, status=500)


@require_http_methods(["GET"])
@login_required
def get_conversation_messages(request, conversation_id):
    """
    API endpoint to get messages for a specific conversation
    """
    try:
        conversation = get_object_or_404(Conversation, id=conversation_id)
        
        # Check if user has access to this conversation's website
        if not hasattr(conversation.website, 'owner') or conversation.website.owner != request.user:
            return JsonResponse({
                'error': 'Access denied'
            }, status=403)
        
        # Get messages
        messages = conversation.messages.all().order_by('timestamp')
        
        messages_data = []
        for message in messages:
            messages_data.append({
                'id': str(message.id),
                'content': message.content,
                'role': message.role,
                'timestamp': message.timestamp.isoformat(),
                'is_manual': getattr(message, 'is_manual_response', False)
            })
        
        return JsonResponse(messages_data, safe=False)
        
    except Exception as e:
        logger.error(f"Error getting conversation messages: {e}")
        return JsonResponse({
            'error': 'Internal server error'
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def end_conversation(request, conversation_id):
    """
    API endpoint to end a conversation
    """
    try:
        conversation = get_object_or_404(Conversation, id=conversation_id)
        
        # Check if user has access to this conversation's website
        if not hasattr(conversation.website, 'owner') or conversation.website.owner != request.user:
            return JsonResponse({
                'error': 'Access denied'
            }, status=403)
        
        # Mark conversation as ended
        conversation.is_active = False
        conversation.ended_at = timezone.now()
        conversation.save()
        
        # Notify via WebSocket
        if channel_layer:
            # Notify the chatbot
            async_to_sync(channel_layer.group_send)(
                f'chat_{conversation_id}',
                {
                    'type': 'conversation_ended',
                    'conversation_id': conversation_id,
                    'message': 'This conversation has been ended by an agent.'
                }
            )
            
            # Notify dashboard users
            async_to_sync(channel_layer.group_send)(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'conversation_ended',
                    'conversation_id': conversation_id,
                    'website_id': conversation.website.id
                }
            )
        
        return JsonResponse({
            'success': True,
            'message': 'Conversation ended successfully'
        })
        
    except Exception as e:
        logger.error(f"Error ending conversation: {e}")
        return JsonResponse({
            'success': False,
            'error': 'Internal server error'
        }, status=500)


# URL patterns to add to your urls.py:
"""
from django.urls import path
from . import api_views

urlpatterns = [
    # ... existing patterns ...
    path('api/send_manual_response/', api_views.send_manual_response, name='send_manual_response'),
    path('api/conversations/<uuid:conversation_id>/messages/', api_views.get_conversation_messages, name='get_conversation_messages'),
    path('api/conversations/<uuid:conversation_id>/end/', api_views.end_conversation, name='end_conversation'),
]
"""
