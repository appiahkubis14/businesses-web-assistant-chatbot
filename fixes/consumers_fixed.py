import json
import logging
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from .models import Website, Conversation, Message
from .services import NotificationService

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for handling real-time chat with website visitors"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.conversation_id = None
        self.room_group_name = None
        self.website_id = None
        self.user_identifier = None
    
    async def connect(self):
        """Handle WebSocket connection for chatbot"""
        try:
            # Get parameters from URL route
            self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
            
            # Extract optional parameters with fallbacks
            self.website_id = self.scope['url_route']['kwargs'].get('website_id')
            self.user_identifier = self.scope['url_route']['kwargs'].get('user_identifier', 'Anonymous')
            
            # Try to get website_id from query string if not in URL path
            if not self.website_id:
                query_string = self.scope.get('query_string', b'').decode()
                if query_string:
                    from urllib.parse import parse_qs
                    params = parse_qs(query_string)
                    self.website_id = params.get('website_id', [None])[0]
                    if not self.user_identifier or self.user_identifier == 'Anonymous':
                        self.user_identifier = params.get('user_identifier', ['Anonymous'])[0]
            
            # Validate UUID format for conversation_id
            try:
                uuid.UUID(str(self.conversation_id))
            except ValueError:
                logger.error(f"Invalid UUID format for conversation_id: {self.conversation_id}")
                await self.close(code=4000)
                return
            
            self.room_group_name = f'chat_{self.conversation_id}'
            
            # Try to get existing conversation first
            conversation = await self.get_conversation(self.conversation_id)
            
            # If conversation exists or we have website_id, proceed with connection
            if conversation or self.website_id:
                # Join room group
                await self.channel_layer.group_add(
                    self.room_group_name,
                    self.channel_name
                )
                
                await self.accept()
                logger.info(f"Chat WebSocket connected for conversation {self.conversation_id}")
                
                # Send connection confirmation
                await self.send(text_data=json.dumps({
                    'type': 'connection_established',
                    'message': 'WebSocket connection established',
                    'conversation_id': str(self.conversation_id),
                    'status': 'success',
                    'requires_identification': not bool(conversation or self.website_id)
                }))
            else:
                # No existing conversation and no website_id - accept connection but require identification
                await self.channel_layer.group_add(
                    self.room_group_name,
                    self.channel_name
                )
                
                await self.accept()
                logger.info(f"Chat WebSocket connected for conversation {self.conversation_id} (pending identification)")
                
                # Send connection confirmation with identification requirement
                await self.send(text_data=json.dumps({
                    'type': 'connection_established',
                    'message': 'WebSocket connection established. Please identify yourself by sending an "identify" message with website_id.',
                    'conversation_id': str(self.conversation_id),
                    'status': 'success',
                    'requires_identification': True
                }))
            
        except Exception as e:
            logger.error(f"Error in Chat WebSocket connection: {e}")
            await self.close(code=4003)
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        try:
            if hasattr(self, 'room_group_name') and self.room_group_name:
                # Leave room group
                await self.channel_layer.group_discard(
                    self.room_group_name,
                    self.channel_name
                )
                logger.info(f"Chat WebSocket disconnected for conversation {self.conversation_id}, code: {close_code}")
        except Exception as e:
            logger.error(f"Error in WebSocket disconnection: {e}")
    
    async def receive(self, text_data):
        """Handle messages from WebSocket"""
        try:
            text_data_json = json.loads(text_data)
            print(f'Received message: {text_data_json}')
            message_type = text_data_json.get('type')
            
            if message_type == 'chat_message':
                await self.handle_chat_message(text_data_json)
            elif message_type == 'typing':
                await self.handle_typing_indicator(text_data_json)
            elif message_type == 'ping':
                await self.handle_ping(text_data_json)
            elif message_type == 'init_conversation':
                await self.handle_init_conversation(text_data_json)
            elif message_type == 'identify':
                await self.handle_identify(text_data_json)
            else:
                logger.warning(f"Unknown message type: {message_type}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}',
                    'code': 'UNKNOWN_MESSAGE_TYPE'
                }))
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format',
                'code': 'INVALID_JSON'
            }))
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error',
                'code': 'INTERNAL_ERROR'
            }))
    
    async def handle_identify(self, message_data):
        """Handle identification message with website_id and user_identifier"""
        website_id = message_data.get('website_id')
        user_identifier = message_data.get('user_identifier', 'Anonymous')
        metadata = message_data.get('metadata', {})
        
        if not website_id:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'website_id is required for identification',
                'code': 'MISSING_WEBSITE_ID'
            }))
            return
        
        try:
            # Validate UUID format for website_id
            uuid.UUID(str(website_id))
        except ValueError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid website_id format',
                'code': 'INVALID_WEBSITE_ID'
            }))
            return
        
        self.website_id = website_id
        self.user_identifier = user_identifier
        
        # Get or create conversation with the provided identification
        conversation = await self.get_or_create_conversation()
        if not conversation:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to identify conversation',
                'code': 'IDENTIFICATION_FAILED'
            }))
            return
        
        # Update conversation metadata if provided
        if metadata:
            await self.update_conversation_metadata(conversation, metadata)
        
        await self.send(text_data=json.dumps({
            'type': 'identified',
            'conversation_id': str(self.conversation_id),
            'website_id': str(self.website_id),
            'user_identifier': self.user_identifier,
            'status': 'success'
        }))
    
    async def handle_chat_message(self, message_data):
        """Handle incoming chat message from website visitor"""
        user_message = message_data.get('message', '').strip()
        metadata = message_data.get('metadata', {})
        
        if not user_message:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Empty message',
                'code': 'EMPTY_MESSAGE'
            }))
            return
        
        try:
            # Get conversation
            conversation = await self.get_conversation(self.conversation_id)
            if not conversation:
                # If conversation doesn't exist yet, check if we have identification
                if not self.website_id:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Please identify yourself first by sending an "identify" message with website_id',
                        'code': 'NOT_IDENTIFIED'
                    }))
                    return
                
                # Create conversation with stored identification
                conversation = await self.get_or_create_conversation()
                if not conversation:
                    logger.error(f"Conversation {self.conversation_id} not found and cannot be created")
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'Conversation not found. Please refresh the page and try again.',
                        'code': 'CONVERSATION_NOT_FOUND'
                    }))
                    return
            
            # Save user message
            user_msg = await self.save_message(conversation, 'user', user_message, metadata)
            
            # Mark conversation as requiring attention
            await self.mark_conversation_attention(conversation, True)
            
            # Update conversation metadata if provided
            if metadata:
                await self.update_conversation_metadata(conversation, metadata)
            
            # Notify dashboard about new user message
            await self.notify_dashboard_new_message(conversation, user_msg)
            
            # Send automatic response to user
            auto_response = "Thank you for your message. A support agent will respond to you shortly."
            
            # Save auto response
            assistant_msg = await self.save_message(conversation, 'assistant', auto_response, {
                'is_auto': True,
                'auto_response_type': 'acknowledgment'
            })
            
            # Send auto response to visitor immediately
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': auto_response,
                'role': 'assistant',
                'message_id': str(assistant_msg.id),
                'conversation_id': str(conversation.id),
                'timestamp': assistant_msg.timestamp.isoformat(),
                'is_auto': True
            }))
            
            logger.info(f"Processed user message in conversation {self.conversation_id}")
            
        except Exception as e:
            logger.error(f"Error processing chat message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Sorry, I encountered an error. Please try again.',
                'role': 'assistant',
                'is_error': True,
                'conversation_id': str(self.conversation_id),
                'timestamp': timezone.now().isoformat(),
                'code': 'MESSAGE_PROCESSING_ERROR'
            }))
    
    async def handle_typing_indicator(self, message_data):
        """Handle typing indicator"""
        is_typing = message_data.get('isTyping', False)
        metadata = message_data.get('metadata', {})
        
        try:
            conversation = await self.get_conversation(self.conversation_id)
            if not conversation:
                return
                
            # Broadcast typing indicator to dashboard
            await self.channel_layer.group_send(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'typing_indicator',
                    'is_typing': is_typing,
                    'conversation_id': str(self.conversation_id),
                    'user_type': 'visitor',
                    'metadata': metadata
                }
            )
        except Exception as e:
            logger.error(f"Error handling typing indicator: {e}")
    
    async def handle_ping(self, message_data):
        """Handle ping for connection keep-alive"""
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': message_data.get('timestamp'),
            'conversation_id': str(self.conversation_id)
        }))
    
    async def handle_init_conversation(self, message_data):
        """Handle conversation initialization with additional data"""
        website_id = message_data.get('website_id', self.website_id)
        user_identifier = message_data.get('user_identifier', self.user_identifier)
        metadata = message_data.get('metadata', {})
        
        if not website_id:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'website_id is required',
                'code': 'MISSING_WEBSITE_ID'
            }))
            return
        
        try:
            # Validate UUID format for website_id
            uuid.UUID(str(website_id))
        except ValueError:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid website_id format',
                'code': 'INVALID_WEBSITE_ID'
            }))
            return
        
        self.website_id = website_id
        self.user_identifier = user_identifier
        
        conversation = await self.get_or_create_conversation()
        if conversation:
            # Update conversation with additional metadata
            await self.update_conversation_metadata(conversation, metadata)
            await self.update_user_identifier(conversation, user_identifier)
            
            await self.send(text_data=json.dumps({
                'type': 'conversation_initialized',
                'conversation_id': str(self.conversation_id),
                'website_id': str(website_id),
                'user_identifier': user_identifier,
                'status': 'success'
            }))
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to initialize conversation',
                'code': 'INIT_ERROR'
            }))
    
    async def chat_message_from_dashboard(self, event):
        """Handle chat message sent from dashboard (agent response)"""
        message = event['message']
        message_id = event.get('message_id')
        role = event['role']
        conversation_id = event['conversation_id']
        timestamp = event.get('timestamp')
        is_manual = event.get('is_manual', True)
        
        # Only send to the specific conversation
        if conversation_id == str(self.conversation_id):
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': message,
                'message_id': message_id,
                'role': role,
                'conversation_id': conversation_id,
                'timestamp': timestamp or timezone.now().isoformat(),
                'is_manual': is_manual
            }))
    
    async def typing_from_dashboard(self, event):
        """Handle typing indicator from dashboard"""
        is_typing = event['is_typing']
        conversation_id = event['conversation_id']
        user_type = event.get('user_type', 'agent')
        
        # Only send to the specific conversation
        if conversation_id == str(self.conversation_id):
            await self.send(text_data=json.dumps({
                'type': 'typing_indicator',
                'is_typing': is_typing,
                'conversation_id': conversation_id,
                'user_type': user_type
            }))
    
    @database_sync_to_async
    def get_or_create_conversation(self):
        """Get or create conversation from database"""
        try:
            # First try to get existing conversation
            try:
                conversation = Conversation.objects.get(id=self.conversation_id)
                logger.info(f"Found existing conversation: {self.conversation_id}")
                return conversation
            except Conversation.DoesNotExist:
                # Create new conversation if it doesn't exist
                if not self.website_id:
                    logger.error(f"Cannot create conversation {self.conversation_id}: website_id not provided")
                    return None
                
                try:
                    website = Website.objects.get(id=self.website_id)
                except Website.DoesNotExist:
                    logger.error(f"Website {self.website_id} not found")
                    return None
                
                conversation = Conversation.objects.create(
                    id=self.conversation_id,
                    website=website,
                    user_identifier=self.user_identifier,
                    status='active'
                )
                logger.info(f"Created new conversation: {self.conversation_id} for website {self.website_id}")
                return conversation
                
        except Exception as e:
            logger.error(f"Error getting/creating conversation {self.conversation_id}: {e}")
            return None
    
    @database_sync_to_async
    def get_conversation(self, conversation_id):
        """Get conversation by ID"""
        try:
            return Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return None
    
    @database_sync_to_async
    def save_message(self, conversation, role, content, metadata=None):
        """Save message to database"""
        message = Message.objects.create(
            conversation=conversation,
            role=role,
            content=content,
            metadata=metadata or {}
        )
        # Update conversation total messages
        conversation.total_messages = conversation.messages.count()
        conversation.last_message_at = timezone.now()
        conversation.save()
        return message
    
    @database_sync_to_async
    def mark_conversation_attention(self, conversation, requires_attention):
        """Mark conversation as requiring attention"""
        conversation.requires_attention = requires_attention
        if requires_attention:
            conversation.last_attention_required_at = timezone.now()
        conversation.save()
    
    @database_sync_to_async
    def update_conversation_metadata(self, conversation, metadata):
        """Update conversation metadata"""
        if not conversation.metadata:
            conversation.metadata = {}
        
        conversation.metadata.update(metadata)
        conversation.save()
    
    @database_sync_to_async
    def update_user_identifier(self, conversation, user_identifier):
        """Update user identifier"""
        if user_identifier and user_identifier != 'Anonymous':
            conversation.user_identifier = user_identifier
            conversation.save()
    
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
                        'metadata': message.metadata or {}
                    },
                    'conversation_id': str(conversation.id),
                    'website_id': str(conversation.website.id)
                }
            )
            
            # Also send new conversation notification if this is the first message
            if conversation.total_messages == 1:
                await self.channel_layer.group_send(
                    f'dashboard_website_{conversation.website.id}',
                    {
                        'type': 'new_conversation',
                        'conversation': {
                            'id': str(conversation.id),
                            'website_name': conversation.website.name,
                            'website_id': str(conversation.website.id),
                            'user_identifier': conversation.user_identifier,
                            'started_at': conversation.started_at.isoformat(),
                            'total_messages': conversation.total_messages,
                            'requires_attention': conversation.requires_attention,
                            'metadata': conversation.metadata or {}
                        },
                        'website_id': str(conversation.website.id)
                    }
                )
            
            logger.info(f"Notified dashboard about new message in conversation {conversation.id}")
        except Exception as e:
            logger.error(f"Error notifying dashboard: {e}")


class DashboardConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for dashboard real-time updates"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user_id = None
        self.room_group_name = None
        self.subscribed_websites = set()
    
    async def connect(self):
        """Handle dashboard WebSocket connection"""
        try:
            # Check if user is authenticated
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                logger.warning("Unauthorized dashboard connection attempt")
                await self.close(code=4001)
                return
            
            self.user_id = user.id
            self.room_group_name = f'dashboard_user_{user.id}'
            self.subscribed_websites = set()
            
            # Join user-specific room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            
            # Auto-subscribe to user's websites
            await self.auto_subscribe_to_websites()
            
            await self.accept()
            logger.info(f"Dashboard WebSocket connected for user {user.id}")
            
            # Send connection confirmation
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': 'Dashboard WebSocket connection established',
                'user_id': user.id,
                'status': 'success'
            }))
            
        except Exception as e:
            logger.error(f"Error in Dashboard WebSocket connection: {e}")
            await self.close(code=4002)
    
    async def disconnect(self, close_code):
        """Handle dashboard WebSocket disconnection"""
        try:
            # Leave all website groups
            for website_id in self.subscribed_websites:
                website_group = f'dashboard_website_{website_id}'
                await self.channel_layer.group_discard(
                    website_group,
                    self.channel_name
                )
            
            # Leave user group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            
            logger.info(f"Dashboard WebSocket disconnected for user {self.user_id}, code: {close_code}")
            
        except Exception as e:
            logger.error(f"Error in Dashboard WebSocket disconnection: {e}")
    
    async def receive(self, text_data):
        """Handle messages from dashboard WebSocket"""
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            if message_type == 'subscribe_websites':
                await self.handle_subscribe_websites(text_data_json)
            elif message_type == 'unsubscribe_websites':
                await self.handle_unsubscribe_websites(text_data_json)
            elif message_type == 'send_message':
                await self.handle_send_message(text_data_json)
            elif message_type == 'typing':
                await self.handle_dashboard_typing(text_data_json)
            elif message_type == 'ping':
                await self.handle_ping(text_data_json)
            elif message_type == 'get_conversation_status':
                await self.handle_get_conversation_status(text_data_json)
            else:
                logger.warning(f"Unknown message type: {message_type}")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}',
                    'code': 'UNKNOWN_MESSAGE_TYPE'
                }))
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received in dashboard")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format',
                'code': 'INVALID_JSON'
            }))
        except Exception as e:
            logger.error(f"Error handling dashboard WebSocket message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error',
                'code': 'INTERNAL_ERROR'
            }))
    
    async def handle_subscribe_websites(self, message_data):
        """Subscribe to updates for specific websites"""
        website_ids = message_data.get('website_ids', [])
        
        for website_id in website_ids:
            try:
                uuid.UUID(str(website_id))
            except ValueError:
                logger.error(f"Invalid website ID format: {website_id}")
                continue
            
            website_group = f'dashboard_website_{website_id}'
            
            # Check if user has access to this website
            has_access = await self.check_website_access(website_id)
            if not has_access:
                logger.warning(f"User {self.user_id} attempted to subscribe to unauthorized website {website_id}")
                continue
            
            # Join website group
            await self.channel_layer.group_add(
                website_group,
                self.channel_name
            )
            
            self.subscribed_websites.add(website_id)
            logger.info(f"User {self.user_id} subscribed to website {website_id}")
        
        await self.send(text_data=json.dumps({
            'type': 'subscription_update',
            'subscribed_websites': list(self.subscribed_websites),
            'status': 'success'
        }))
    
    async def handle_unsubscribe_websites(self, message_data):
        """Unsubscribe from specific websites"""
        website_ids = message_data.get('website_ids', [])
        
        for website_id in website_ids:
            website_group = f'dashboard_website_{website_id}'
            
            # Leave website group
            await self.channel_layer.group_discard(
                website_group,
                self.channel_name
            )
            
            self.subscribed_websites.discard(website_id)
            logger.info(f"User {self.user_id} unsubscribed from website {website_id}")
        
        await self.send(text_data=json.dumps({
            'type': 'subscription_update',
            'subscribed_websites': list(self.subscribed_websites),
            'status': 'success'
        }))
    
    async def handle_send_message(self, message_data):
        """Handle sending message from dashboard to chatbot"""
        conversation_id = message_data.get('conversation_id')
        message_content = message_data.get('message', '').strip()
        metadata = message_data.get('metadata', {})
        
        if not conversation_id:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Missing conversation_id',
                'code': 'MISSING_CONVERSATION_ID'
            }))
            return
        
        if not message_content:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Empty message',
                'code': 'EMPTY_MESSAGE'
            }))
            return
        
        try:
            # Validate conversation access
            has_access = await self.check_conversation_access(conversation_id)
            if not has_access:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Access denied to conversation',
                    'code': 'ACCESS_DENIED'
                }))
                return
            
            # Save message to database
            message = await self.save_dashboard_message(conversation_id, message_content, metadata)
            
            # Send message to the specific chatbot conversation
            await self.channel_layer.group_send(
                f'chat_{conversation_id}',
                {
                    'type': 'chat_message_from_dashboard',
                    'message': message_content,
                    'message_id': str(message.id),
                    'role': 'assistant',
                    'conversation_id': conversation_id,
                    'timestamp': message.timestamp.isoformat(),
                    'is_manual': True,
                    'agent_id': self.user_id
                }
            )
            
            # Also notify all dashboard users for this website
            website_id = await self.get_website_id_from_conversation(conversation_id)
            if website_id:
                await self.channel_layer.group_send(
                    f'dashboard_website_{website_id}',
                    {
                        'type': 'new_message',
                        'message': {
                            'id': str(message.id),
                            'content': message_content,
                            'role': 'assistant',
                            'conversation_id': conversation_id,
                            'timestamp': message.timestamp.isoformat(),
                            'is_manual': True,
                            'agent_id': self.user_id,
                            'metadata': metadata
                        },
                        'conversation_id': conversation_id,
                        'website_id': str(website_id)
                    }
                )
            
            await self.send(text_data=json.dumps({
                'type': 'message_sent',
                'conversation_id': conversation_id,
                'message_id': str(message.id),
                'status': 'success'
            }))
            
        except Exception as e:
            logger.error(f"Error sending message from dashboard: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to send message',
                'code': 'SEND_MESSAGE_ERROR'
            }))
    
    async def handle_dashboard_typing(self, message_data):
        """Handle typing indicator from dashboard"""
        conversation_id = message_data.get('conversation_id')
        is_typing = message_data.get('is_typing', False)
        
        if not conversation_id:
            return
        
        try:
            # Validate conversation access
            has_access = await self.check_conversation_access(conversation_id)
            if not has_access:
                return
            
            # Send typing indicator to the specific chatbot conversation
            await self.channel_layer.group_send(
                f'chat_{conversation_id}',
                {
                    'type': 'typing_from_dashboard',
                    'is_typing': is_typing,
                    'conversation_id': conversation_id,
                    'agent_id': self.user_id
                }
            )
        except Exception as e:
            logger.error(f"Error handling dashboard typing: {e}")
    
    async def handle_ping(self, message_data):
        """Handle ping for connection keep-alive"""
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': message_data.get('timestamp'),
            'user_id': self.user_id
        }))
    
    async def handle_get_conversation_status(self, message_data):
        """Handle request for conversation status"""
        conversation_id = message_data.get('conversation_id')
        
        if not conversation_id:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Missing conversation_id',
                'code': 'MISSING_CONVERSATION_ID'
            }))
            return
        
        try:
            # Validate conversation access
            has_access = await self.check_conversation_access(conversation_id)
            if not has_access:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Access denied to conversation',
                    'code': 'ACCESS_DENIED'
                }))
                return
            
            conversation_status = await self.get_conversation_status(conversation_id)
            
            await self.send(text_data=json.dumps({
                'type': 'conversation_status',
                'conversation_id': conversation_id,
                'status': conversation_status,
                'timestamp': timezone.now().isoformat()
            }))
            
        except Exception as e:
            logger.error(f"Error getting conversation status: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to get conversation status',
                'code': 'STATUS_ERROR'
            }))
    
    # Handler methods for different types of group messages
    async def new_conversation(self, event):
        """Handle new conversation notification"""
        # Ensure UUID objects are converted to strings for JSON serialization
        conversation_data = event['conversation'].copy()
        conversation_data['id'] = str(conversation_data['id'])
        conversation_data['website_id'] = str(conversation_data['website_id'])
        
        await self.send(text_data=json.dumps({
            'type': 'new_conversation',
            'conversation': conversation_data,
            'website_id': str(event['website_id']),
            'timestamp': timezone.now().isoformat()
        }))
    
    async def new_message(self, event):
        """Handle new message notification (from chatbot or other agents)"""
        # Ensure UUID objects are converted to strings for JSON serialization
        message_data = event['message'].copy()
        message_data['id'] = str(message_data['id'])
        message_data['conversation_id'] = str(message_data['conversation_id'])
        
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': message_data,
            'conversation_id': str(event['conversation_id']),
            'website_id': str(event['website_id']),
            'timestamp': timezone.now().isoformat()
        }))

    async def conversation_ended(self, event):
        """Handle conversation ended notification"""
        await self.send(text_data=json.dumps({
            'type': 'conversation_ended',
            'conversation_id': str(event['conversation_id']),
            'website_id': str(event['website_id']),
            'timestamp': timezone.now().isoformat(),
            'reason': event.get('reason', 'user_ended')
        }))

    async def typing_indicator(self, event):
        """Handle typing indicator from chatbot"""
        await self.send(text_data=json.dumps({
            'type': 'typing_indicator',
            'is_typing': event['is_typing'],
            'conversation_id': str(event['conversation_id']),
            'user_type': event['user_type'],
            'timestamp': timezone.now().isoformat(),
            'metadata': event.get('metadata', {})
        }))

    async def conversation_updated(self, event):
        """Handle conversation update notification"""
        await self.send(text_data=json.dumps({
            'type': 'conversation_updated',
            'conversation_id': str(event['conversation_id']),
            'updates': event['updates'],
            'timestamp': timezone.now().isoformat()
        }))
    
    # Database operations
    @database_sync_to_async
    def get_user_websites(self):
        """Get all website IDs that belong to the user"""
        try:
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                return []
            
            # Get websites where user is owner or has access
            websites = Website.objects.filter(owner=user).values_list('id', flat=True)
            return [str(website_id) for website_id in websites]
        except Exception as e:
            logger.error(f"Error getting user websites: {e}")
            return []
    
    @database_sync_to_async
    def check_website_access(self, website_id):
        """Check if user has access to a specific website"""
        try:
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                return False
            
            return Website.objects.filter(id=website_id, owner=user).exists()
        except Exception as e:
            logger.error(f"Error checking website access: {e}")
            return False
    
    @database_sync_to_async
    def check_conversation_access(self, conversation_id):
        """Check if user has access to a specific conversation"""
        try:
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                return False
            
            return Conversation.objects.filter(
                id=conversation_id, 
                website__owner=user
            ).exists()
        except Exception as e:
            logger.error(f"Error checking conversation access: {e}")
            return False
    
    @database_sync_to_async
    def save_dashboard_message(self, conversation_id, content, metadata=None):
        """Save message from dashboard to database"""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            message = Message.objects.create(
                conversation=conversation,
                role='assistant',
                content=content,
                is_manual_response=True,
                metadata=metadata or {}
            )
            # Update conversation total messages and mark as not requiring attention
            conversation.total_messages = conversation.messages.count()
            conversation.last_message_at = timezone.now()
            conversation.requires_attention = False
            conversation.save()
            return message
        except Conversation.DoesNotExist:
            logger.error(f"Conversation {conversation_id} not found")
            raise Exception("Conversation not found")
    
    @database_sync_to_async
    def get_website_id_from_conversation(self, conversation_id):
        """Get website ID from conversation"""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            return str(conversation.website.id)
        except Conversation.DoesNotExist:
            return None
    
    @database_sync_to_async
    def get_conversation_status(self, conversation_id):
        """Get conversation status"""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            return {
                'status': conversation.status,
                'requires_attention': conversation.requires_attention,
                'total_messages': conversation.total_messages,
                'last_message_at': conversation.last_message_at.isoformat() if conversation.last_message_at else None,
                'user_identifier': conversation.user_identifier,
                'metadata': conversation.metadata or {}
            }
        except Conversation.DoesNotExist:
            return {'error': 'Conversation not found'}
    
    async def auto_subscribe_to_websites(self):
        """Auto-subscribe to all user's websites"""
        try:
            user_websites = await self.get_user_websites()
            for website_id in user_websites:
                website_group = f'dashboard_website_{website_id}'
                
                # Join website group
                await self.channel_layer.group_add(
                    website_group,
                    self.channel_name
                )
                
                self.subscribed_websites.add(website_id)
                logger.info(f"User {self.user_id} auto-subscribed to website {website_id}")
        except Exception as e:
            logger.error(f"Error auto-subscribing to websites: {e}")
