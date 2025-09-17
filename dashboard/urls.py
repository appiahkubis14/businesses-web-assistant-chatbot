from django.urls import path

from chatbot.views import live_chat_view
from . import views

app_name = 'dashboard'

urlpatterns = [
    path('', views.home, name='home'),
    path('register/', views.register, name='register'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('websites/', views.website_list, name='website_list'),
    path('websites/create/', views.website_create, name='website_create'),
    path('websites/<uuid:website_id>/', views.website_detail, name='website_detail'),
    path('websites/<uuid:website_id>/edit/', views.website_edit, name='website_edit'),
    path('conversations/<uuid:conversation_id>/', views.conversation_detail, name='conversation_detail'),
    path('conversations/<uuid:conversation_id>/data/', views.get_conversation_data, name='conversation_data'),
    path('conversations/<uuid:conversation_id>/end/', views.end_conversation_view, name='end_conversation'),
    path('live-chat/', live_chat_view, name='live-chat'),
    path('analytics/', views.analytics, name='analytics'),
]
