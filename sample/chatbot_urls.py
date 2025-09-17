from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

app_name = 'chatbot'

urlpatterns = [
    # Public API endpoints
    path('api/config/<uuid:website_id>/', views.get_website_config, name='website-config'),
    path('api/chat/<uuid:website_id>/', views.chat_api, name='chat-api'),
    path('static/assets/js/chatbot-widget.js', views.serve_widget_script, name='widget-script'),
    
    # Authenticated API endpoints
    path('api/websites/', views.WebsiteListCreateView.as_view(), name='website-list'),
    path('api/websites/<uuid:pk>/', views.WebsiteDetailView.as_view(), name='website-detail'),
    path('api/websites/<uuid:website_id>/conversations/', views.ConversationListView.as_view(), name='conversation-list'),
    path('api/conversations/<uuid:pk>/', views.ConversationDetailView.as_view(), name='conversation-detail'),
    path('api/conversations/<uuid:conversation_id>/end/', views.end_conversation, name='end-conversation'),
    path('api/websites/<uuid:website_id>/analytics/', views.AnalyticsView.as_view(), name='analytics'),
    path('api/conversations/search/', views.SearchConversationsView.as_view(), name='search-conversations'),
    path('api/dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),
    
    # New endpoints for live chat
    path('api/conversations/<uuid:conversation_id>/messages/', views.get_conversation_messages, name='conversation-messages'),
    path('api/send_manual_response/', views.send_manual_response, name='send-manual-response'),
    path('api/conversations/<uuid:conversation_id>/toggle_ai/', views.toggle_conversation_ai, name='toggle-conversation-ai'),
    path('api/active_conversations/', views.active_conversations, name='active-conversations'),
    path('api/save-contact-info/', views.save_contact_info, name='save_contact_info'),
    
    # Dashboard HTML views
    path('live-chat/', views.live_chat_view, name='live-chat'),
    path('dashboard/', views.dashboard_view, name='dashboard'),
    
]