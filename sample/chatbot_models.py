import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Website(models.Model):
    """Model representing a website where the chatbot is installed"""
    
    THEME_CHOICES = [
        ('blue', 'Blue'),
        ('green', 'Green'),
        ('purple', 'Purple'),
        ('red', 'Red'),
    ]
    
    POSITION_CHOICES = [
        ('bottom-right', 'Bottom Right'),
        ('bottom-left', 'Bottom Left'),
        ('top-right', 'Top Right'),
        ('top-left', 'Top Left'),
    ]
    
    AI_MODEL_CHOICES = [
        ('gpt-3.5-turbo', 'GPT-3.5 Turbo'),
        ('gpt-4', 'GPT-4'),
        ('gpt-4-turbo', 'GPT-4 Turbo'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='websites')
    name = models.CharField(max_length=200)
    domain = models.URLField(help_text="Website domain where the chatbot will be installed")
    
    # Chatbot Configuration
    bot_name = models.CharField(max_length=100, default='AI Assistant')
    welcome_message = models.TextField(
        default="Hi! I'm your AI assistant. How can I help you today?",
        help_text="First message shown to visitors"
    )
    system_prompt = models.TextField(
        default="You are a helpful customer service assistant. Be polite, professional, and helpful.",
        help_text="System prompt for AI model"
    )
    
    # UI Configuration
    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default='green')
    position = models.CharField(max_length=20, choices=POSITION_CHOICES, default='bottom-right')
    
    # Feature Flags
    is_active = models.BooleanField(default=True)
    allow_file_upload = models.BooleanField(default=False)
    collect_user_info = models.BooleanField(default=True)
    show_typing_indicator = models.BooleanField(default=True)
    enable_sound = models.BooleanField(default=True)
    
    # Limits
    max_messages = models.PositiveIntegerField(default=50)
    
    # AI Configuration
    ai_model = models.CharField(max_length=50, choices=AI_MODEL_CHOICES, default='gpt-3.5-turbo')
    ai_temperature = models.FloatField(default=0.7, help_text="Controls AI response randomness (0.0-1.0)")
    ai_max_tokens = models.PositiveIntegerField(default=500, help_text="Maximum tokens for AI response")
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Website'
        verbose_name_plural = 'Websites'
    
    def __str__(self):
        return f"{self.name} ({self.domain})"
    
    @property
    def total_conversations(self):
        return self.conversations.count()
    
    @property
    def active_conversations(self):
        return self.conversations.filter(is_active=True).count()


class Conversation(models.Model):
    """Model representing a conversation between a visitor and the chatbot"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='conversations')
    user_identifier = models.CharField(max_length=255, blank=True, null=True, help_text="Anonymous user identifier")
    
    # Conversation state
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    total_messages = models.PositiveIntegerField(default=0)
    requires_attention = models.BooleanField(default=False, help_text="Flagged for human review")
    
    # Visitor information (optional)
    visitor_name = models.CharField(max_length=200, blank=True, null=True)
    visitor_email = models.EmailField(blank=True, null=True)
    visitor_phone = models.CharField(max_length=20, blank=True, null=True)
    
    # AI Configuration
    ai_enabled = models.BooleanField(default=False, help_text="Enable AI responses for this conversation")
    
    class Meta:
        ordering = ['-started_at']
        verbose_name = 'Conversation'
        verbose_name_plural = 'Conversations'
        indexes = [
            models.Index(fields=['website', 'is_active']),
            models.Index(fields=['website', 'started_at']),
            models.Index(fields=['requires_attention']),
        ]
    
    def __str__(self):
        return f"Conversation {self.id} - {self.website.name}"
    
    def end_conversation(self):
        """Mark conversation as ended"""
        self.is_active = False
        self.ended_at = timezone.now()
        self.save()
    
    @property
    def duration(self):
        """Get conversation duration"""
        if self.ended_at:
            return self.ended_at - self.started_at
        return timezone.now() - self.started_at
    
    @property
    def last_message_at(self):
        """Get timestamp of last message"""
        last_message = self.messages.order_by('-timestamp').first()
        return last_message.timestamp if last_message else self.started_at


class Message(models.Model):
    """Model representing a single message in a conversation"""
    
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
        ('system', 'System'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    # Response metadata
    is_manual_response = models.BooleanField(default=False, help_text="Response sent manually by agent")
    response_time_ms = models.PositiveIntegerField(blank=True, null=True, help_text="Response time in milliseconds")
    
    # File attachment (if enabled)
    attachment = models.FileField(upload_to='chatbot_attachments/', blank=True, null=True)
    
    class Meta:
        ordering = ['timestamp']
        verbose_name = 'Message'
        verbose_name_plural = 'Messages'
        indexes = [
            models.Index(fields=['conversation', 'timestamp']),
            models.Index(fields=['role', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.role}: {self.content[:50]}..."


class APIKey(models.Model):
    """Model for storing API keys for different AI providers"""
    
    PROVIDER_CHOICES = [
        ('openai', 'OpenAI'),
        ('anthropic', 'Anthropic'),
        ('google', 'Google'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='api_keys')
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES)
    api_key = models.CharField(max_length=500, help_text="Encrypted API key")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['website', 'provider']
        verbose_name = 'API Key'
        verbose_name_plural = 'API Keys'
    
    def __str__(self):
        return f"{self.website.name} - {self.provider}"


class ChatbotAnalytics(models.Model):
    """Model for storing daily analytics data"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name='analytics')
    date = models.DateField()
    
    # Daily metrics
    total_conversations = models.PositiveIntegerField(default=0)
    total_messages = models.PositiveIntegerField(default=0)
    unique_visitors = models.PositiveIntegerField(default=0)
    
    # Calculated metrics
    avg_conversation_length = models.FloatField(default=0.0)
    avg_response_time_ms = models.FloatField(default=0.0)
    conversations_with_multiple_messages = models.PositiveIntegerField(default=0)
    bounce_rate = models.FloatField(default=0.0, help_text="Percentage of single-message conversations")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['website', 'date']
        ordering = ['-date']
        verbose_name = 'Chatbot Analytics'
        verbose_name_plural = 'Chatbot Analytics'
        indexes = [
            models.Index(fields=['website', 'date']),
        ]
    
    def __str__(self):
        return f"{self.website.name} - {self.date}"


class ChatbotSettings(models.Model):
    """Global settings for the chatbot system"""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Rate limiting
    max_messages_per_hour = models.PositiveIntegerField(default=100)
    max_conversations_per_ip = models.PositiveIntegerField(default=5)
    
    # Security
    allowed_domains = models.TextField(
        blank=True,
        help_text="Comma-separated list of allowed domains for CORS"
    )
    require_domain_verification = models.BooleanField(default=True)
    
    # Features
    enable_analytics = models.BooleanField(default=True)
    enable_file_uploads = models.BooleanField(default=False)
    max_file_size_mb = models.PositiveIntegerField(default=10)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Chatbot Settings'
        verbose_name_plural = 'Chatbot Settings'
    
    def __str__(self):
        return "Chatbot Settings"
