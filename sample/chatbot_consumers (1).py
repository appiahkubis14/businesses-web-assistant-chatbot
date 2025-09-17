import json
import logging
import uuid
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth.models import AnonymousUser
from .models import Website, Conversation, Message
from .services import NotificationService

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for handling real-time chat with website visitors"""
    
    async def connect(self):
        """Handle WebSocket connection for chatbot"""
        try:
            self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
            
            # Validate UUID format
            try:
                uuid.UUID(str(self.conversation_id))
            except ValueError:
                logger.error(f"Invalid UUID format: {self.conversation_id}")
                await self.close()
                return
            
            self.room_group_name = f'chat_{self.conversation_id}'
            
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
                'conversation_id': self.conversation_id
            }))
            
        except Exception as e:
            logger.error(f"Error in Chat WebSocket connection: {e}")
            await self.close()
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        try:
            # Leave room group
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            logger.info(f"Chat WebSocket disconnected for conversation {self.conversation_id}")
        except Exception as e:
            logger.error(f"Error in WebSocket disconnection: {e}")
    
    async def receive(self, text_data):
        """Handle messages from WebSocket"""
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            if message_type == 'chat_message':
                await self.handle_chat_message(text_data_json)
            elif message_type == 'typing':
                await self.handle_typing_indicator(text_data_json)
            elif message_type == 'ping':
                # Handle ping for connection keep-alive
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': text_data_json.get('timestamp')
                }))
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format'
            }))
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))
    
    async def handle_chat_message(self, message_data):
        """Handle incoming chat message from website visitor"""
        user_message = message_data.get('message', '').strip()
        conversation_id = message_data.get('conversationId', self.conversation_id)
        
        if not user_message:
            return
        
        try:
            # Get conversation (it should already exist from HTTP API)
            conversation = await self.get_or_create_conversation(conversation_id)
            if not conversation:
                logger.error(f"Conversation {conversation_id} not found - this should have been created via HTTP API first")
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': 'Conversation not found. Please refresh the page and try again.',
                    'code': 'CONVERSATION_NOT_FOUND'
                }))
                return
            
            # Save user message
            user_msg = await self.save_message(conversation, 'user', user_message)
            
            # Mark conversation as requiring attention
            await self.mark_conversation_attention(conversation, True)
            
            # Notify dashboard about new user message
            await self.notify_dashboard_new_message(conversation, user_msg)
            
            # Send automatic response to user
            auto_response = "Thank you for your message. A support agent will respond to you shortly."
            
            # Send auto response to visitor
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': auto_response,
                'role': 'assistant',
                'conversation_id': str(conversation.id),
                'timestamp': self.get_current_timestamp(),
                'is_auto': True
            }))
            
        except Exception as e:
            logger.error(f"Error processing chat message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Sorry, I encountered an error. Please try again.',
                'role': 'assistant',
                'is_error': True,
                'conversation_id': self.conversation_id,
                'timestamp': self.get_current_timestamp()
            }))
    
    async def handle_typing_indicator(self, message_data):
        """Handle typing indicator"""
        is_typing = message_data.get('isTyping', False)
        conversation_id = message_data.get('conversationId', self.conversation_id)
        
        try:
            # Get conversation to find website_id
            conversation = await self.get_or_create_conversation(conversation_id)
            if not conversation:
                return
                
            # Broadcast typing indicator to dashboard
            await self.channel_layer.group_send(
                f'dashboard_website_{conversation.website.id}',
                {
                    'type': 'typing_indicator',
                    'is_typing': is_typing,
                    'conversation_id': conversation_id,
                    'user_type': 'visitor'
                }
            )
        except Exception as e:
            logger.error(f"Error handling typing indicator: {e}")
    
    async def chat_message_from_dashboard(self, event):
        """Handle chat message sent from dashboard (agent response)"""
        message = event['message']
        role = event['role']
        conversation_id = event['conversation_id']
        
        # Only send to the specific conversation
        if conversation_id == self.conversation_id:
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'message': message,
                'role': role,
                'conversation_id': conversation_id,
                'timestamp': event.get('timestamp', self.get_current_timestamp()),
                'is_manual': True  # Indicate this is a manual response from agent
            }))
    
    async def typing_from_dashboard(self, event):
        """Handle typing indicator from dashboard"""
        is_typing = event['is_typing']
        conversation_id = event['conversation_id']
        
        # Only send to the specific conversation
        if conversation_id == self.conversation_id:
            await self.send(text_data=json.dumps({
                'type': 'typing_indicator',
                'is_typing': is_typing,
                'conversation_id': conversation_id,
                'user_type': 'agent'
            }))
    
    @database_sync_to_async
    def get_or_create_conversation(self, conversation_id):
        """Get or create conversation from database"""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            return conversation
        except Conversation.DoesNotExist:
            logger.warning(f"Conversation {conversation_id} not found, attempting to create it")
            # Try to create the conversation if we have website info
            # This is a fallback in case the conversation wasn't created via HTTP API
            try:
                # We need a way to determine the website_id
                # For now, we'll return None and handle this in the calling code
                return None
            except Exception as e:
                logger.error(f"Error creating conversation {conversation_id}: {e}")
                return None
    
    @database_sync_to_async
    def save_message(self, conversation, role, content):
        """Save message to database"""
        message = Message.objects.create(
            conversation=conversation,
            role=role,
            content=content
        )
        # Update conversation total messages
        conversation.total_messages = conversation.messages.count()
        conversation.save()
        return message
    
    @database_sync_to_async
    def mark_conversation_attention(self, conversation, requires_attention):
        """Mark conversation as requiring attention"""
        conversation.requires_attention = requires_attention
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
                        'is_manual': getattr(message, 'is_manual_response', False)
                    },
                    'conversation_id': str(conversation.id),
                    'website_id': conversation.website.id
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
                            'user_identifier': conversation.user_identifier or 'Anonymous',
                            'started_at': conversation.started_at.isoformat(),
                            'total_messages': conversation.total_messages,
                            'requires_attention': conversation.requires_attention
                        },
                        'website_id': conversation.website.id
                    }
                )
            
            logger.info(f"Notified dashboard about new message in conversation {conversation.id}: {message.content[:50]}...")
        except Exception as e:
            logger.error(f"Error notifying dashboard: {e}")
    
    def get_current_timestamp(self):
        """Get current timestamp in ISO format"""
        from django.utils import timezone
        return timezone.now().isoformat()


class DashboardConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for dashboard real-time updates"""
    
    async def connect(self):
        """Handle dashboard WebSocket connection"""
        try:
            # Check if user is authenticated
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                await self.close()
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
                'user_id': user.id
            }))
            
        except Exception as e:
            logger.error(f"Error in Dashboard WebSocket connection: {e}")
            await self.close()
    
    async def disconnect(self, close_code):
        """Handle dashboard WebSocket disconnection"""
        try:
            # Leave all website groups
            for website_id in getattr(self, 'subscribed_websites', []):
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
            
            logger.info(f"Dashboard WebSocket disconnected for user {self.user_id}")
            
        except Exception as e:
            logger.error(f"Error in Dashboard WebSocket disconnection: {e}")
    
    async def receive(self, text_data):
        """Handle messages from dashboard WebSocket"""
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            if message_type == 'subscribe_websites':
                # Subscribe to specific website conversations
                website_ids = text_data_json.get('website_ids', [])
                await self.subscribe_to_websites(website_ids)
            
            elif message_type == 'send_message':
                # Send message from dashboard to chatbot
                await self.handle_send_message(text_data_json)
            
            elif message_type == 'typing':
                # Send typing indicator from dashboard
                await self.handle_dashboard_typing(text_data_json)
            
            elif message_type == 'ping':
                # Handle ping for connection keep-alive
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                    'timestamp': text_data_json.get('timestamp')
                }))
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received in dashboard")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Invalid message format'
            }))
        except Exception as e:
            logger.error(f"Error handling dashboard WebSocket message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Internal server error'
            }))
    
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
    
    async def subscribe_to_websites(self, website_ids):
        """Subscribe to updates for specific websites"""
        if not hasattr(self, 'subscribed_websites'):
            self.subscribed_websites = set()
        
        for website_id in website_ids:
            website_group = f'dashboard_website_{website_id}'
            
            # Join website group
            await self.channel_layer.group_add(
                website_group,
                self.channel_name
            )
            
            self.subscribed_websites.add(website_id)
            logger.info(f"User {self.user_id} subscribed to website {website_id}")
    
    async def handle_send_message(self, message_data):
        """Handle sending message from dashboard to chatbot"""
        conversation_id = message_data.get('conversation_id')
        message_content = message_data.get('message', '').strip()
        
        if not conversation_id or not message_content:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Missing conversation_id or message'
            }))
            return
        
        try:
            # Save message to database
            message = await self.save_dashboard_message(conversation_id, message_content)
            
            # Send message to the specific chatbot conversation
            await self.channel_layer.group_send(
                f'chat_{conversation_id}',
                {
                    'type': 'chat_message_from_dashboard',
                    'message': message_content,
                    'role': 'assistant',
                    'conversation_id': conversation_id,
                    'timestamp': self.get_current_timestamp(),
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
                            'agent_id': self.user_id
                        },
                        'conversation_id': conversation_id,
                        'website_id': website_id
                    }
                )
            
            await self.send(text_data=json.dumps({
                'type': 'message_sent',
                'conversation_id': conversation_id,
                'message_id': str(message.id)
            }))
            
        except Exception as e:
            logger.error(f"Error sending message from dashboard: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Failed to send message'
            }))
    
    async def handle_dashboard_typing(self, message_data):
        """Handle typing indicator from dashboard"""
        conversation_id = message_data.get('conversation_id')
        is_typing = message_data.get('is_typing', False)
        
        if not conversation_id:
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
    
    # Handler methods for different types of group messages
    async def new_conversation(self, event):
        """Handle new conversation notification"""
        await self.send(text_data=json.dumps({
            'type': 'new_conversation',
            'conversation': event['conversation'],
            'website_id': event['website_id']
        }))
    
    async def new_message(self, event):
        """Handle new message notification (from chatbot or other agents)"""
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': event['message'],
            'conversation_id': event['conversation_id'],
            'website_id': event['website_id']
        }))
    
    async def conversation_ended(self, event):
        """Handle conversation ended notification"""
        await self.send(text_data=json.dumps({
            'type': 'conversation_ended',
            'conversation_id': event['conversation_id'],
            'website_id': event['website_id']
        }))
    
    async def typing_indicator(self, event):
        """Handle typing indicator from chatbot"""
        await self.send(text_data=json.dumps({
            'type': 'typing_indicator',
            'is_typing': event['is_typing'],
            'conversation_id': event['conversation_id'],
            'user_type': event['user_type']
        }))
    
    # Database operations
    @database_sync_to_async
    def get_user_websites(self):
        """Get all website IDs that belong to the user"""
        try:
            user = self.scope.get('user')
            if not user or user.is_anonymous:
                return []
            
            # Assuming user owns websites or has access to them
            # Adjust this query based on your model relationships
            websites = Website.objects.filter(owner=user).values_list('id', flat=True)
            return list(websites)
        except Exception as e:
            logger.error(f"Error getting user websites: {e}")
            return []
    
    @database_sync_to_async
    def save_dashboard_message(self, conversation_id, content):
        """Save message from dashboard to database"""
        try:
            conversation = Conversation.objects.get(id=conversation_id)
            message = Message.objects.create(
                conversation=conversation,
                role='assistant',
                content=content,
                is_manual_response=True
            )
            # Update conversation total messages and mark as not requiring attention
            conversation.total_messages = conversation.messages.count()
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
            return conversation.website.id
        except Conversation.DoesNotExist:
            return None
    
    def get_current_timestamp(self):
        """Get current timestamp in ISO format"""
        from django.utils import timezone
        return timezone.now().isoformat()
