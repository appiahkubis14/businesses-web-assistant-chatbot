import json
import logging
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for handling chat between website visitors and the system
    URL pattern: ws/chat/{website_id}/{conversation_id}/{user_identifier}/
    """
    
    async def connect(self):
        """Handle WebSocket connection"""
        try:
            # Extract parameters from URL
            self.website_id = self.scope['url_route']['kwargs']['website_id']
            self.conversation_id = self.scope['url_route']['kwargs'].get('conversation_id')
            self.user_identifier = self.scope['url_route']['kwargs'].get('user_identifier', 'anonymous')
            
            # Validate website exists and is active
            website = await self.get_website(self.website_id)
            if not website:
                await self.close()
                return
            
            self.website = website
            
            # Create conversation group name
            self.conversation_group_name = f'chat_{self.conversation_id}' if self.conversation_id else None
            self.website_group_name = f'website_{self.website_id}'
            
            # Join groups
            if self.conversation_group_name:
                await self.channel_layer.group_add(
                    self.conversation_group_name,
                    self.channel_name
                )
            
            await self.channel_layer.group_add(
                self.website_group_name,
                self.channel_name
            )
            
            # Accept connection
            await self.accept()
            
            # Send connection confirmation
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': 'Connected to chat service',
                'website_id': str(self.website_id),
                'conversation_id': str(self.conversation_id) if self.conversation_id else None
            }))
            
            logger.info(f"Chat WebSocket connected: website={self.website_id}, conversation={self.conversation_id}")
            
        except Exception as e:
            logger.error(f"Error connecting to chat WebSocket: {e}")
            await self.close()
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        try:
            # Leave groups
            if hasattr(self, 'conversation_group_name') and self.conversation_group_name:
                await self.channel_layer.group_discard(
                    self.conversation_group_name,
                    self.channel_name
                )
            
            if hasattr(self, 'website_group_name'):
                await self.channel_layer.group_discard(
                    self.website_group_name,
                    self.channel_name
                )
                
            logger.info(f"Chat WebSocket disconnected: code={close_code}")
            
        except Exception as e:
            logger.error(f"Error disconnecting chat WebSocket: {e}")
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
                return
            
            elif message_type == 'identify':
                # Handle client identification
                await self.handle_identify(data)
                return
            
            elif message_type == 'chat_message':
                # Handle chat message
                await self.handle_chat_message(data)
                return
            
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received in chat WebSocket")
            await self.send_error("Invalid message format")
        except Exception as e:
            logger.error(f"Error handling chat WebSocket message: {e}")
            await self.send_error("Internal server error")
    
    async def handle_identify(self, data):
        """Handle client identification"""
        try:
            website_id = data.get('website_id')
            user_identifier = data.get('user_identifier')
            metadata = data.get('metadata', {})
            
            # Store identification info
            self.user_identifier = user_identifier
            self.metadata = metadata
            
            await self.send(text_data=json.dumps({
                'type': 'identified',
                'message': 'Successfully identified'
            }))
            
        except Exception as e:
            logger.error(f"Error handling identification: {e}")
            await self.send_error("Identification failed")
    
    async def handle_chat_message(self, data):
        """Handle incoming chat message from visitor"""
        try:
            message_content = data.get('message', '').strip()
            conversation_id = data.get('conversationId')
            metadata = data.get('metadata', {})
            
            if not message_content:
                await self.send_error("Message cannot be empty")
                return
            
            # Get or create conversation
            conversation = await self.get_or_create_conversation(
                conversation_id, 
                self.user_identifier, 
                metadata
            )
            
            if not conversation:
                await self.send_error("Failed to create conversation")
                return
            
            # Update conversation group if needed
            new_group_name = f'chat_{conversation.id}'
            if self.conversation_group_name != new_group_name:
                # Leave old group and join new one
                if self.conversation_group_name:
                    await self.channel_layer.group_discard(
                        self.conversation_group_name,
                        self.channel_name
                    )
                
                self.conversation_group_name = new_group_name
                await self.channel_layer.group_add(
                    self.conversation_group_name,
                    self.channel_name
                )
            
            # Save user message
            user_message = await self.save_message(
                conversation, 
                'user', 
                message_content
            )
            
            # Generate AI response (using the service)
            ai_response = await self.generate_ai_response(conversation, message_content)
            
            # Save AI response
            ai_message = await self.save_message(
                conversation, 
                'assistant', 
                ai_response
            )
            
            # Send response back to visitor
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'role': 'assistant',
                'message': ai_response,
                'conversation_id': str(conversation.id),
                'timestamp': ai_message.timestamp.isoformat(),
                'is_manual': False
            }))
            
            # Notify dashboard users
            await self.notify_dashboard_new_message(user_message)
            await self.notify_dashboard_new_message(ai_message)
            
            # If this is a new conversation, notify about that too
            if conversation.total_messages <= 2:  # Welcome + first user message
                await self.notify_dashboard_new_conversation(conversation)
            
        except Exception as e:
            logger.error(f"Error handling chat message: {e}")
            await self.send_error("Failed to process message")
    
    async def send_error(self, message):
        """Send error message to client"""
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': message
        }))
    
    # Group message handlers (for messages from dashboard)
    async def chat_message_from_dashboard(self, event):
        """Handle manual message from dashboard agent"""
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'role': 'assistant',
            'message': event['message'],
            'conversation_id': event['conversation_id'],
            'timestamp': event['timestamp'],
            'is_manual': True,
            'agent_id': event.get('agent_id')
        }))
    
    async def conversation_ended(self, event):
        """Handle conversation end notification"""
        await self.send(text_data=json.dumps({
            'type': 'conversation_ended',
            'conversation_id': event['conversation_id'],
            'message': event['message']
        }))
    
    async def config_updated(self, event):
        """Handle website configuration updates"""
        await self.send(text_data=json.dumps({
            'type': 'config_updated',
            'config': event['config']
        }))
    
    # Database operations
    @database_sync_to_async
    def get_website(self, website_id):
        """Get website by ID"""
        try:
            from .models import Website
            return Website.objects.get(id=website_id, is_active=True)
        except ObjectDoesNotExist:
            return None
    
    @database_sync_to_async
    def get_or_create_conversation(self, conversation_id, user_identifier, metadata):
        """Get or create conversation"""
        try:
            from .models import Conversation
            
            if conversation_id:
                try:
                    conversation = Conversation.objects.get(
                        id=conversation_id, 
                        website=self.website
                    )
                    return conversation
                except ObjectDoesNotExist:
                    pass
            
            # Create new conversation
            conversation = Conversation.objects.create(
                website=self.website,
                user_identifier=user_identifier or 'Anonymous',
                user_agent=metadata.get('user_agent', ''),
                ip_address=self.get_client_ip()
            )
            
            return conversation
            
        except Exception as e:
            logger.error(f"Error creating conversation: {e}")
            return None
    
    @database_sync_to_async
    def save_message(self, conversation, role, content):
        """Save message to database"""
        try:
            from .models import Message
            
            message = Message.objects.create(
                conversation=conversation,
                role=role,
                content=content,
                is_manual=(role == 'assistant' and hasattr(self, 'is_manual_response'))
            )
            
            return message
            
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            return None
    
    @database_sync_to_async
    def generate_ai_response(self, conversation, user_message):
        """Generate AI response using the chatbot service"""
        try:
            from .services import ChatbotService
            
            service = ChatbotService(self.website)
            response = service.generate_response(user_message, conversation)
            
            return response or "Thank you for your message. A support agent will respond to you shortly."
            
        except Exception as e:
            logger.error(f"Error generating AI response: {e}")
            return "I apologize, but I'm having trouble processing your request right now. Please try again later."
    
    async def notify_dashboard_new_message(self, message):
        """Notify dashboard about new message"""
        try:
            dashboard_group = f'dashboard_{self.website.owner.id}'
            
            await self.channel_layer.group_send(dashboard_group, {
                'type': 'send_notification',
                'message': {
                    'type': 'new_message',
                    'conversation_id': str(message.conversation.id),
                    'message': {
                        'id': str(message.id),
                        'role': message.role,
                        'content': message.content,
                        'timestamp': message.timestamp.isoformat(),
                        'is_manual': message.is_manual
                    }
                }
            })
            
        except Exception as e:
            logger.error(f"Error notifying dashboard: {e}")
    
    async def notify_dashboard_new_conversation(self, conversation):
        """Notify dashboard about new conversation"""
        try:
            dashboard_group = f'dashboard_{self.website.owner.id}'
            
            await self.channel_layer.group_send(dashboard_group, {
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
                        'total_messages': conversation.total_messages,
                        'requires_attention': conversation.requires_attention
                    }
                }
            })
            
        except Exception as e:
            logger.error(f"Error notifying dashboard about new conversation: {e}")
    
    def get_client_ip(self):
        """Get client IP address"""
        x_forwarded_for = self.scope.get('headers', {}).get(b'x-forwarded-for')
        if x_forwarded_for:
            ip = x_forwarded_for.decode('utf-8').split(',')[0].strip()
        else:
            ip = self.scope.get('client', [''])[0]
        return ip


class DashboardConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for dashboard real-time updates
    URL pattern: ws/dashboard/
    Requires authentication
    """
    
    async def connect(self):
        """Handle WebSocket connection"""
        try:
            # Check authentication
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                await self.close()
                return
            
            self.user = user
            self.group_name = f'dashboard_{user.id}'
            
            # Join dashboard group
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
            
            # Accept connection
            await self.accept()
            
            # Send initial data
            await self.send_initial_data()
            
            logger.info(f"Dashboard WebSocket connected: user={user.id}")
            
        except Exception as e:
            logger.error(f"Error connecting to dashboard WebSocket: {e}")
            await self.close()
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        try:
            if hasattr(self, 'group_name'):
                await self.channel_layer.group_discard(
                    self.group_name,
                    self.channel_name
                )
            logger.info(f"Dashboard WebSocket disconnected: code={close_code}")
            
        except Exception as e:
            logger.error(f"Error disconnecting dashboard WebSocket: {e}")
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
                return
            
            elif message_type == 'send_manual_message':
                await self.handle_manual_message(data)
                return
            
            elif message_type == 'end_conversation':
                await self.handle_end_conversation(data)
                return
            
            elif message_type == 'update_website_config':
                await self.handle_config_update(data)
                return
            
            else:
                logger.warning(f"Unknown dashboard message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received in dashboard WebSocket")
        except Exception as e:
            logger.error(f"Error handling dashboard WebSocket message: {e}")
    
    async def handle_manual_message(self, data):
        """Handle manual message from dashboard agent"""
        try:
            conversation_id = data.get('conversation_id')
            message_content = data.get('message', '').strip()
            
            if not conversation_id or not message_content:
                return
            
            # Verify user owns this conversation
            conversation = await self.get_user_conversation(conversation_id)
            if not conversation:
                return
            
            # Save manual message
            message = await self.save_manual_message(
                conversation, 
                message_content
            )
            
            if message:
                # Send to visitor via chat WebSocket
                await self.channel_layer.group_send(
                    f'chat_{conversation_id}',
                    {
                        'type': 'chat_message_from_dashboard',
                        'message': message_content,
                        'conversation_id': conversation_id,
                        'timestamp': message.timestamp.isoformat(),
                        'agent_id': self.user.id
                    }
                )
                
                # Update conversation status
                await self.update_conversation_attention(conversation, False)
                
                # Notify other dashboard users
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'send_notification',
                        'message': {
                            'type': 'manual_message_sent',
                            'conversation_id': conversation_id,
                            'message': {
                                'id': str(message.id),
                                'content': message_content,
                                'timestamp': message.timestamp.isoformat(),
                                'agent_id': self.user.id,
                                'agent_name': self.user.get_full_name() or self.user.username
                            }
                        }
                    }
                )
            
        except Exception as e:
            logger.error(f"Error handling manual message: {e}")
    
    async def handle_end_conversation(self, data):
        """Handle conversation end request"""
        try:
            conversation_id = data.get('conversation_id')
            
            if not conversation_id:
                return
            
            # Verify user owns this conversation
            conversation = await self.get_user_conversation(conversation_id)
            if not conversation:
                return
            
            # End conversation
            await self.end_conversation(conversation)
            
            # Notify visitor
            await self.channel_layer.group_send(
                f'chat_{conversation_id}',
                {
                    'type': 'conversation_ended',
                    'conversation_id': conversation_id,
                    'message': 'This conversation has been ended by an agent.'
                }
            )
            
            # Notify dashboard
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'send_notification',
                    'message': {
                        'type': 'conversation_ended',
                        'conversation_id': conversation_id
                    }
                }
            )
            
        except Exception as e:
            logger.error(f"Error ending conversation: {e}")
    
    async def handle_config_update(self, data):
        """Handle website configuration update"""
        try:
            website_id = data.get('website_id')
            config = data.get('config', {})
            
            if not website_id:
                return
            
            # Verify user owns this website
            website = await self.get_user_website(website_id)
            if not website:
                return
            
            # Update website configuration
            updated_website = await self.update_website_config(website, config)
            
            if updated_website:
                # Notify all visitors on this website about config change
                await self.channel_layer.group_send(
                    f'website_{website_id}',
                    {
                        'type': 'config_updated',
                        'config': updated_website.get_config()
                    }
                )
            
        except Exception as e:
            logger.error(f"Error updating website config: {e}")
    
    async def send_initial_data(self):
        """Send initial dashboard data"""
        try:
            # Get active conversations
            active_conversations = await self.get_active_conversations()
            
            await self.send(text_data=json.dumps({
                'type': 'initial_data',
                'active_conversations': active_conversations
            }))
            
        except Exception as e:
            logger.error(f"Error sending initial data: {e}")
    
    # Group message handlers
    async def send_notification(self, event):
        """Send notification to dashboard"""
        await self.send(text_data=json.dumps({
            'type': 'notification',
            'data': event['message']
        }))
    
    # Database operations
    @database_sync_to_async
    def get_user_conversation(self, conversation_id):
        """Get conversation owned by user"""
        try:
            from .models import Conversation
            return Conversation.objects.get(
                id=conversation_id,
                website__owner=self.user
            )
        except ObjectDoesNotExist:
            return None
    
    @database_sync_to_async
    def get_user_website(self, website_id):
        """Get website owned by user"""
        try:
            from .models import Website
            return Website.objects.get(
                id=website_id,
                owner=self.user
            )
        except ObjectDoesNotExist:
            return None
    
    @database_sync_to_async
    def save_manual_message(self, conversation, content):
        """Save manual message from dashboard"""
        try:
            from .models import Message
            
            message = Message.objects.create(
                conversation=conversation,
                role='assistant',
                content=content,
                is_manual=True
            )
            
            return message
            
        except Exception as e:
            logger.error(f"Error saving manual message: {e}")
            return None
    
    @database_sync_to_async
    def update_conversation_attention(self, conversation, requires_attention):
        """Update conversation attention status"""
        try:
            conversation.requires_attention = requires_attention
            conversation.save()
            return True
        except Exception as e:
            logger.error(f"Error updating conversation attention: {e}")
            return False
    
    @database_sync_to_async
    def end_conversation(self, conversation):
        """End conversation"""
        try:
            conversation.is_active = False
            conversation.ended_at = timezone.now()
            conversation.save()
            return True
        except Exception as e:
            logger.error(f"Error ending conversation: {e}")
            return False
    
    @database_sync_to_async
    def update_website_config(self, website, config):
        """Update website configuration"""
        try:
            # Update allowed fields
            allowed_fields = [
                'bot_name', 'welcome_message', 'theme', 'position',
                'enable_sound', 'show_typing_indicator', 'show_avatar',
                'allow_minimize', 'allow_close', 'max_messages'
            ]
            
            for field in allowed_fields:
                if field in config:
                    setattr(website, field, config[field])
            
            website.save()
            return website
            
        except Exception as e:
            logger.error(f"Error updating website config: {e}")
            return None
    
    @database_sync_to_async
    def get_active_conversations(self):
        """Get active conversations for user"""
        try:
            from .models import Conversation, Website
            from .serializers import ConversationListSerializer
            
            user_websites = Website.objects.filter(owner=self.user)
            conversations = Conversation.objects.filter(
                website__in=user_websites,
                is_active=True
            ).select_related('website').order_by('-started_at')[:50]
            
            serializer = ConversationListSerializer(conversations, many=True)
            return serializer.data
            
        except Exception as e:
            logger.error(f"Error getting active conversations: {e}")
            return []