import time
import logging
import openai
from django.conf import settings
from .models import ChatbotAnalytics, Website, Conversation, Message, APIKey

logger = logging.getLogger(__name__)


# class ChatbotService:
#     """Service for handling AI chatbot responses"""
    
#     def __init__(self, website):
#         self.website = website
#         self.client = None
#         self._setup_ai_client()
    
#     def _setup_ai_client(self):
#         """Setup AI client based on website configuration"""
#         try:
#             # Try to get API key from database
#             api_key_obj = APIKey.objects.filter(
#                 website=self.website,
#                 provider='openai',
#                 is_active=True
#             ).first()
            
#             if api_key_obj:
#                 api_key = api_key_obj.api_key
#             else:
#                 # Fallback to environment variable
#                 api_key = getattr(settings, 'OPENAI_API_KEY', None)
            
#             if api_key:
#                 openai.api_key = api_key
#                 self.client = openai
#                 logger.info(f"OpenAI client initialized for website {self.website.id}")
#             else:
#                 logger.warning(f"No OpenAI API key found for website {self.website.id}")
                
#         except Exception as e:
#             logger.error(f"Error setting up AI client: {e}")
    
#     def generate_response(self, user_message, conversation):
#         """Generate AI response for user message"""
#         start_time = time.time()
        
#         try:
#             if not self.client:
#                 return self._get_fallback_response()
            
#             # Prepare conversation history
#             messages = self._prepare_conversation_history(conversation, user_message)
            
#             # Generate response using OpenAI
#             response = self.client.chat.completions.create(
#                 model=self.website.ai_model,
#                 messages=messages,
#                 temperature=self.website.ai_temperature,
#                 max_tokens=self.website.ai_max_tokens,
#             )
            
#             ai_response = response.choices[0].message.content.strip()
#             response_time = int((time.time() - start_time) * 1000)
#             logger.info(f"Generated AI response in {response_time}ms")

#             if not ai_response or ai_response.strip() == "":
#                 conversation.requires_attention = True
#                 conversation.save()
#                 NotificationService.notify_conversation_updated(conversation)
            
#             return ai_response
            
#         except Exception as e:
#             logger.error(f"Error generating AI response: {e}")
#             conversation.requires_attention = True
#             conversation.save()
#             NotificationService.notify_conversation_updated(conversation)
#             return self._get_error_response()
    
#     def _prepare_conversation_history(self, conversation, current_message):
#         """Prepare conversation history for AI model"""
#         messages = [
#             {"role": "system", "content": self.website.system_prompt}
#         ]
        
#         # Get recent messages from conversation (limit to save tokens)
#         recent_messages = conversation.messages.filter(
#             role__in=['user', 'assistant']
#         ).order_by('-timestamp')[:10]
        
#         # Add messages in chronological order
#         for msg in reversed(recent_messages):
#             messages.append({
#                 "role": msg.role,
#                 "content": msg.content
#             })
        
#         # Add current user message
#         messages.append({
#             "role": "user",
#             "content": current_message
#         })
        
#         return messages
    
#     def _get_fallback_response(self):
#             """Return fallback response when manual chat is enabled"""
#             return "Thank you for your message. A support agent will respond to you shortly."
        
#     def _get_error_response(self):
#         """Return error response"""
#         return "I apologize, but I'm having trouble processing your request right now. Please try again later."


import time
import logging
from django.conf import settings
from .models import ChatbotAnalytics, Website, Conversation, Message, APIKey

logger = logging.getLogger(__name__)


class ChatbotService:
    """Service for handling chatbot responses - AI disabled for manual chat"""
    
    def __init__(self, website):
        self.website = website
    
    def generate_response(self, user_message, conversation):
        """Manual response generation - AI is disabled"""
        # Return a placeholder message instead of None
        return self._get_fallback_response()
    
    def _prepare_conversation_history(self, conversation, current_message):
        """Prepare conversation history for AI model"""
        messages = [
            {"role": "system", "content": self.website.system_prompt}
        ]
        
        # Get recent messages from conversation (limit to save tokens)
        recent_messages = conversation.messages.filter(
            role__in=['user', 'assistant']
        ).order_by('-timestamp')[:10]
        
        # Add messages in chronological order
        for msg in reversed(recent_messages):
            messages.append({
                "role": msg.role,
                "content": msg.content
            })
        
        # Add current user message
        messages.append({
            "role": "user",
            "content": current_message
        })
        
        return messages
    
    def _get_fallback_response(self):
        """Return fallback response when manual chat is enabled"""
        return "Thank you for your message. A support agent will respond to you shortly."
        
    def _get_error_response(self):
        """Return error response"""
        return "I apologize, but I'm having trouble processing your request right now. Please try again later."






#######################################################################################################################################################################################
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
    def notify_new_conversation(conversation):
        """Notify dashboard about new conversation"""
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        
        # Notify website owner
        group_name = f'dashboard_{conversation.website.owner.id}'
        
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'new_conversation',
                'conversation': {
                    'id': str(conversation.id),
                    'website_name': conversation.website.name,
                    'started_at': conversation.started_at.isoformat(),
                    'user_identifier': conversation.user_identifier,
                },
                'website_id': str(conversation.website.id)
            }
        )
    
    @staticmethod
    def notify_new_message(message):
        """Notify dashboard about new message"""
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        
        # Notify website owner
        group_name = f'dashboard_{message.conversation.website.owner.id}'
        
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'new_message',
                'message': {
                    'id': str(message.id),
                    'role': message.role,
                    'content': message.content,
                    'timestamp': message.timestamp.isoformat(),
                },
                'conversation_id': str(message.conversation.id),
                'website_id': str(message.conversation.website.id)
            }
        )


##################################################################################################


# In services.py, update or add NotificationService
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

class NotificationService:
    @staticmethod
    def notify_new_message(message):
        """Notify dashboard about new message"""
        try:
            channel_layer = get_channel_layer()
            conversation = message.conversation
            
            async_to_sync(channel_layer.group_send)(
                f'dashboard_{conversation.website.owner.id}',
                {
                    'type': 'send_notification',
                    'message': {
                        'type': 'new_message',
                        'conversation_id': str(conversation.id),
                        'message': {
                            'id': str(message.id),
                            'role': message.role,
                            'content': message.content,
                            'timestamp': message.timestamp.isoformat(),
                            'is_manual': message.is_manual
                        }
                    }
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
                f'dashboard_{conversation.website.owner.id}',
                {
                    'type': 'send_notification',
                    'message': {
                        'type': 'new_conversation',
                        'conversation': {
                            'id': str(conversation.id),
                            'website': {
                                'id': str(conversation.website.id),
                                'name': conversation.website.name
                            },
                            'user_identifier': conversation.user_identifier,
                            'started_at': conversation.started_at.isoformat(),
                            'total_messages': conversation.messages.count(),
                            'requires_attention': conversation.requires_attention
                        }
                    }
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
                f'dashboard_{conversation.website.owner.id}',
                {
                    'type': 'send_notification',
                    'message': {
                        'type': 'conversation_updated',
                        'conversation_id': str(conversation.id),
                        'requires_attention': conversation.requires_attention
                    }
                }
            )
        except Exception as e:
            logger.error(f"Error sending conversation update: {e}")

    @staticmethod
    def notify_dashboard_message(message):
        """Notify dashboard about manual message (for UI update only)"""
        try:
            channel_layer = get_channel_layer()
            conversation = message.conversation
            
            async_to_sync(channel_layer.group_send)(
                f'dashboard_{conversation.website.owner.id}',
                {
                    'type': 'send_notification',
                    'message': {
                        'type': 'dashboard_message',
                        'conversation_id': str(conversation.id),
                        'message': {
                            'id': str(message.id),
                            'role': message.role,
                            'content': message.content,
                            'timestamp': message.timestamp.isoformat(),
                            'is_manual': message.is_manual
                        }
                    }
                }
            )
        except Exception as e:
            logger.error(f"Error sending dashboard message notification: {e}")