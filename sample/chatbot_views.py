import json
import logging
import uuid
from datetime import datetime, timedelta
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.views.generic import ListView, DetailView, CreateView
from django.db.models import Q, Count, Avg
from django.utils import timezone
from django.core.paginator import Paginator
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from .models import Website, Conversation, Message, ChatbotAnalytics
from .serializers import WebsiteSerializer, ConversationSerializer, MessageSerializer
from .services import AnalyticsService, NotificationService
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)

# Public API Views (No Authentication Required)

@csrf_exempt
@require_http_methods(["GET"])
def get_website_config(request, website_id):
    """Get website configuration for chatbot widget"""
    try:
        website = get_object_or_404(Website, id=website_id, is_active=True)
        
        config = {
            'websiteId': str(website.id),
            'botName': website.bot_name,
            'welcomeMessage': website.welcome_message,
            'theme': website.theme,
            'position': website.position,
            'allowFileUpload': website.allow_file_upload,
            'collectUserInfo': website.collect_user_info,
            'showTypingIndicator': website.show_typing_indicator,
            'enableSound': website.enable_sound,
            'maxMessages': website.max_messages,
            'autoConnect': True,
            'showAvatar': True,
            'allowMinimize': True,
            'allowClose': True
        }
        
        return JsonResponse(config)
    except Exception as e:
        logger.error(f"Error getting website config: {e}")
        return JsonResponse({'error': 'Configuration not found'}, status=404)


@csrf_exempt
@require_http_methods(["POST"])
def chat_api(request, website_id):
    """Handle chat messages from website visitors (HTTP fallback)"""
    try:
        website = get_object_or_404(Website, id=website_id, is_active=True)
        
        data = json.loads(request.body)
        user_message = data.get('message', '').strip()
        conversation_id = data.get('conversationId')
        user_identifier = data.get('userIdentifier', 'Anonymous')
        
        if not user_message:
            return JsonResponse({'error': 'Message is required'}, status=400)
        
        # Get or create conversation
        if conversation_id:
            try:
                conversation = Conversation.objects.get(id=conversation_id, website=website)
            except Conversation.DoesNotExist:
                conversation = Conversation.objects.create(
                    website=website,
                    user_identifier=user_identifier
                )
        else:
            conversation = Conversation.objects.create(
                website=website,
                user_identifier=user_identifier
            )
        
        # Save user message
        user_msg = Message.objects.create(
            conversation=conversation,
            role='user',
            content=user_message
        )
        
        # Update conversation
        conversation.total_messages = conversation.messages.count()
        conversation.requires_attention = True
        conversation.save()
        
        # Notify dashboard
        try:
            NotificationService.notify_new_message(user_msg)
            
            # Notify new conversation if this is the first message
            if conversation.total_messages == 1:
                NotificationService.notify_new_conversation(conversation)
        except Exception as e:
            logger.error(f"Error sending notifications: {e}")
        
        # Return manual response
        response_message = "Thank you for your message. A support agent will respond to you shortly."
        
        return JsonResponse({
            'response': response_message,
            'conversationId': str(conversation.id),
            'timestamp': timezone.now().isoformat(),
            'is_manual': False
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error in chat API: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)


@require_http_methods(["GET"])
def serve_widget_script(request):
    """Serve the chatbot widget JavaScript file"""
    try:
        # Read the widget script from your static files or generate it dynamically
        script_content = """
        // Chatbot Widget Script - This would be your actual widget code
        console.log('Chatbot widget loaded');
        """
        
        response = HttpResponse(script_content, content_type='application/javascript')
        response['Cache-Control'] = 'max-age=3600'  # Cache for 1 hour
        return response
    except Exception as e:
        logger.error(f"Error serving widget script: {e}")
        return HttpResponse('// Error loading widget', content_type='application/javascript', status=500)


# Authenticated API Views

class WebsiteListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """List user's websites"""
        websites = Website.objects.filter(owner=request.user).order_by('-created_at')
        serializer = WebsiteSerializer(websites, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        """Create a new website"""
        serializer = WebsiteSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(owner=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WebsiteDetailView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get_object(self, pk, user):
        try:
            return Website.objects.get(pk=pk, owner=user)
        except Website.DoesNotExist:
            raise Http404
    
    def get(self, request, pk):
        website = self.get_object(pk, request.user)
        serializer = WebsiteSerializer(website)
        return Response(serializer.data)
    
    def put(self, request, pk):
        website = self.get_object(pk, request.user)
        serializer = WebsiteSerializer(website, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        website = self.get_object(pk, request.user)
        website.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationListView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, website_id):
        """List conversations for a website"""
        try:
            website = Website.objects.get(id=website_id, owner=request.user)
            conversations = Conversation.objects.filter(website=website).order_by('-started_at')
            
            # Pagination
            page = int(request.GET.get('page', 1))
            page_size = int(request.GET.get('page_size', 20))
            paginator = Paginator(conversations, page_size)
            
            page_conversations = paginator.get_page(page)
            serializer = ConversationSerializer(page_conversations, many=True)
            
            return Response({
                'results': serializer.data,
                'count': paginator.count,
                'num_pages': paginator.num_pages,
                'current_page': page,
                'has_next': page_conversations.has_next(),
                'has_previous': page_conversations.has_previous()
            })
        except Website.DoesNotExist:
            return Response({'error': 'Website not found'}, status=404)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        """Get conversation details with messages"""
        try:
            conversation = Conversation.objects.get(
                id=pk, 
                website__owner=request.user
            )
            serializer = ConversationSerializer(conversation)
            return Response(serializer.data)
        except Conversation.DoesNotExist:
            return Response({'error': 'Conversation not found'}, status=404)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_conversation_messages(request, conversation_id):
    """Get messages for a specific conversation"""
    try:
        conversation = Conversation.objects.get(
            id=conversation_id,
            website__owner=request.user
        )
        
        messages = conversation.messages.order_by('timestamp')
        serializer = MessageSerializer(messages, many=True)
        
        return Response({
            'conversation_id': str(conversation.id),
            'messages': serializer.data,
            'total_messages': messages.count()
        })
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=404)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_manual_response(request):
    """Send manual response from dashboard to visitor"""
    try:
        conversation_id = request.data.get('conversation_id')
        message_content = request.data.get('message', '').strip()
        
        if not conversation_id or not message_content:
            return Response({'error': 'conversation_id and message are required'}, status=400)
        
        # Get conversation
        conversation = Conversation.objects.get(
            id=conversation_id,
            website__owner=request.user
        )
        
        # Save manual response
        message = Message.objects.create(
            conversation=conversation,
            role='assistant',
            content=message_content,
            is_manual_response=True
        )
        
        # Update conversation
        conversation.total_messages = conversation.messages.count()
        conversation.requires_attention = False
        conversation.save()
        
        # Send via WebSocket to visitor
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'chat_{conversation_id}',
            {
                'type': 'chat_message_from_dashboard',
                'message': message_content,
                'role': 'assistant',
                'conversation_id': conversation_id,
                'timestamp': message.timestamp.isoformat(),
                'agent_id': request.user.id
            }
        )
        
        # Notify other dashboard users
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
        
        return Response({
            'message_id': str(message.id),
            'conversation_id': conversation_id,
            'timestamp': message.timestamp.isoformat(),
            'success': True
        })
        
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=404)
    except Exception as e:
        logger.error(f"Error sending manual response: {e}")
        return Response({'error': 'Internal server error'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def end_conversation(request, conversation_id):
    """End a conversation"""
    try:
        conversation = Conversation.objects.get(
            id=conversation_id,
            website__owner=request.user
        )
        
        conversation.is_active = False
        conversation.ended_at = timezone.now()
        conversation.save()
        
        # Notify visitor via WebSocket
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'chat_{conversation_id}',
            {
                'type': 'conversation_ended',
                'conversation_id': conversation_id,
                'message': 'This conversation has been ended by an agent.'
            }
        )
        
        # Notify dashboard
        async_to_sync(channel_layer.group_send)(
            f'dashboard_website_{conversation.website.id}',
            {
                'type': 'conversation_ended',
                'conversation_id': conversation_id,
                'website_id': conversation.website.id
            }
        )
        
        return Response({'success': True, 'message': 'Conversation ended'})
        
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=404)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_conversations(request):
    """Get all active conversations for user's websites"""
    try:
        user_websites = Website.objects.filter(owner=request.user)
        conversations = Conversation.objects.filter(
            website__in=user_websites,
            is_active=True
        ).select_related('website').prefetch_related('messages').order_by('-started_at')
        
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)
        
    except Exception as e:
        logger.error(f"Error getting active conversations: {e}")
        return Response({'error': 'Internal server error'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_conversation_ai(request, conversation_id):
    """Toggle AI responses for a conversation"""
    try:
        conversation = Conversation.objects.get(
            id=conversation_id,
            website__owner=request.user
        )
        
        conversation.ai_enabled = not conversation.ai_enabled
        conversation.save()
        
        return Response({
            'conversation_id': str(conversation.id),
            'ai_enabled': conversation.ai_enabled
        })
        
    except Conversation.DoesNotExist:
        return Response({'error': 'Conversation not found'}, status=404)


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, website_id):
        """Get analytics for a website"""
        try:
            website = Website.objects.get(id=website_id, owner=request.user)
            
            # Get date range from query params
            days = int(request.GET.get('days', 30))
            
            # Get summary statistics
            summary = AnalyticsService.get_website_summary(website, days)
            
            # Get daily analytics for chart data
            end_date = timezone.now().date()
            start_date = end_date - timedelta(days=days)
            
            daily_analytics = ChatbotAnalytics.objects.filter(
                website=website,
                date__range=[start_date, end_date]
            ).order_by('date')
            
            chart_data = []
            for analytics in daily_analytics:
                chart_data.append({
                    'date': analytics.date.isoformat(),
                    'conversations': analytics.total_conversations,
                    'messages': analytics.total_messages,
                    'visitors': analytics.unique_visitors
                })
            
            return Response({
                'summary': summary,
                'chart_data': chart_data,
                'period_days': days
            })
            
        except Website.DoesNotExist:
            return Response({'error': 'Website not found'}, status=404)


class SearchConversationsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Search conversations across all user's websites"""
        query = request.GET.get('q', '').strip()
        website_id = request.GET.get('website_id')
        
        conversations = Conversation.objects.filter(
            website__owner=request.user
        )
        
        if website_id:
            conversations = conversations.filter(website_id=website_id)
        
        if query:
            conversations = conversations.filter(
                Q(user_identifier__icontains=query) |
                Q(messages__content__icontains=query)
            ).distinct()
        
        conversations = conversations.order_by('-started_at')[:50]
        serializer = ConversationSerializer(conversations, many=True)
        
        return Response({
            'results': serializer.data,
            'query': query,
            'count': len(serializer.data)
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Get dashboard statistics for user"""
    try:
        user_websites = Website.objects.filter(owner=request.user)
        
        # Total stats
        total_websites = user_websites.count()
        total_conversations = Conversation.objects.filter(website__in=user_websites).count()
        active_conversations = Conversation.objects.filter(
            website__in=user_websites,
            is_active=True
        ).count()
        conversations_needing_attention = Conversation.objects.filter(
            website__in=user_websites,
            requires_attention=True,
            is_active=True
        ).count()
        
        # Today's stats
        today = timezone.now().date()
        today_conversations = Conversation.objects.filter(
            website__in=user_websites,
            started_at__date=today
        ).count()
        
        today_messages = Message.objects.filter(
            conversation__website__in=user_websites,
            timestamp__date=today
        ).count()
        
        return Response({
            'total_websites': total_websites,
            'total_conversations': total_conversations,
            'active_conversations': active_conversations,
            'conversations_needing_attention': conversations_needing_attention,
            'today_conversations': today_conversations,
            'today_messages': today_messages
        })
        
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        return Response({'error': 'Internal server error'}, status=500)


@api_view(['POST'])
@csrf_exempt
def save_contact_info(request):
    """Save visitor contact information"""
    try:
        data = json.loads(request.body)
        conversation_id = data.get('conversation_id')
        contact_info = data.get('contact_info', {})
        
        if not conversation_id:
            return JsonResponse({'error': 'conversation_id is required'}, status=400)
        
        conversation = get_object_or_404(Conversation, id=conversation_id)
        
        # Save contact info to conversation
        if 'email' in contact_info:
            conversation.visitor_email = contact_info['email']
        if 'name' in contact_info:
            conversation.visitor_name = contact_info['name']
        if 'phone' in contact_info:
            conversation.visitor_phone = contact_info['phone']
        
        conversation.save()
        
        return JsonResponse({'success': True, 'message': 'Contact information saved'})
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        logger.error(f"Error saving contact info: {e}")
        return JsonResponse({'error': 'Internal server error'}, status=500)


# Dashboard Views (HTML Templates)

@login_required
def live_chat_view(request):
    """Dashboard live chat view"""
    # Get active conversations for user's websites
    user_websites = Website.objects.filter(owner=request.user)
    active_conversations = Conversation.objects.filter(
        website__in=user_websites,
        is_active=True
    ).select_related('website').prefetch_related('messages').order_by('-started_at')
    
    context = {
        'active_conversations': active_conversations,
        'websites': user_websites
    }
    
    return render(request, 'chatbot/live_chat.html', context)


@login_required
def dashboard_view(request):
    """Main dashboard view"""
    # Get user's websites and basic stats
    user_websites = Website.objects.filter(owner=request.user)
    
    # Get dashboard stats
    total_conversations = Conversation.objects.filter(website__in=user_websites).count()
    active_conversations = Conversation.objects.filter(
        website__in=user_websites,
        is_active=True
    ).count()
    
    context = {
        'websites': user_websites,
        'total_conversations': total_conversations,
        'active_conversations': active_conversations
    }
    
    return render(request, 'chatbot/dashboard.html', context)
