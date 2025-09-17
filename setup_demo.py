#!/usr/bin/env python
"""
Django Chatbot Backend Demo Script

This script demonstrates the complete functionality of the chatbot backend system.
It creates sample data and shows how the system works.
"""

import os
import sys
import django
from django.conf import settings

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chatbot_backend.settings')
django.setup()

from django.contrib.auth.models import User
from chatbot.models import Website, Conversation, Message, ChatbotAnalytics
from chatbot.services import AnalyticsService
import uuid
from datetime import datetime, timedelta
from django.utils import timezone


def create_demo_data():
    """Create demonstration data for the chatbot system"""
    
    print("🚀 Creating demo data for Django Chatbot Backend...")
    
    # Create demo user (if doesn't exist)
    demo_user, created = User.objects.get_or_create(
        username='demo',
        defaults={
            'email': 'demo@example.com',
            'first_name': 'Demo',
            'last_name': 'User',
        }
    )
    
    if created:
        demo_user.set_password('demo123')
        demo_user.save()
        print(f"✅ Created demo user: {demo_user.username}")
    else:
        print(f"ℹ️  Demo user already exists: {demo_user.username}")
    
    # Create demo websites
    websites_data = [
        {
            'name': 'E-commerce Store',
            'url': 'https://shop.example.com',
            'bot_name': 'ShopBot',
            'theme': 'blue',
            'welcome_message': 'Welcome to our store! How can I help you find what you\'re looking for?'
        },
        {
            'name': 'Tech Support Portal',
            'url': 'https://support.techcorp.com',
            'bot_name': 'TechAssist',
            'theme': 'green',
            'welcome_message': 'Hi! I\'m here to help with your technical questions. What can I assist you with?'
        },
        {
            'name': 'Healthcare Clinic',
            'url': 'https://clinic.health.com',
            'bot_name': 'HealthBot',
            'theme': 'purple',
            'welcome_message': 'Hello! I can help you with appointment scheduling and general health questions.'
        }
    ]
    
    websites = []
    for website_data in websites_data:
        website, created = Website.objects.get_or_create(
            name=website_data['name'],
            owner=demo_user,
            defaults=website_data
        )
        websites.append(website)
        
        if created:
            print(f"✅ Created website: {website.name}")
        else:
            print(f"ℹ️  Website already exists: {website.name}")
    
    # Create demo conversations and messages
    for website in websites:
        for i in range(5):  # 5 conversations per website
            conversation = Conversation.objects.create(
                website=website,
                user_identifier=f"user_{i+1}",
                ip_address="127.0.0.1",
                started_at=timezone.now() - timedelta(days=i, hours=i*2)
            )
            
            # Create messages for each conversation
            messages_data = [
                ('user', 'Hello, I need help with something'),
                ('assistant', 'Hi! I\'d be happy to help you. What do you need assistance with?'),
                ('user', 'I\'m looking for information about your services'),
                ('assistant', 'Great! I can provide you with detailed information about our services. What specific area are you interested in?'),
                ('user', 'Thank you, that\'s very helpful!'),
                ('assistant', 'You\'re welcome! Is there anything else I can help you with today?')
            ]
            
            for j, (role, content) in enumerate(messages_data):
                Message.objects.create(
                    conversation=conversation,
                    role=role,
                    content=content,
                    timestamp=conversation.started_at + timedelta(minutes=j*2)
                )
            
            # End some conversations
            if i < 3:
                conversation.end_conversation()
        
        print(f"✅ Created 5 conversations for {website.name}")
    
    # Generate analytics data
    print("📊 Generating analytics data...")
    
    for website in websites:
        for days_ago in range(30):  # Last 30 days
            date = timezone.now().date() - timedelta(days=days_ago)
            AnalyticsService.calculate_daily_analytics(website, date)
    
    print("✅ Analytics data generated")
    
    return demo_user, websites


def display_demo_info(demo_user, websites):
    """Display information about the demo setup"""
    
    print("\n" + "="*60)
    print("🎉 DEMO SETUP COMPLETE!")
    print("="*60)
    
    print(f"\n👤 Demo User Credentials:")
    print(f"   Username: {demo_user.username}")
    print(f"   Password: demo123")
    print(f"   Email: {demo_user.email}")
    
    print(f"\n🌐 Created Websites ({len(websites)}):")
    for website in websites:
        print(f"   • {website.name} ({website.theme} theme)")
        print(f"     URL: {website.url}")
        print(f"     Bot Name: {website.bot_name}")
        print(f"     ID: {website.id}")
        
        conversations_count = website.conversations.count()
        messages_count = Message.objects.filter(conversation__website=website).count()
        active_count = website.conversations.filter(is_active=True).count()
        
        print(f"     Stats: {conversations_count} conversations, {messages_count} messages, {active_count} active")
        print()
    
    print("🚀 Getting Started:")
    print("   1. Start the Django development server:")
    print("      python manage.py runserver 0.0.0.0:5000")
    print("")
    print("   2. Access the dashboard:")
    print("      http://172.20.10.2:5000/")
    print("")
    print("   3. Login with demo credentials above")
    print("")
    print("   4. Admin panel (superuser: admin/admin123):")
    print("      http://172.20.10.2:5000/admin/")
    print("")
    
    print("📝 Installation Code Example:")
    print("   Copy this code to any HTML page to test the chatbot:")
    print()
    print("   <script>")
    print("       window.ChatBotConfig = {")
    print(f"           websiteId: '{websites[0].id}',")
    print("           apiUrl: 'http://172.20.10.2:5000'")
    print("       };")
    print("   </script>")
    print("   <script src='http://172.20.10.2:5000/static/assets/js/chatbot-widget.js'></script>")
    print()
    
    print("🔧 API Endpoints:")
    print("   • GET  /api/config/{website_id}/     - Get chatbot config")
    print("   • POST /api/chat/{website_id}/       - Send chat message")
    print("   • GET  /api/websites/                - List user websites")
    print("   • GET  /api/dashboard/stats/         - Dashboard statistics")
    print("   • WS   /ws/chat/{conversation_id}/   - WebSocket chat")
    print("   • WS   /ws/dashboard/                - Dashboard updates")
    print()
    
    print("📊 Features Included:")
    print("   ✅ Real-time chat with WebSocket support")
    print("   ✅ Modern responsive dashboard")
    print("   ✅ Analytics and reporting")
    print("   ✅ Multiple website management")
    print("   ✅ Customizable chatbot appearance")
    print("   ✅ Live conversation monitoring")
    print("   ✅ Message history and search")
    print("   ✅ REST API for all operations")
    print("   ✅ Django admin integration")
    print("   ✅ User authentication and permissions")
    
    print("\n" + "="*60)
    print("Happy coding! 🚀")
    print("="*60)


def main():
    """Main demo setup function"""
    try:
        demo_user, websites = create_demo_data()
        display_demo_info(demo_user, websites)
        
    except Exception as e:
        print(f"❌ Error during demo setup: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
