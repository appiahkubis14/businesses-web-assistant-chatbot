from rest_framework import serializers
from .models import Website, Conversation, Message, ChatbotAnalytics, APIKey


class WebsiteSerializer(serializers.ModelSerializer):
    """Serializer for Website model"""
    
    class Meta:
        model = Website
        fields = [
            'id', 'name', 'url', 'bot_name', 'welcome_message', 'theme', 'position',
            'enable_sound', 'show_typing_indicator', 'show_avatar', 'allow_minimize',
            'allow_close', 'auto_connect', 'max_messages', 'ai_model', 'ai_temperature',
            'ai_max_tokens', 'system_prompt', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_url(self, value):
        """Validate URL format"""
        if not value.startswith(('http://', 'https://')):
            raise serializers.ValidationError("URL must start with http:// or https://")
        return value
    
    def validate_ai_temperature(self, value):
        """Validate AI temperature range"""
        if not 0 <= value <= 2:
            raise serializers.ValidationError("AI temperature must be between 0 and 2")
        return value
    
    def validate_ai_max_tokens(self, value):
        """Validate AI max tokens"""
        if not 1 <= value <= 4000:
            raise serializers.ValidationError("AI max tokens must be between 1 and 4000")
        return value


class WebsiteConfigSerializer(serializers.ModelSerializer):
    """Serializer for website configuration (public data only)"""
    
    class Meta:
        model = Website
        fields = [
            'id', 'bot_name', 'welcome_message', 'theme', 'position',
            'enable_sound', 'show_typing_indicator', 'show_avatar',
            'allow_minimize', 'allow_close', 'auto_connect', 'max_messages'
        ]
        read_only_fields = fields
    
    def to_representation(self, instance):
        """Add additional configuration data"""
        data = super().to_representation(instance)
        data.update({
            'apiUrl': 'http://172.20.10.2:5000',  # This should be configurable
            'websiteId': str(instance.id),
        })
        return data


class MessageSerializer(serializers.ModelSerializer):
    """Serializer for Message model"""
    
    class Meta:
        model = Message
        fields = [
            'id', 'role', 'content', 'timestamp', 'is_error', 'is_welcome',
            'ai_model_used', 'response_time_ms', 'tokens_used','is_manual'
        ]
        read_only_fields = ['id', 'timestamp', 'ai_model_used', 'response_time_ms', 'tokens_used']


class ConversationSerializer(serializers.ModelSerializer):
    """Serializer for Conversation model"""
    messages = MessageSerializer(many=True, read_only=True)
    website_name = serializers.CharField(source='website.name', read_only=True)
    
    class Meta:
        model = Conversation
        fields = [
            'id', 'website', 'website_name', 'user_identifier', 'user_agent',
            'ip_address', 'started_at', 'ended_at', 'is_active', 'total_messages',
            'user_messages', 'bot_messages', 'messages'
        ]
        read_only_fields = [
            'id', 'started_at', 'ended_at', 'total_messages', 'user_messages', 'bot_messages'
        ]


class ConversationListSerializer(serializers.ModelSerializer):
    """Serializer for Conversation list (without messages)"""
    website_name = serializers.CharField(source='website.name', read_only=True)
    duration_minutes = serializers.SerializerMethodField()
    
    class Meta:
        model = Conversation
        fields = [
            'id', 'website', 'website_name', 'user_identifier', 'started_at',
            'ended_at', 'is_active', 'total_messages', 'user_messages',
            'bot_messages', 'duration_minutes','requires_attention'
        ]
        read_only_fields = fields
    
    def get_duration_minutes(self, obj):
        """Calculate conversation duration in minutes"""
        if obj.duration:
            return round(obj.duration.total_seconds() / 60, 2)
        return None


class ChatMessageSerializer(serializers.Serializer):
    """Serializer for chat API requests"""
    message = serializers.CharField(max_length=1000)
    conversationId = serializers.UUIDField(required=False)
    
    def validate_message(self, value):
        """Validate message content"""
        if not value.strip():
            raise serializers.ValidationError("Message cannot be empty")
        return value.strip()


class ChatResponseSerializer(serializers.Serializer):
    """Serializer for chat API responses"""
    response = serializers.CharField()
    conversationId = serializers.UUIDField()
    timestamp = serializers.DateTimeField()


class AnalyticsSerializer(serializers.ModelSerializer):
    """Serializer for ChatbotAnalytics model"""
    
    class Meta:
        model = ChatbotAnalytics
        fields = [
            'date', 'total_conversations', 'total_messages', 'unique_visitors',
            'avg_conversation_length', 'avg_response_time_ms',
            'conversations_with_multiple_messages', 'bounce_rate'
        ]
        read_only_fields = fields


class APIKeySerializer(serializers.ModelSerializer):
    """Serializer for APIKey model"""
    api_key = serializers.CharField(write_only=True)
    
    class Meta:
        model = APIKey
        fields = ['id', 'provider', 'api_key', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def to_representation(self, instance):
        """Hide API key in responses"""
        data = super().to_representation(instance)
        data['api_key'] = '***HIDDEN***'
        return data


class WebsiteSummarySerializer(serializers.Serializer):
    """Serializer for website summary statistics"""
    total_conversations = serializers.IntegerField()
    total_messages = serializers.IntegerField()
    total_visitors = serializers.IntegerField()
    avg_conversation_length = serializers.FloatField()
    avg_response_time = serializers.FloatField()
    avg_bounce_rate = serializers.FloatField()
    period_days = serializers.IntegerField()


class DashboardStatsSerializer(serializers.Serializer):
    """Serializer for dashboard statistics"""
    websites_count = serializers.IntegerField()
    total_conversations = serializers.IntegerField()
    total_messages = serializers.IntegerField()
    active_conversations = serializers.IntegerField()
    recent_conversations = ConversationListSerializer(many=True)
