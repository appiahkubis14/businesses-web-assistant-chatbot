from rest_framework import serializers
from .models import Website, Conversation, Message, ChatbotAnalytics


class WebsiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Website
        fields = [
            'id', 'name', 'domain', 'bot_name', 'welcome_message',
            'system_prompt', 'theme', 'position', 'is_active',
            'allow_file_upload', 'collect_user_info', 'show_typing_indicator',
            'enable_sound', 'max_messages', 'ai_model', 'ai_temperature',
            'ai_max_tokens', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            'id', 'role', 'content', 'timestamp', 'is_manual_response',
            'response_time_ms'
        ]
        read_only_fields = ['id', 'timestamp']


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    website_name = serializers.CharField(source='website.name', read_only=True)
    
    class Meta:
        model = Conversation
        fields = [
            'id', 'website', 'website_name', 'user_identifier', 'started_at',
            'ended_at', 'is_active', 'total_messages', 'requires_attention',
            'visitor_name', 'visitor_email', 'visitor_phone', 'ai_enabled',
            'messages'
        ]
        read_only_fields = ['id', 'started_at', 'total_messages']


class ChatbotAnalyticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatbotAnalytics
        fields = [
            'id', 'website', 'date', 'total_conversations', 'total_messages',
            'unique_visitors', 'avg_conversation_length', 'avg_response_time_ms',
            'conversations_with_multiple_messages', 'bounce_rate'
        ]
        read_only_fields = ['id']
