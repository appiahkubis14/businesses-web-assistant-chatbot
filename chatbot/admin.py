from django.contrib import admin
from django.utils.html import format_html
from .models import Website, Conversation, Message, ChatbotAnalytics, APIKey


@admin.register(Website)
class WebsiteAdmin(admin.ModelAdmin):
    list_display = ['name', 'url', 'owner', 'is_active', 'theme', 'created_at']
    list_filter = ['is_active', 'theme', 'created_at', 'owner']
    search_fields = ['name', 'url', 'owner__username']
    readonly_fields = ['id', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'url', 'owner', 'is_active')
        }),
        ('Bot Configuration', {
            'fields': ('bot_name', 'welcome_message', 'theme', 'position')
        }),
        ('Features', {
            'fields': ('enable_sound', 'show_typing_indicator', 'show_avatar', 
                      'allow_minimize', 'allow_close', 'auto_connect', 'max_messages')
        }),
        ('AI Settings', {
            'fields': ('ai_model', 'ai_temperature', 'ai_max_tokens', 'system_prompt')
        }),
        ('Metadata', {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ['id', 'role', 'content', 'timestamp', 'response_time_ms']
    fields = ['role', 'content', 'timestamp', 'is_error', 'response_time_ms']
    
    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ['id', 'website', 'user_identifier', 'started_at', 'is_active', 'total_messages', 'duration_display']
    list_filter = ['is_active', 'started_at', 'website']
    search_fields = ['id', 'user_identifier', 'website__name']
    readonly_fields = ['id', 'started_at', 'ended_at', 'total_messages', 'user_messages', 'bot_messages']
    inlines = [MessageInline]
    
    fieldsets = (
        ('Conversation Info', {
            'fields': ('id', 'website', 'user_identifier', 'is_active')
        }),
        ('Session Details', {
            'fields': ('user_agent', 'ip_address', 'started_at', 'ended_at')
        }),
        ('Statistics', {
            'fields': ('total_messages', 'user_messages', 'bot_messages')
        })
    )
    
    def duration_display(self, obj):
        if obj.duration:
            total_seconds = int(obj.duration.total_seconds())
            hours, remainder = divmod(total_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            if hours:
                return f"{hours}h {minutes}m {seconds}s"
            elif minutes:
                return f"{minutes}m {seconds}s"
            else:
                return f"{seconds}s"
        return "Ongoing"
    duration_display.short_description = "Duration"
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(website__owner=request.user)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['conversation', 'role', 'content_preview', 'timestamp', 'response_time_ms']
    list_filter = ['role', 'is_error', 'is_welcome', 'timestamp']
    search_fields = ['content', 'conversation__id']
    readonly_fields = ['id', 'timestamp']
    
    fieldsets = (
        ('Message Info', {
            'fields': ('id', 'conversation', 'role', 'content', 'timestamp')
        }),
        ('Flags', {
            'fields': ('is_error', 'is_welcome')
        }),
        ('AI Metadata', {
            'fields': ('ai_model_used', 'response_time_ms', 'tokens_used'),
            'classes': ('collapse',)
        })
    )
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = "Content"
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(conversation__website__owner=request.user)


@admin.register(ChatbotAnalytics)
class ChatbotAnalyticsAdmin(admin.ModelAdmin):
    list_display = ['website', 'date', 'total_conversations', 'total_messages', 'unique_visitors', 'bounce_rate']
    list_filter = ['date', 'website']
    search_fields = ['website__name']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('website', 'date')
        }),
        ('Conversation Metrics', {
            'fields': ('total_conversations', 'total_messages', 'unique_visitors', 
                      'avg_conversation_length', 'conversations_with_multiple_messages')
        }),
        ('Performance Metrics', {
            'fields': ('avg_response_time_ms', 'bounce_rate')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        })
    )
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(website__owner=request.user)


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ['website', 'provider', 'is_active', 'key_preview', 'created_at']
    list_filter = ['provider', 'is_active', 'created_at']
    search_fields = ['website__name', 'provider']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('API Key Info', {
            'fields': ('website', 'provider', 'api_key', 'is_active')
        }),
        ('Metadata', {
            'fields': ('created_at',)
        })
    )
    
    def key_preview(self, obj):
        if obj.api_key:
            return f"{obj.api_key[:8]}...{obj.api_key[-4:]}"
        return "No key"
    key_preview.short_description = "API Key Preview"
    
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Hide API key value in change form
        if obj:
            form.base_fields['api_key'].widget.attrs['type'] = 'password'
        return form
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(website__owner=request.user)


# Custom admin site configuration
admin.site.site_header = "Chatbot Backend Administration"
admin.site.site_title = "Chatbot Admin"
admin.site.index_title = "Welcome to Chatbot Administration"
