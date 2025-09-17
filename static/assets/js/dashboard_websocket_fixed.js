// Enhanced Dashboard WebSocket JavaScript
let currentConversationId = null;
let refreshInterval;
let progressInterval;
let wsConnection;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket connection for real-time updates
    initWebSocket();
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Show connection toast
    const toast = new bootstrap.Toast(document.getElementById('connectionToast'));
    toast.show();
    
    // Scroll to bottom of messages
    scrollMessagesToBottom();
    
    // Set current conversation if available
    const activeConversation = document.querySelector('.conversation-item.active');
    if (activeConversation) {
        currentConversationId = activeConversation.getAttribute('data-conversation-id');
    }
});

function initWebSocket() {
    const wsUrl = `ws://${window.location.host}/ws/dashboard/`;
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = function(event) {
        console.log('Dashboard WebSocket connected');
        
        // Send subscription message for websites
        // This will auto-subscribe to user's websites in the backend
        wsConnection.send(JSON.stringify({
            type: 'subscribe_websites',
            website_ids: [] // Empty array will trigger auto-subscription
        }));
    };
    

    wsConnection.onmessage = function(event) {
        const data = JSON.parse(event.data);
        console.log('Dashboard WebSocket message:', data);
        
        if (data.type === 'connection_established') {
            console.log('Dashboard connection confirmed');
            showToast('Connected to real-time updates', 'success');
        } else if (data.type === 'new_conversation') {
            addNewConversation(data.conversation);
            showToast('New conversation started', 'info');
        } else if (data.type === 'new_message') {
            updateConversationMessage(data.conversation_id, data.message);
            
            // If this message is for the current conversation, display it
            if (currentConversationId == data.conversation_id) {
                appendMessage(data.message);
                scrollMessagesToBottom();
            }
            
            // Show notification for new user messages
            if (data.message.role === 'user') {
                showToast(`New message from visitor`, 'info');
                
                // Play notification sound (optional)
                playNotificationSound();
            }
        } else if (data.type === 'conversation_ended') {
            removeConversation(data.conversation_id);
            
            // If the ended conversation is the current one, clear the chat
            if (currentConversationId == data.conversation_id) {
                clearChatInterface();
            }
            showToast('Conversation ended', 'warning');
        } else if (data.type === 'conversation_updated') {
            updateConversationStatus(data.conversation_id, data.requires_attention);
        } else if (data.type === 'typing_indicator') {
            handleTypingIndicator(data);
        } else if (data.type === 'error') {
            showToast('Error: ' + data.message, 'danger');
        }
    };
    
    wsConnection.onclose = function(event) {
        console.log('Dashboard WebSocket disconnected');
        showToast('Disconnected from real-time updates. Reconnecting...', 'warning');
        
        // Try to reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
    };
    
    wsConnection.onerror = function(error) {
        console.error('Dashboard WebSocket error:', error);
        showToast('Connection error. Attempting to reconnect...', 'danger');
    };
}

function addNewConversation(conversation) {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;
    
    // Create new conversation item
    const conversationItem = document.createElement('a');
    conversationItem.href = '#';
    conversationItem.className = 'list-group-item list-group-item-action conversation-item';
    conversationItem.setAttribute('data-conversation-id', conversation.id);
    
    conversationItem.innerHTML = `
        <div class="d-flex w-100 justify-content-between">
            <h6 class="mb-1">${conversation.website_name || 'Unknown Website'}</h6>
            <small>just now</small>
        </div>
        <p class="mb-1 text-truncate">
            New conversation started
        </p>
        <div class="d-flex justify-content-between">
            <small class="text-muted">${conversation.user_identifier || 'Anonymous'}</small>
            <span class="badge bg-success">0 msgs</span>
        </div>
    `;
    
    // Add click handler
    conversationItem.addEventListener('click', function() {
        selectConversation(this);
    });
    
    // Add to top of list
    conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
    
    // Update counter
    updateActiveConversationsCounter();
}

function updateConversationMessage(conversationId, message) {
    const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
    if (!conversationItem) return;
    
    // Update last message preview
    const messagePreview = conversationItem.querySelector('p.mb-1');
    if (messagePreview) {
        const roleLabel = message.role === 'user' ? 'Visitor' : 'Agent';
        messagePreview.innerHTML = `<strong>${roleLabel}:</strong> ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`;
    }
    
    // Update message count
    const badge = conversationItem.querySelector('.badge');
    if (badge) {
        const currentCount = parseInt(badge.textContent.split(' ')[0]) || 0;
        badge.textContent = `${currentCount + 1} msgs`;
        
        // Update badge color based on role
        if (message.role === 'user') {
            badge.className = 'badge bg-warning'; // Needs attention
        }
    }
    
    // Update timestamp
    const timeElement = conversationItem.querySelector('small');
    if (timeElement) {
        timeElement.textContent = 'just now';
    }
    
    // Move conversation to top
    const conversationsList = document.getElementById('conversationsList');
    if (conversationsList && conversationItem.parentNode === conversationsList) {
        conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
    }
}

function removeConversation(conversationId) {
    const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
    if (conversationItem) {
        conversationItem.remove();
        updateActiveConversationsCounter();
    }
}

function updateActiveConversationsCounter() {
    const counter = document.querySelector('.card-header .badge');
    const count = document.querySelectorAll('.conversation-item').length;
    if (counter) {
        counter.textContent = count.toString();
    }
}

function handleTypingIndicator(data) {
    if (currentConversationId != data.conversation_id) return;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Remove existing typing indicator
    const existingIndicator = messagesContainer.querySelector('.typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    if (data.is_typing && data.user_type === 'visitor') {
        // Add typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'd-flex mb-3 justify-content-start typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-bubble ai-message">
                <div class="message-content">
                    <span class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </span>
                    Visitor is typing...
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(typingDiv);
        scrollMessagesToBottom();
    }
}

function startAutoRefresh() {
    let progress = 0;
    const interval = 30000; // 30 seconds (increased for less server load)
    const step = 100 / (interval / 100); // Update every 100ms
    
    progressInterval = setInterval(function() {
        progress += step;
        const progressBar = document.getElementById('refreshProgress');
        if (progressBar) {
            progressBar.style.width = progress + '%';
        }
        
        if (progress >= 100) {
            progress = 0;
            refreshConversations();
        }
    }, 100);
}

function refreshConversations() {
    // Reset progress
    const progressBar = document.getElementById('refreshProgress');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
    
    // Only refresh if WebSocket is not connected
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        // Refresh the conversations list via HTTP
        fetch(window.location.href)
            .then(response => response.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const newContainer = doc.getElementById('conversationsList');
                const currentContainer = document.getElementById('conversationsList');
                
                if (newContainer && currentContainer) {
                    currentContainer.innerHTML = newContainer.innerHTML;
                    
                    // Re-add click handlers
                    document.querySelectorAll('.conversation-item').forEach(item => {
                        item.addEventListener('click', function() {
                            selectConversation(this);
                        });
                    });
                    
                    updateActiveConversationsCounter();
                }
            })
            .catch(error => {
                console.error('Error refreshing conversations:', error);
            });
    }
}

function selectConversation(element) {
    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    
    const conversationId = element.getAttribute('data-conversation-id');
    currentConversationId = conversationId;
    
    // Update conversation title
    const websiteName = element.querySelector('h6').textContent;
    const userIdentifier = element.querySelector('.text-muted').textContent;
    const titleElement = document.getElementById('currentConversationTitle');
    if (titleElement) {
        titleElement.textContent = `${websiteName} - ${userIdentifier}`;
    }
    
    // Update status badge
    const statusBadge = element.querySelector('.badge');
    const conversationStatus = document.getElementById('conversationStatus');
    if (conversationStatus && statusBadge) {
        conversationStatus.className = `badge ${statusBadge.className} me-2`;
        conversationStatus.textContent = statusBadge.className.includes('bg-warning') ? 'Needs Attention' : 'Active';
    }
    
    // Update view details link
    const viewDetailsLink = document.getElementById('viewDetailsLink');
    if (viewDetailsLink) {
        viewDetailsLink.href = `/conversations/${conversationId}/`;
    }
    
    // Load conversation messages
    loadConversationMessages(conversationId);
    
    // Enable message input
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.querySelector('#messageForm button');
    if (messageInput) messageInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
    
    // Mark conversation as viewed (remove warning badge)
    if (statusBadge && statusBadge.className.includes('bg-warning')) {
        statusBadge.className = 'badge bg-success';
        statusBadge.textContent = statusBadge.textContent; // Keep message count
    }
}

function loadConversationMessages(conversationId) {
    fetch(`/api/conversations/${conversationId}/messages/`)
        .then(response => response.json())
        .then(messages => {
            const container = document.getElementById('messagesContainer');
            if (!container) return;
            
            container.innerHTML = '';
            
            messages.forEach(message => {
                appendMessage(message);
            });
            
            scrollMessagesToBottom();
        })
        .catch(error => {
            console.error('Error loading messages:', error);
            showToast('Error loading messages', 'danger');
        });
}

function appendMessage(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `d-flex mb-3 ${message.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`;
    
    const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : 'now';
    const manualIndicator = message.is_manual ? '<small class="ms-2"><i class="fas fa-user-tie" title="Manual response"></i></small>' : '';
    
    messageDiv.innerHTML = `
        <div class="message-bubble ${message.role === 'user' ? 'user-message' : 'ai-message'}">
            <div class="message-content">${message.content}</div>
            <div class="message-time">
                <small>${timestamp}</small>
                ${message.role === 'assistant' ? manualIndicator : ''}
            </div>
        </div>
    `;
    
    container.appendChild(messageDiv);
}

function scrollMessagesToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function sendManualResponse(event) {
    event.preventDefault();
    
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const message = messageInput.value.trim();
    
    if (!message || !currentConversationId) return;
    
    // Disable input while sending
    messageInput.disabled = true;
    
    // Send via WebSocket if available
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
            type: 'send_message',
            conversation_id: currentConversationId,
            message: message
        }));
        
        messageInput.value = '';
        messageInput.disabled = false;
        messageInput.focus();
        
        // Add the message immediately to UI
        appendMessage({
            content: message,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            is_manual: true
        });
        scrollMessagesToBottom();
    } else {
        // Fallback to HTTP
        fetch('/api/send_manual_response/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                conversation_id: currentConversationId,
                message: message
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                messageInput.value = '';
                
                // Add the message immediately
                appendMessage({
                    content: message,
                    role: 'assistant',
                    timestamp: new Date().toISOString(),
                    is_manual: true
                });
                scrollMessagesToBottom();
                showToast('Message sent', 'success');
            } else {
                showToast('Error sending message: ' + data.error, 'danger');
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            showToast('Error sending message', 'danger');
        })
        .finally(() => {
            messageInput.disabled = false;
            messageInput.focus();
        });
    }
}

function endCurrentConversation() {
    if (!currentConversationId) return;
    
    if (confirm('Are you sure you want to end this conversation?')) {
        fetch(`/api/conversations/${currentConversationId}/end/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        })
        .then(response => {
            if (response.ok) {
                showToast('Conversation ended successfully', 'success');
            } else {
                showToast('Error ending conversation', 'danger');
            }
        })
        .catch(error => {
            console.error('Error ending conversation:', error);
            showToast('Error ending conversation', 'danger');
        });
    }
}

function updateConversationStatus(conversationId, requiresAttention) {
    // Update in conversations list
    const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
    if (conversationItem) {
        const badge = conversationItem.querySelector('.badge');
        if (badge) {
            badge.className = requiresAttention ? 'badge bg-warning' : 'badge bg-success';
        }
    }
    
    // Update in chat header if this is the current conversation
    if (currentConversationId == conversationId) {
        const statusBadge = document.getElementById('conversationStatus');
        if (statusBadge) {
            statusBadge.className = requiresAttention ? 'badge bg-warning me-2' : 'badge bg-success me-2';
            statusBadge.textContent = requiresAttention ? 'Needs Attention' : 'Active';
        }
    }
}

function clearChatInterface() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-comment-dots fa-3x mb-3"></i>
                <p>Select a conversation to view messages</p>
            </div>
        `;
    }
    
    const titleElement = document.getElementById('currentConversationTitle');
    const statusElement = document.getElementById('conversationStatus');
    
    if (titleElement) titleElement.textContent = 'Select a conversation';
    if (statusElement) statusElement.textContent = '';
    
    // Disable message input
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.querySelector('#messageForm button');
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    
    currentConversationId = null;
}

function playNotificationSound() {
    // Optional: play a subtle notification sound
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMcBj2T2fLKdSsFLIHH8diMPwdYreTirWsNGkq58YGtcRsJWKfhwW8dBjqQ3vKxZx0Hqt3Jd1gdBklk6uq3bxoJVafrP3ciGwuO2qZ7GB8HTqbu+VscDBZnKdaiXBwORZ+q5omzYBAAZ7/D1n0cBj2Q3vK0ZhoAVqnhxm8dBz2O2+yoYR0DX7fr63AcBThG0fXWjBkYfrTa6WwVGkJ55FYdCluG2u1wGwVGkOHnsz8gA02Z2O3eaB0LU7T8vW8dC0TJ7u7pdxsMDI7/5ogwA1XSDu/jVEUADl4n5Hn0dRsECWnJvHIUDVhz99mGJQ8FVbnr7ngCBhJDr0oKBAhVs/v1fyYLCGPM8d9rEAQ=');
        audio.volume = 0.3;
        audio.play().catch(() => {}); // Ignore errors if audio fails
    } catch (e) {
        // Ignore audio errors
    }
}

// Helper functions
function showToast(message, type = 'info') {
    // Create a toast element
    const toastContainer = document.createElement('div');
    toastContainer.className = `toast align-items-center text-white bg-${type} border-0`;
    toastContainer.setAttribute('role', 'alert');
    toastContainer.setAttribute('aria-live', 'assertive');
    toastContainer.setAttribute('aria-atomic', 'true');
    
    toastContainer.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(toastContainer);
    
    // Show toast
    const toast = new bootstrap.Toast(toastContainer, {
        autohide: true,
        delay: 5000
    });
    toast.show();
    
    // Remove after hiding
    toastContainer.addEventListener('hidden.bs.toast', function() {
        if (document.body.contains(toastContainer)) {
            document.body.removeChild(toastContainer);
        }
    });
}

function getCSRFToken() {
    const name = 'csrftoken';
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (progressInterval) clearInterval(progressInterval);
    if (wsConnection) wsConnection.close();
});

// CSS for typing indicator
const style = document.createElement('style');
style.textContent = `
.typing-dots {
    display: inline-block;
}

.typing-dots span {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #999;
    margin: 0 1px;
    animation: typing 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(1) {
    animation-delay: -0.32s;
}

.typing-dots span:nth-child(2) {
    animation-delay: -0.16s;
}

@keyframes typing {
    0%, 80%, 100% {
        transform: scale(0.8);
        opacity: 0.5;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}
`;
document.head.appendChild(style);
