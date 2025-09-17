import time
import logging
from django.conf import settings
from .models import ChatbotAnalytics, Website, Conversation, Message, APIKey
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


class ChatbotService:
    """Service for handling chatbot responses - Manual chat only"""
    
    def __init__(self, website):
        self.website = website
    
    def generate_response(self, user_message, conversation):
        """Manual response generation - AI is disabled"""
        # Return a placeholder message
        return self._get_fallback_response()
    
    def _get_fallback_response(self):
        """Return fallback response when manual chat is enabled"""
        return "Thank you for your message. A support agent will respond to you shortly."
        
    def _get_error_response(self):
        """Return error response"""
        return "I apologize, but I'm having trouble processing your request right now. Please try again later."


class AnalyticsService:
    """Service for handling analytics calculations"""
    
    @staticmethod
    def calculate_daily_analytics(website, date):
        """Calculate analytics for a specific website and date"""
        from django.db.models import Avg, Count
        from .models import ChatbotAnalytics
        
        conversations = Conversation.objects.filter(
            website=website,
            started_at__date=date
        )
        
        messages = Message.objects.filter(
            conversation__website=website,
            timestamp__date=date
        )
        
        # Calculate metrics
        total_conversations = conversations.count()
        total_messages = messages.count()
        unique_visitors = conversations.values('user_identifier').distinct().count()
        
        # Average conversation length (in messages)
        avg_conversation_length = conversations.aggregate(
            avg_length=Avg('total_messages')
        )['avg_length'] or 0
        
        # Average response time (from Message model)
        avg_response_time = messages.filter(
            role='assistant',
            response_time_ms__isnull=False
        ).aggregate(
            avg_time=Avg('response_time_ms')
        )['avg_time'] or 0
        
        # Conversations with multiple messages
        conversations_with_multiple = conversations.filter(
            total_messages__gt=1
        ).count()
        
        # Bounce rate (single message conversations)
        bounce_rate = 0
        if total_conversations > 0:
            single_message_conversations = conversations.filter(
                total_messages=1
            ).count()
            bounce_rate = (single_message_conversations / total_conversations) * 100
        
        # Create or update analytics record
        analytics, created = ChatbotAnalytics.objects.get_or_create(
            website=website,
            date=date,
            defaults={
                'total_conversations': total_conversations,
                'total_messages': total_messages,
                'unique_visitors': unique_visitors,
                'avg_conversation_length': avg_conversation_length,
                'avg_response_time_ms': avg_response_time,
                'conversations_with_multiple_messages': conversations_with_multiple,
                'bounce_rate': bounce_rate,
            }
        )
        
        if not created:
            # Update existing record
            analytics.total_conversations = total_conversations
            analytics.total_messages = total_messages
            analytics.unique_visitors = unique_visitors
            analytics.avg_conversation_length = avg_conversation_length
            analytics.avg_response_time_ms = avg_response_time
            analytics.conversations_with_multiple_messages = conversations_with_multiple
            analytics.bounce_rate = bounce_rate
            analytics.save()
        
        return analytics
    
    @staticmethod
    def get_website_summary(website, days=30):
        """Get summary statistics for a website"""
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Sum, Avg
        
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)
        
        analytics = ChatbotAnalytics.objects.filter(
            website=website,
            date__range=[start_date, end_date]
        )
        
        summary = analytics.aggregate(
            total_conversations=Sum('total_conversations'),
            total_messages=Sum('total_messages'),
            total_visitors=Sum('unique_visitors'),
            avg_conversation_length=Avg('avg_conversation_length'),
            avg_response_time=Avg('avg_response_time_ms'),
            avg_bounce_rate=Avg('bounce_rate')
        )
        
        return {
            'total_conversations': summary['total_conversations'] or 0,
            'total_messages': summary['total_messages'] or 0,
            'total_visitors': summary['total_visitors'] or 0,
            'avg_conversation_length': round(summary['avg_conversation_length'] or 0, 2),
            'avg_response_time': round(summary['avg_response_time'] or 0, 2),
            'avg_bounce_rate': round(summary['avg_bounce_rate'] or 0, 2),
            'period_days': days,
        }


class NotificationService:
    """Service for handling real-time notifications"""
    
    @staticmethod
    def notify_new_message(message):
        """Notify dashboard about new message"""
        try:
            channel_layer = get_channel_layer()
            conversation = message.conversation
            
            async_to_sync(channel_layer.group_send)(
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
        except Exception as e:
            logger.error(f"Error sending notification: {e}")

    @staticmethod
    def notify_new_conversation(conversation):
        """Notify dashboard about new conversation"""
        try:
            channel_layer = get_channel_layer()
            
            async_to_sync(channel_layer.group_send)(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'new_conversation',
                    'conversation': {
                        'id': str(conversation.id),
                        'website_name': conversation.website.name,
                        'website_id': str(conversation.website.id),
                        'user_identifier': conversation.user_identifier or 'Anonymous',
                        'started_at': conversation.started_at.isoformat(),
                        'total_messages': conversation.total_messages,
                        'requires_attention': conversation.requires_attention
                    },
                    'website_id': conversation.website.id
                }
            )
        except Exception as e:
            logger.error(f"Error sending conversation notification: {e}")

    @staticmethod
    def notify_conversation_updated(conversation):
        """Notify dashboard about conversation update"""
        try:
            channel_layer = get_channel_layer()
            
            async_to_sync(channel_layer.group_send)(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'conversation_updated',
                    'conversation_id': str(conversation.id),
                    'requires_attention': conversation.requires_attention,
                    'website_id': conversation.website.id
                }
            )
        except Exception as e:
            logger.error(f"Error sending conversation update: {e}")
