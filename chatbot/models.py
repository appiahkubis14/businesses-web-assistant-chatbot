import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Website(models.Model):
    """Model to represent a website that has a chatbot installed"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    url = models.URLField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='websites')
    
    # Configuration
    bot_name = models.CharField(max_length=100, default='AI Assistant')
    welcome_message = models.TextField(default="Hi! I'm your AI assistant. How can I help you today?")
    theme = models.CharField(
        max_length=20,
        choices=[
            ('green', 'Green'),
            ('blue', 'Blue'),
            ('purple', 'Purple'),
            ('red', 'Red'),
            ('orange', 'Orange'),
        ],
        default='green'
    )
    position = models.CharField(
        max_length=20,
        choices=[
            ('bottom-right', 'Bottom Right'),
            ('bottom-left', 'Bottom Left'),
            ('top-right', 'Top Right'),
            ('top-left', 'Top Left'),
        ],
        default='bottom-right'
    )
    
    # Features
    enable_sound = models.BooleanField(default=True)
    show_typing_indicator = models.BooleanField(default=True)
    show_avatar = models.BooleanField(default=True)
    allow_minimize = models.BooleanField(default=True)
    allow_close = models.BooleanField(default=True)
    auto_connect = models.BooleanField(default=True)
    max_messages = models.IntegerField(default=50)
    
    # AI Configuration
    ai_model = models.CharField(max_length=100, default='gpt-3.5-turbo')
    ai_temperature = models.FloatField(default=0.7)
    ai_max_tokens = models.IntegerField(default=500)
    system_prompt = models.TextField(
        default="You are a helpful AI assistant. Be friendly, helpful, and concise in your responses."
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        
    def __str__(self):
        return f"{self.name} ({self.url})"
    
    def get_config(self):
        """Return configuration for the chatbot widget"""
        return {
            'websiteId': str(self.id),
            'apiUrl': 'http://172.20.10.2:5000',  # This should be configurable
            'botName': self.bot_name,
            'welcomeMessage': self.welcome_message,
            'theme': self.theme,
            'position': self.position,
            'enableSound': self.enable_sound,
            'showTypingIndicator': self.show_typing_indicator,
            'showAvatar': self.show_avatar,
            'allowMinimize': self.allow_minimize,
            'allowClose': self.allow_close,
            'autoConnect': self.auto_connect,
            'maxMessages': self.max_messages,
        }


class Conversation(models.Model):
    """Model to represent a conversation session"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='conversations')
    user_identifier = models.CharField(max_length=255, blank=True, null=True)  # IP or session ID
    user_agent = models.TextField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    
    # Session info
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    # Analytics
    total_messages = models.IntegerField(default=0)
    user_messages = models.IntegerField(default=0)
    bot_messages = models.IntegerField(default=0)

    requires_attention = models.BooleanField(default=False)
    
    def end_conversation(self):
        self.is_active = False
        self.ended_at = timezone.now()
        self.save()
    
    class Meta:
        ordering = ['-started_at']
        
    def __str__(self):
        return f"Conversation {self.id} - {self.website.name}"
    
    def end_conversation(self):
        """Mark conversation as ended"""
        self.ended_at = timezone.now()
        self.is_active = False
        self.save()
    
    @property
    def duration(self):
        """Calculate conversation duration"""
        if self.ended_at:
            return self.ended_at - self.started_at
        return timezone.now() - self.started_at


class Message(models.Model):
    """Model to represent individual messages in a conversation"""
    
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    
    # Metadata
    timestamp = models.DateTimeField(auto_now_add=True)
    is_error = models.BooleanField(default=False)
    is_welcome = models.BooleanField(default=False)
    
    # AI Response metadata
    ai_model_used = models.CharField(max_length=100, blank=True, null=True)
    response_time_ms = models.IntegerField(blank=True, null=True)
    is_manual = models.BooleanField(default=False)
    tokens_used = models.IntegerField(blank=True, null=True)
    
    class Meta:
        ordering = ['timestamp']
        
    def __str__(self):
        return f"{self.role}: {self.content[:50]}..."
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update conversation statistics
        self.conversation.total_messages = self.conversation.messages.count()
        self.conversation.user_messages = self.conversation.messages.filter(role='user').count()
        self.conversation.bot_messages = self.conversation.messages.filter(role='assistant').count()
        self.conversation.save()


class ChatbotAnalytics(models.Model):
    """Model to store analytics data"""
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='analytics')
    date = models.DateField()
    
    # Daily metrics
    total_conversations = models.IntegerField(default=0)
    total_messages = models.IntegerField(default=0)
    unique_visitors = models.IntegerField(default=0)
    avg_conversation_length = models.FloatField(default=0.0)
    avg_response_time_ms = models.FloatField(default=0.0)
    
    # Engagement metrics
    conversations_with_multiple_messages = models.IntegerField(default=0)
    bounce_rate = models.FloatField(default=0.0)  # Percentage of single-message conversations
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['website', 'date']
        ordering = ['-date']
        
    def __str__(self):
        return f"Analytics for {self.website.name} on {self.date}"


class APIKey(models.Model):
    """Model to store API keys for different AI providers"""
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='api_keys')
    provider = models.CharField(
        max_length=50,
        choices=[
            ('openai', 'OpenAI'),
            ('anthropic', 'Anthropic'),
            ('cohere', 'Cohere'),
            ('huggingface', 'Hugging Face'),
        ]
    )
    api_key = models.CharField(max_length=500)  # Encrypted in production
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['website', 'provider']
        
    def __str__(self):
        return f"{self.provider} API Key for {self.website.name}"
