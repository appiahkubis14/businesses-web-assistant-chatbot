# Django Chatbot Backend

A complete, production-ready Django backend system for managing AI-powered chatbots with real-time chat, analytics, and modern dashboard interface.

## 🚀 Features

- **Real-time Chat**: WebSocket-powered live chat with typing indicators
- **Modern Dashboard**: Responsive, mobile-friendly admin interface
- **Analytics & Reporting**: Comprehensive analytics with charts and insights
- **Multi-website Support**: Manage multiple chatbots for different websites
- **Customizable Widgets**: Themes, positions, and behavior customization
- **Live Monitoring**: Real-time conversation monitoring and intervention
- **REST API**: Full REST API for all operations
- **AI Integration**: Ready for OpenAI, Anthropic, and other AI providers
- **User Management**: Authentication, permissions, and multi-user support
- **Message History**: Searchable conversation logs and archives

## 📋 Requirements

- Python 3.8+
- Django 4.2+
- Redis (for WebSocket and caching)
- SQLite/PostgreSQL/MySQL

## 🛠️ Installation

### 1. Clone and Setup

```bash
git clone <repository-url>
cd chatbot-backend
pip install -r requirements.txt
```

### 2. Environment Configuration

Create a `.env` file:

```env
DEBUG=True
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=your-openai-api-key
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 3. Database Setup

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### 4. Create Demo Data (Optional)

```bash
python setup_demo.py
```

### 5. Start the Server

```bash
python manage.py runserver 0.0.0.0:5000
```

## 🌟 Quick Start

### Dashboard Access

1. Open http://172.20.10.2:5000/ in your browser
2. Register a new account or login with demo credentials:
   - Username: `demo`
   - Password: `demo123`

### Create Your First Chatbot

1. Navigate to **Websites** → **Create Website**
2. Fill in your website details:
   - Name: "My Website"
   - URL: "https://example.com"
   - Bot Name: "AI Assistant"
   - Welcome Message: Custom greeting
   - Theme: Choose color theme
3. Click **Create Website**

### Install Chatbot Widget

Copy the generated installation code to your website:

```html
<!-- Add before closing </body> tag -->
<script>
    window.ChatBotConfig = {
        websiteId: 'your-website-id',
        apiUrl: 'http://172.20.10.2:5000'
    };
</script>
<script src="http://172.20.10.2:5000/static/assets/js/chatbot-widget.js"></script>
```

## 🏗️ Project Structure

```
chatbot_backend/
├── chatbot/                 # Main chatbot app
│   ├── models.py           # Database models
│   ├── views.py            # API views
│   ├── consumers.py        # WebSocket consumers
│   ├── services.py         # Business logic
│   ├── serializers.py      # API serializers
│   └── admin.py           # Django admin
├── dashboard/              # Dashboard app
│   ├── views.py           # Dashboard views
│   └── urls.py            # Dashboard URLs
├── templates/              # HTML templates
│   ├── base.html          # Base template
│   ├── dashboard/         # Dashboard templates
│   └── registration/      # Auth templates
├── static/                # Static files
│   └── assets/           # CSS, JS, images
├── chatbot_backend/       # Project settings
│   ├── settings.py       # Django settings
│   ├── urls.py           # URL configuration
│   └── asgi.py           # ASGI config for WebSockets
└── requirements.txt       # Python dependencies
```

## 📊 Models Overview

### Website
- Stores chatbot configuration for each website
- Customization options (theme, position, messages)
- AI model settings and API keys

### Conversation
- Represents a chat session with a visitor
- Tracks user information and session metadata
- Links to website and contains multiple messages

### Message
- Individual chat messages (user/assistant/system)
- Stores content, timestamps, and AI metadata
- Tracks response times and token usage

### ChatbotAnalytics
- Daily analytics aggregations
- Conversation and message statistics
- Performance metrics and bounce rates

## 🔌 API Endpoints

### Public Endpoints
```
GET  /api/config/{website_id}/     # Get chatbot configuration
POST /api/chat/{website_id}/       # Send chat message
GET  /static/assets/js/chatbot-widget.js  # Widget script
```

### Authenticated Endpoints
```
GET  /api/websites/                # List user websites
POST /api/websites/                # Create website
GET  /api/websites/{id}/           # Get website details
PUT  /api/websites/{id}/           # Update website
DELETE /api/websites/{id}/         # Delete website

GET  /api/websites/{id}/conversations/  # List conversations
GET  /api/conversations/{id}/      # Get conversation details
POST /api/conversations/{id}/end/  # End conversation

GET  /api/websites/{id}/analytics/ # Get analytics data
GET  /api/conversations/search/    # Search conversations
GET  /api/dashboard/stats/         # Dashboard statistics
```

### WebSocket Endpoints
```
WS /ws/chat/{conversation_id}/     # Real-time chat
WS /ws/dashboard/                  # Dashboard updates
```

## 🎨 Widget Customization

The chatbot widget supports extensive customization:

```javascript
window.ChatBotConfig = {
    websiteId: 'your-website-id',
    apiUrl: 'http://172.20.10.2:5000',
    
    // Appearance
    theme: 'green',                    // green, blue, purple, red, orange
    position: 'bottom-right',          // bottom-right, bottom-left, top-right, top-left
    botName: 'AI Assistant',
    welcomeMessage: 'Hi! How can I help?',
    
    // Features
    enableSound: true,
    showTypingIndicator: true,
    showAvatar: true,
    allowMinimize: true,
    allowClose: true,
    autoConnect: true,
    maxMessages: 50
};
```

## 📈 Analytics Dashboard

The dashboard provides comprehensive analytics:

- **Real-time Metrics**: Active conversations, daily stats
- **Historical Data**: 30/90-day trends and comparisons
- **Performance Insights**: Response times, bounce rates
- **User Engagement**: Message counts, conversation lengths
- **Visual Charts**: Line charts, bar charts, doughnut charts

## 🔧 Administration

### Django Admin
Access the admin panel at `/admin/` with superuser credentials:
- Manage all models with rich interface
- Bulk operations and filtering
- Export data and generate reports

### User Management
- Multi-user support with permissions
- Each user manages their own websites
- Secure authentication and sessions

### Data Management
- Conversation archiving and cleanup
- Analytics data aggregation
- Performance monitoring and logging

## 🚀 Deployment

### Production Checklist

1. **Environment Variables**:
   ```env
   DEBUG=False
   SECRET_KEY=secure-production-key
   ALLOWED_HOSTS=yourdomain.com
   DATABASE_URL=postgres://user:pass@host:port/db
   REDIS_URL=redis://localhost:6379/0
   ```

2. **Database**: Use PostgreSQL for production
3. **Static Files**: Configure WhiteNoise or CDN
4. **WebSockets**: Deploy with Daphne or similar ASGI server
5. **Caching**: Configure Redis for sessions and caching
6. **Monitoring**: Add logging and error tracking

### Docker Deployment

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

## 🧪 Testing

Run the test suite:

```bash
python manage.py test
```

Test WebSocket connections:
```bash
python manage.py shell
# Test WebSocket consumers and channels
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation
- Open an issue on GitHub
- Review the demo setup script
- Check Django and Channels documentation

## 🚀 Advanced Features

### Custom AI Providers

Extend the `ChatbotService` class to support additional AI providers:

```python
class CustomAIService(ChatbotService):
    def generate_response(self, message, conversation):
        # Implement your custom AI logic
        return "Custom AI response"
```

### Webhook Integration

Add webhook support for external integrations:

```python
@api_view(['POST'])
def webhook_endpoint(request):
    # Handle incoming webhooks
    pass
```

### Message Preprocessing

Add message filters and preprocessing:

```python
def preprocess_message(message):
    # Clean, validate, or transform messages
    return processed_message
```

---

Built with ❤️ using Django, Channels, and modern web technologies.
