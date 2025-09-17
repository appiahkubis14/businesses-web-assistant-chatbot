from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import login
from django.contrib.auth.forms import UserCreationForm
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Count, Avg, Q
from django.utils import timezone
from datetime import timedelta
from chatbot.models import Website, Conversation, Message, ChatbotAnalytics
from chatbot.services import AnalyticsService


def home(request):
    """Home page"""
    return render(request, 'dashboard/home.html')


def register(request):
    """User registration"""
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Registration successful!')
            return redirect('dashboard:dashboard')
    else:
        form = UserCreationForm()
    
    return render(request, 'registration/register.html', {'form': form})


@login_required
def dashboard(request):
    """Main dashboard view"""
    user = request.user
    
    # Get user's websites
    websites = Website.objects.filter(owner=user).order_by('-created_at')
    
    # Get recent conversations
    recent_conversations = Conversation.objects.filter(
        website__owner=user
    ).select_related('website').order_by('-started_at')[:10]
    
    # Get active conversations
    active_conversations = Conversation.objects.filter(
        website__owner=user,
        is_active=True
    ).count()
    
    # Calculate total stats
    total_conversations = Conversation.objects.filter(website__owner=user).count()
    total_messages = Message.objects.filter(conversation__website__owner=user).count()
    
    # Get today's stats
    today = timezone.now().date()
    today_conversations = Conversation.objects.filter(
        website__owner=user,
        started_at__date=today
    ).count()
    
    context = {
        'websites': websites,
        'recent_conversations': recent_conversations,
        'active_conversations': active_conversations,
        'total_conversations': total_conversations,
        'total_messages': total_messages,
        'today_conversations': today_conversations,
        'websites_count': websites.count(),
    }
    
    return render(request, 'dashboard/dashboard.html', context)


@login_required
def website_list(request):
    """List all websites"""
    websites = Website.objects.filter(owner=request.user).order_by('-created_at')
    return render(request, 'dashboard/website_list.html', {'websites': websites})


@login_required
def website_detail(request, website_id):
    """Website detail view"""
    website = get_object_or_404(Website, id=website_id, owner=request.user)
    
    # Get conversations for this website
    conversations = Conversation.objects.filter(website=website).order_by('-started_at')[:20]
    
    # Get analytics summary
    summary = AnalyticsService.get_website_summary(website, days=30)
    
    # Get today's stats
    today = timezone.now().date()
    today_stats = {
        'conversations': Conversation.objects.filter(website=website, started_at__date=today).count(),
        'messages': Message.objects.filter(conversation__website=website, timestamp__date=today).count(),
    }
    
    context = {
        'website': website,
        'conversations': conversations,
        'summary': summary,
        'today_stats': today_stats,
    }
    
    return render(request, 'dashboard/website_detail.html', context)


@login_required
def conversation_detail(request, conversation_id):
    """Conversation detail view"""
    conversation = get_object_or_404(
        Conversation,
        id=conversation_id,
        website__owner=request.user
    )
    
    messages = conversation.messages.order_by('timestamp')
    
    context = {
        'conversation': conversation,
        'messages': messages,
    }
    
    return render(request, 'dashboard/conversation_detail.html', context)


# @login_required
# def live_chat(request):
#     """Live chat monitoring view"""
#     # Get active conversations
#     active_conversations = Conversation.objects.filter(
#         website__owner=request.user,
#         is_active=True
#     ).select_related('website').order_by('-started_at')
    
#     context = {
#         'active_conversations': active_conversations,
#     }
    
#     return render(request, 'dashboard/live_chat.html', context)


@login_required
def analytics(request):
    """Analytics dashboard"""
    websites = Website.objects.filter(owner=request.user)
    
    # Get date range from query params
    days = int(request.GET.get('days', 30))
    
    # Calculate overall analytics
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    total_conversations = Conversation.objects.filter(
        website__owner=request.user,
        started_at__date__range=[start_date, end_date]
    ).count()
    
    total_messages = Message.objects.filter(
        conversation__website__owner=request.user,
        timestamp__date__range=[start_date, end_date]
    ).count()
    
    # Get daily data for charts
    daily_data = []
    for i in range(days):
        date = end_date - timedelta(days=i)
        day_conversations = Conversation.objects.filter(
            website__owner=request.user,
            started_at__date=date
        ).count()
        day_messages = Message.objects.filter(
            conversation__website__owner=request.user,
            timestamp__date=date
        ).count()
        
        daily_data.append({
            'date': date.strftime('%Y-%m-%d'),
            'conversations': day_conversations,
            'messages': day_messages,
        })
    
    daily_data.reverse()  # Chronological order
    
    context = {
        'websites': websites,
        'total_conversations': total_conversations,
        'total_messages': total_messages,
        'daily_data': daily_data,
        'days': days,
    }
    
    return render(request, 'dashboard/analytics.html', context)


@login_required
def website_create(request):
    """Create new website"""
    if request.method == 'POST':
        # Handle form submission
        name = request.POST.get('name')
        url = request.POST.get('url')
        bot_name = request.POST.get('bot_name', 'AI Assistant')
        welcome_message = request.POST.get('welcome_message', "Hi! I'm your AI assistant. How can I help you today?")
        theme = request.POST.get('theme', 'green')
        
        if name and url:
            website = Website.objects.create(
                name=name,
                url=url,
                owner=request.user,
                bot_name=bot_name,
                welcome_message=welcome_message,
                theme=theme
            )
            messages.success(request, f'Website "{name}" created successfully!')
            return redirect('dashboard:website_detail', website_id=website.id)
        else:
            messages.error(request, 'Please fill in all required fields.')
    
    return render(request, 'dashboard/website_create.html')


@login_required
def website_edit(request, website_id):
    """Edit website configuration"""
    website = get_object_or_404(Website, id=website_id, owner=request.user)
    
    if request.method == 'POST':
        # Handle form submission
        website.name = request.POST.get('name', website.name)
        website.url = request.POST.get('url', website.url)
        website.bot_name = request.POST.get('bot_name', website.bot_name)
        website.welcome_message = request.POST.get('welcome_message', website.welcome_message)
        website.theme = request.POST.get('theme', website.theme)
        website.position = request.POST.get('position', website.position)
        website.enable_sound = request.POST.get('enable_sound') == 'on'
        website.show_typing_indicator = request.POST.get('show_typing_indicator') == 'on'
        website.show_avatar = request.POST.get('show_avatar') == 'on'
        website.allow_minimize = request.POST.get('allow_minimize') == 'on'
        website.allow_close = request.POST.get('allow_close') == 'on'
        website.system_prompt = request.POST.get('system_prompt', website.system_prompt)
        
        website.save()
        messages.success(request, 'Website configuration updated successfully!')
        return redirect('dashboard:website_detail', website_id=website.id)
    
    context = {
        'website': website,
    }
    
    return render(request, 'dashboard/website_edit.html', context)


@login_required
def get_conversation_data(request, conversation_id):
    """Get conversation data for live updates"""
    conversation = get_object_or_404(
        Conversation,
        id=conversation_id,
        website__owner=request.user
    )
    
    messages = conversation.messages.order_by('timestamp')
    
    data = {
        'conversation': {
            'id': str(conversation.id),
            'website_name': conversation.website.name,
            'user_identifier': conversation.user_identifier,
            'started_at': conversation.started_at.isoformat(),
            'is_active': conversation.is_active,
            'total_messages': conversation.total_messages,
        },
        'messages': [
            {
                'id': str(msg.id),
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.timestamp.isoformat(),
                'is_error': msg.is_error,
            }
            for msg in messages
        ]
    }
    
    return JsonResponse(data)


@login_required
def end_conversation_view(request, conversation_id):
    """End a conversation"""
    if request.method == 'POST':
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            website__owner=request.user
        )
        
        conversation.end_conversation()
        messages.success(request, 'Conversation ended successfully.')
    
    return redirect('dashboard:live_chat')
