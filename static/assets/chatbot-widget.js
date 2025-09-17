(function (window, document) {
  'use strict';

  // Default configuration
  const defaultConfig = {
    apiUrl: 'http://172.20.10.2:5000',
    theme: 'green',
    position: 'bottom-right',
    botName: 'AI Assistant',
    websiteId: null, // Must be provided
    welcomeMessage: "Hi! I'm your AI assistant. How can I help you today?",
    enableSound: true,
    showTypingIndicator: true,
    maxMessages: 50,
    autoConnect: true,
    showAvatar: true,
    allowMinimize: true,
    allowClose: true
  };

  // Global chatbot instance
  let chatbotInstance = null;

  class ChatBotWidget {
    constructor(config = {}) {
      this.config = { ...defaultConfig, ...config };
      this.isOpen = false;
      this.isMinimized = false;
      this.messages = [];
      this.conversationId = null;
      this.unreadCount = 0;
      this.isLoading = false;
      this.socket = null;
      this.isConnected = false;
      this.typingTimeout = null;
      this.websiteId = this.config.websiteId || this.generateUUID();
      this.connectionRetryCount = 0;
      this.maxRetries = 3;
      this.reconnectDelay = 1000;
      this.userIdentifier = this.getUserIdentifier();

      this.init();
    }

    generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    init() {
      this.loadCSS();
      this.createWidget();
      this.bindEvents();
      this.addWelcomeMessage();
      
      console.log('ChatBot Widget initialized');
    }

    loadCSS() {
      if (document.getElementById('chatbot-widget-styles')) return;

      const css = `
       /* ChatBot Widget Styles */

:root {
  /* Color Themes */
  --chatbot-blue-primary: #2563eb;
  --chatbot-blue-secondary: #3b82f6;
  --chatbot-blue-light: #dbeafe;
  --chatbot-blue-dark: #1d4ed8;
  
  --chatbot-green-primary: #16a34a;
  --chatbot-green-secondary: #22c55e;
  --chatbot-green-light: #dcfce7;
  --chatbot-green-dark: #15803d;
  
  --chatbot-purple-primary: #9333ea;
  --chatbot-purple-secondary: #a855f7;
  --chatbot-purple-light: #f3e8ff;
  --chatbot-purple-dark: #7c3aed;
  
  --chatbot-red-primary: #dc2626;
  --chatbot-red-secondary: #ef4444;
  --chatbot-red-light: #fecaca;
  --chatbot-red-dark: #b91c1c;
  
  --chatbot-orange-primary: #ea580c;
  --chatbot-orange-secondary: #fb923c;
  --chatbot-orange-light: #fed7aa;
  --chatbot-orange-dark: #c2410c;
  
  /* Common colors */
  --chatbot-white: #ffffff;
  --chatbot-gray-50: #f9fafb;
  --chatbot-gray-100: #f3f4f6;
  --chatbot-gray-200: #e5e7eb;
  --chatbot-gray-300: #d1d5db;
  --chatbot-gray-400: #9ca3af;
  --chatbot-gray-500: #6b7280;
  --chatbot-gray-600: #4b5563;
  --chatbot-gray-700: #374151;
  --chatbot-gray-800: #1f2937;
  --chatbot-gray-900: #111827;
  
  /* Spacing */
  --chatbot-border-radius: 12px;
  --chatbot-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --chatbot-shadow-lg: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  
  /* Z-index */
  --chatbot-z-index: 10000;
}

/* Widget Container */
.chatbot-widget-container {
  position: fixed;
  z-index: var(--chatbot-z-index);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Position variants */
.chatbot-widget-container.chatbot-widget--bottom--right {
  bottom: 20px;
  right: 20px;
}

.chatbot-widget-container.chatbot-widget--bottom--left {
  bottom: 20px;
  left: 20px;
}

.chatbot-widget-container.chatbot-widget--top--right {
  top: 20px;
  right: 20px;
}

.chatbot-widget-container.chatbot-widget--top--left {
  top: 20px;
  left: 20px;
}

/* Toggle Button */
.chatbot-toggle-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--chatbot-shadow);
  color: white;
  font-weight: 600;
}

.chatbot-toggle-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--chatbot-shadow-lg);
}

.chatbot-toggle-btn:active {
  transform: translateY(0);
}

/* Theme variants for toggle button */
.chatbot-toggle-btn.chatbot-widget--blue {
  background: linear-gradient(135deg, var(--chatbot-blue-primary), var(--chatbot-blue-secondary));
}

.chatbot-toggle-btn.chatbot-widget--green {
  background: linear-gradient(135deg, var(--chatbot-green-primary), var(--chatbot-green-secondary));
}

.chatbot-toggle-btn.chatbot-widget--purple {
  background: linear-gradient(135deg, var(--chatbot-purple-primary), var(--chatbot-purple-secondary));
}

.chatbot-toggle-btn.chatbot-widget--red {
  background: linear-gradient(135deg, var(--chatbot-red-primary), var(--chatbot-red-secondary));
}

.chatbot-toggle-btn.chatbot-widget--orange {
  background: linear-gradient(135deg, var(--chatbot-orange-primary), var(--chatbot-orange-secondary));
}

/* Unread Badge */
.chatbot-unread-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #dc2626;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: chatbot-pulse 2s infinite;
}

@keyframes chatbot-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* Main Widget */
.chatbot-widget {
  width: 380px;
  height: 500px;
  background: var(--chatbot-white);
  border-radius: var(--chatbot-border-radius);
  box-shadow: var(--chatbot-shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: chatbot-slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--chatbot-gray-200);
  transition: all 0.3s ease;
}

.chatbot-widget.minimized {
  display: none;
}

@keyframes chatbot-slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Header */
.chatbot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  color: white;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.chatbot-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.1;
  background-image: 
    radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 50%);
}

.chatbot-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.chatbot-header-icon {
  flex-shrink: 0;
}

.chatbot-header-text h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.chatbot-status {
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chatbot-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  animation: chatbot-blink 2s infinite;
}

@keyframes chatbot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.chatbot-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.chatbot-control-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.8;
}

.chatbot-control-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

/* Theme variants for header */
.chatbot-widget.chatbot-widget--blue .chatbot-header {
  background: linear-gradient(135deg, var(--chatbot-blue-primary), var(--chatbot-blue-secondary));
}

.chatbot-widget.chatbot-widget--green .chatbot-header {
  background: linear-gradient(135deg, var(--chatbot-green-primary), var(--chatbot-green-secondary));
}

.chatbot-widget.chatbot-widget--purple .chatbot-header {
  background: linear-gradient(135deg, var(--chatbot-purple-primary), var(--chatbot-purple-secondary));
}

.chatbot-widget.chatbot-widget--red .chatbot-header {
  background: linear-gradient(135deg, var(--chatbot-red-primary), var(--chatbot-red-secondary));
}

.chatbot-widget.chatbot-widget--orange .chatbot-header {
  background: linear-gradient(135deg, var(--chatbot-orange-primary), var(--chatbot-orange-secondary));
}

/* Messages Container */
.chatbot-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--chatbot-gray-50);
  scroll-behavior: smooth;
}

.chatbot-messages::-webkit-scrollbar {
  width: 4px;
}

.chatbot-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chatbot-messages::-webkit-scrollbar-thumb {
  background: var(--chatbot-gray-300);
  border-radius: 2px;
}

.chatbot-messages::-webkit-scrollbar-thumb:hover {
  background: var(--chatbot-gray-400);
}

/* Message */
.chatbot-message {
  display: flex;
  margin-bottom: 16px;
  animation: chatbot-fadeIn 0.3s ease;
}

@keyframes chatbot-fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.chatbot-message.user {
  justify-content: flex-end;
}

.chatbot-message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 12px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.chatbot-message.user .chatbot-message-avatar {
  order: 2;
  margin-right: 0;
  margin-left: 12px;
  background: var(--chatbot-gray-600);
  color: white;
}

/* Dynamic theme colors for assistant avatar */
.chatbot-widget.chatbot-widget--blue .chatbot-message.assistant .chatbot-message-avatar {
  background: var(--chatbot-blue-primary);
  color: white;
}

.chatbot-widget.chatbot-widget--green .chatbot-message.assistant .chatbot-message-avatar {
  background: var(--chatbot-green-primary);
  color: white;
}

.chatbot-widget.chatbot-widget--purple .chatbot-message.assistant .chatbot-message-avatar {
  background: var(--chatbot-purple-primary);
  color: white;
}

.chatbot-widget.chatbot-widget--red .chatbot-message.assistant .chatbot-message-avatar {
  background: var(--chatbot-red-primary);
  color: white;
}

.chatbot-widget.chatbot-widget--orange .chatbot-message.assistant .chatbot-message-avatar {
  background: var(--chatbot-orange-primary);
  color: white;
}

.chatbot-message-content {
  max-width: 260px;
  background: var(--chatbot-white);
  border-radius: 18px;
  padding: 12px 16px;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--chatbot-gray-200);
  transition: all 0.3s ease;
}

/* Dynamic theme colors for user messages */
.chatbot-widget.chatbot-widget--blue .chatbot-message.user .chatbot-message-content {
  background: var(--chatbot-blue-primary);
  color: white;
  border-color: var(--chatbot-blue-primary);
}

.chatbot-widget.chatbot-widget--green .chatbot-message.user .chatbot-message-content {
  background: var(--chatbot-green-primary);
  color: white;
  border-color: var(--chatbot-green-primary);
}

.chatbot-widget.chatbot-widget--purple .chatbot-message.user .chatbot-message-content {
  background: var(--chatbot-purple-primary);
  color: white;
  border-color: var(--chatbot-purple-primary);
}

.chatbot-widget.chatbot-widget--red .chatbot-message.user .chatbot-message-content {
  background: var(--chatbot-red-primary);
  color: white;
  border-color: var(--chatbot-red-primary);
}

.chatbot-widget.chatbot-widget--orange .chatbot-message.user .chatbot-message-content {
  background: var(--chatbot-orange-primary);
  color: white;
  border-color: var(--chatbot-orange-primary);
}

/* Dynamic theme colors for assistant messages */
.chatbot-widget.chatbot-widget--blue .chatbot-message.assistant .chatbot-message-content {
  background: var(--chatbot-blue-light);
  border-color: var(--chatbot-blue-primary);
  color: var(--chatbot-blue-dark);
}

.chatbot-widget.chatbot-widget--green .chatbot-message.assistant .chatbot-message-content {
  background: var(--chatbot-green-light);
  border-color: var(--chatbot-green-primary);
  color: var(--chatbot-green-dark);
}

.chatbot-widget.chatbot-widget--purple .chatbot-message.assistant .chatbot-message-content {
  background: var(--chatbot-purple-light);
  border-color: var(--chatbot-purple-primary);
  color: var(--chatbot-purple-dark);
}

.chatbot-widget.chatbot-widget--red .chatbot-message.assistant .chatbot-message-content {
  background: var(--chatbot-red-light);
  border-color: var(--chatbot-red-primary);
  color: var(--chatbot-red-dark);
}

.chatbot-widget.chatbot-widget--orange .chatbot-message.assistant .chatbot-message-content {
  background: var(--chatbot-orange-light);
  border-color: var(--chatbot-orange-primary);
  color: var(--chatbot-orange-dark);
}

.chatbot-message.assistant.error .chatbot-message-content {
  background: var(--chatbot-red-light);
  border-color: var(--chatbot-red-primary);
  color: var(--chatbot-red-dark);
}

.chatbot-message-content p {
  margin: 0;
  line-height: 1.4;
  font-size: 14px;
}

.chatbot-message-content code {
  background: rgba(214, 211, 211, 0.1);
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
}

.chatbot-message.user .chatbot-message-content code {
  background: rgba(255, 255, 255, 0.2);
}

.chatbot-message-timestamp {
  font-size: 10px;
  opacity: 0.6;
  margin-top: 4px;
  text-align: right;
}

.chatbot-message.user .chatbot-message-timestamp {
  text-align: left;
}

/* Typing Indicator */
.chatbot-typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.chatbot-typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chatbot-gray-400);
  animation: chatbot-typing 1.4s infinite ease-in-out;
}

.chatbot-typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.chatbot-typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes chatbot-typing {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Input Form */
.chatbot-input-form {
  padding: 16px 20px;
  background: var(--chatbot-white);
  border-top: 1px solid var(--chatbot-gray-200);
}

.chatbot-error-banner {
  background: var(--chatbot-red-light);
  color: var(--chatbot-red-dark);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--chatbot-red-primary);
}

.chatbot-input-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.chatbot-message-input {
  flex: 1;
  border: 1px solid var(--chatbot-gray-300);
  border-radius: 20px;
  padding: 10px 16px;
  outline: none;
  font-size: 14px;
  transition: all 0.2s ease;
  background: var(--chatbot-gray-50);
}

/* Dynamic theme colors for input focus */
.chatbot-widget.chatbot-widget--blue .chatbot-message-input:focus {
  border-color: var(--chatbot-blue-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.chatbot-widget.chatbot-widget--green .chatbot-message-input:focus {
  border-color: var(--chatbot-green-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.1);
}

.chatbot-widget.chatbot-widget--purple .chatbot-message-input:focus {
  border-color: var(--chatbot-purple-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.1);
}

.chatbot-widget.chatbot-widget--red .chatbot-message-input:focus {
  border-color: var(--chatbot-red-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.chatbot-widget.chatbot-widget--orange .chatbot-message-input:focus {
  border-color: var(--chatbot-orange-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
}

.chatbot-message-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chatbot-send-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

/* Dynamic theme colors for send button */
.chatbot-widget.chatbot-widget--blue .chatbot-send-button {
  background: var(--chatbot-blue-primary);
}

.chatbot-widget.chatbot-widget--blue .chatbot-send-button:hover:not(:disabled) {
  background: var(--chatbot-blue-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.chatbot-widget.chatbot-widget--green .chatbot-send-button {
  background: var(--chatbot-green-primary);
}

.chatbot-widget.chatbot-widget--green .chatbot-send-button:hover:not(:disabled) {
  background: var(--chatbot-green-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
}

.chatbot-widget.chatbot-widget--purple .chatbot-send-button {
  background: var(--chatbot-purple-primary);
}

.chatbot-widget.chatbot-widget--purple .chatbot-send-button:hover:not(:disabled) {
  background: var(--chatbot-purple-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(147, 51, 234, 0.3);
}

.chatbot-widget.chatbot-widget--red .chatbot-send-button {
  background: var(--chatbot-red-primary);
}

.chatbot-widget.chatbot-widget--red .chatbot-send-button:hover:not(:disabled) {
  background: var(--chatbot-red-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
}

.chatbot-widget.chatbot-widget--orange .chatbot-send-button {
  background: var(--chatbot-orange-primary);
}

.chatbot-widget.chatbot-widget--orange .chatbot-send-button:hover:not(:disabled) {
  background: var(--chatbot-orange-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3);
}

.chatbot-send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.chatbot-send-button .spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Minimized Button */
.chatbot-minimized-btn {
  background: var(--chatbot-white);
  border: 1px solid var(--chatbot-gray-200);
  border-radius: 25px;
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--chatbot-shadow);
  transition: all 0.3s ease;
  color: var(--chatbot-gray-700);
  font-size: 14px;
  font-weight: 500;
  position: relative;
  animation: chatbot-slideUp 0.3s ease;
}

.chatbot-minimized-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--chatbot-shadow-lg);
}

.chatbot-minimized-text {
  white-space: nowrap;
}

/* Mobile Responsiveness */
@media (max-width: 480px) {
  .chatbot-widget {
    width: calc(100vw - 20px);
    height: calc(100vh - 40px);
    max-width: 400px;
    max-height: 600px;
  }
  
  .chatbot-widget-container.chatbot-widget--bottom--right,
  .chatbot-widget-container.chatbot-widget--bottom--left {
    left: 10px;
    right: 10px;
    bottom: 10px;
  }
  
  .chatbot-widget-container.chatbot-widget--top--right,
  .chatbot-widget-container.chatbot-widget--top--left {
    left: 10px;
    right: 10px;
    top: 10px;
  }
  
  .chatbot-message-content {
    max-width: 220px;
  }
  
  .chatbot-minimized-btn {
    padding: 10px 12px;
    font-size: 13px;
  }
  
  .chatbot-minimized-text {
    display: none;
  }
}

@media (max-width: 320px) {
  .chatbot-toggle-btn {
    width: 50px;
    height: 50px;
  }
  
  .chatbot-header {
    padding: 12px 16px;
  }
  
  .chatbot-messages {
    padding: 16px;
  }
  
  .chatbot-input-form {
    padding: 12px 16px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .chatbot-widget {
    border: 2px solid var(--chatbot-gray-900);
  }
  
  .chatbot-message-content {
    border: 1px solid var(--chatbot-gray-500);
  }
  
  .chatbot-message-input {
    border: 2px solid var(--chatbot-gray-500);
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .chatbot-widget,
  .chatbot-message,
  .chatbot-toggle-btn,
  .chatbot-minimized-btn {
    animation: none;
    transition: none;
  }
  
  .chatbot-typing-indicator span {
    animation: none;
    opacity: 0.7;
  }
  
  .chatbot-unread-badge {
    animation: none;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --chatbot-white: #1f2937;
    --chatbot-gray-50: #111827;
    --chatbot-gray-100: #1f2937;
    --chatbot-gray-200: #374151;
    --chatbot-gray-300: #4b5563;
  }
  
  .chatbot-widget {
    background: var(--chatbot-white);
    border-color: var(--chatbot-gray-600);
  }
  
  .chatbot-messages {
    background: var(--chatbot-gray-50);
  }
  
  .chatbot-message-content {
    background: var(--chatbot-white);
    border-color: var(--chatbot-gray-300);
  }
  
  .chatbot-message-input {
    background: var(--chatbot-gray-50);
    border-color: var(--chatbot-gray-300);
    color: white;
  }
  
  .chatbot-minimized-btn {
    background: var(--chatbot-gray-100);
    border-color: var(--chatbot-gray-300);
    color: white;
  }
}
      `;

      const style = document.createElement('style');
      style.id = 'chatbot-widget-styles';
      style.innerHTML = css;
      document.head.appendChild(style);
    }

    createWidget() {
      // Remove existing widget if any
      const existingWidget = document.getElementById('chatbot-widget-container');
      if (existingWidget) {
        existingWidget.remove();
      }

      const container = document.createElement('div');
      container.id = 'chatbot-widget-container';
      container.className = `chatbot-widget-container chatbot-widget--${this.config.position.replace('-', '--')}`;

      container.innerHTML = this.renderToggleButton();
      document.body.appendChild(container);

      this.container = container;
    }

    renderToggleButton() {
      const unreadBadge = this.unreadCount > 0 ?
        `<span class="chatbot-unread-badge">${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>` : '';

      return `
        <button class="chatbot-toggle-btn chatbot-widget--${this.config.theme}" title="Chat with ${this.config.botName}">
          ${this.getSVGIcon('message-circle')}
          ${unreadBadge}
        </button>
      `;
    }

    renderWidget() {
      const connectionStatus = this.isConnected ?
        `${this.getSVGIcon('wifi', 12)} Online` :
        `${this.getSVGIcon('wifi-off', 12)} Offline`;

      return `
        <div class="chatbot-widget chatbot-widget--${this.config.theme} ${this.isMinimized ? 'minimized' : ''}">
          <!-- Header -->
          <div class="chatbot-header">
            <div class="chatbot-header-info">
              ${this.getSVGIcon('bot', 20)}
              <div class="chatbot-header-text">
                <h3>${this.config.botName}</h3>
                <span class="chatbot-status">${connectionStatus}</span>
              </div>
            </div>
            <div class="chatbot-header-controls">
              <button class="chatbot-control-btn" data-action="toggle-sound" title="${this.config.enableSound ? 'Disable sound' : 'Enable sound'}">
                ${this.getSVGIcon(this.config.enableSound ? 'volume-2' : 'volume-x', 16)}
              </button>
              <button class="chatbot-control-btn" data-action="clear" title="Clear conversation">
                ${this.getSVGIcon('refresh-cw', 16)}
              </button>
              ${this.config.allowMinimize ? `
                <button class="chatbot-control-btn" data-action="minimize" title="Minimize">
                  ${this.getSVGIcon('minimize-2', 16)}
                </button>
              ` : ''}
              ${this.config.allowClose ? `
                <button class="chatbot-control-btn" data-action="close" title="Close">
                  ${this.getSVGIcon('x', 16)}
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Messages -->
          <div class="chatbot-messages" id="chatbot-messages">
            ${this.renderMessages()}
          </div>

          <!-- Input -->
          <form class="chatbot-input-form" id="chatbot-form">
            <div class="chatbot-input-container">
              <input
                type="text"
                id="chatbot-input"
                placeholder="Type your message..."
                class="chatbot-message-input"
                ${this.isLoading ? 'disabled' : ''}
              />
              <button type="submit" class="chatbot-send-button" ${this.isLoading ? 'disabled' : ''}>
                ${this.isLoading ? this.getSVGIcon('loader', 18, 'spinning') : this.getSVGIcon('send', 18)}
              </button>
            </div>
          </form>
        </div>

        ${this.isMinimized ? this.renderMinimizedButton() : ''}
      `;
    }

    renderMinimizedButton() {
      const unreadBadge = this.unreadCount > 0 ?
        `<span class="chatbot-unread-badge">${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>` : '';
      const connectionIcon = this.isConnected ? this.getSVGIcon('wifi', 14) : this.getSVGIcon('wifi-off', 14);

      return `
        <button class="chatbot-minimized-btn chatbot-widget--${this.config.theme}" data-action="restore" title="Restore chat">
          ${this.getSVGIcon('message-circle', 20)}
          <span class="chatbot-minimized-text">Chat with ${this.config.botName}</span>
          ${connectionIcon}
          ${unreadBadge}
        </button>
      `;
    }

    renderMessages() {
      return this.messages.map((message, index) => {
        const avatar = this.config.showAvatar ?
          `<div class="chatbot-message-avatar">
            ${message.role === 'user' ? this.getSVGIcon('user', 16) : this.getSVGIcon('bot', 16)}
          </div>` : '';

        return `
          <div class="chatbot-message ${message.role} ${message.isError ? 'error' : ''} ${message.isWelcome ? 'welcome' : ''}">
            ${avatar}
            <div class="chatbot-message-content">
              <p>${this.formatMessage(message.content)}</p>
              <div class="chatbot-message-timestamp">
                ${this.formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        `;
      }).join('') + (this.isLoading ? this.renderTypingIndicator() : '');
    }

    renderTypingIndicator() {
      const avatar = this.config.showAvatar ?
        `<div class="chatbot-message-avatar">${this.getSVGIcon('bot', 16)}</div>` : '';

      return `
        <div class="chatbot-message assistant typing">
          ${avatar}
          <div class="chatbot-message-content">
            <div class="chatbot-typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      `;
    }

    formatMessage(content) {
      // Basic markdown-like formatting
      return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    formatTimestamp(timestamp) {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    getSVGIcon(name, size = 24, className = '') {
      const icons = {
        'message-circle': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>`,
        'send': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
        'bot': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
        'user': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        'x': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        'minimize-2': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="4,14 10,14 10,20"/><polyline points="20,10 14,10 14,4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
        'volume-2': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m15.54 8.46 2.92 2.92"/><path d="m20.07 4.93-2.53 2.53"/></svg>`,
        'volume-x': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`,
        'refresh-cw': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M3 2v6h6"/><path d="M21 12A9 9 0 0 0 6 5.3L3 8"/><path d="M21 22v-6h-6"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/></svg>`,
        'wifi': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
        'wifi-off': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="2" y1="2" x2="22" y2="22"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M3.27 6.96c4.29-4.023 11.17-4.02 15.46.04l-2.16 2.16C14.37 6.9 9.63 6.9 7.43 9.1l-4.16-2.14Z"/></svg>`,
        'loader': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`
      };
      return icons[name] || '';
    }

    bindEvents() {
      // Delegate events to the container
      this.container.addEventListener('click', (e) => {
        const target = e.target;
        const actionBtn = target.closest('[data-action]');
        
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          
          switch (action) {
            case 'toggle-sound':
              this.toggleSound();
              break;
            case 'clear':
              this.clearConversation();
              break;
            case 'minimize':
              this.minimizeWidget();
              break;
            case 'close':
              this.closeWidget();
              break;
            case 'restore':
              this.restoreWidget();
              break;
          }
        } else if (target.closest('.chatbot-toggle-btn')) {
          this.toggleWidget();
        }
      });

      // Form submission
      this.container.addEventListener('submit', (e) => {
        if (e.target.id === 'chatbot-form') {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen && !this.isMinimized) {
          if (this.config.allowMinimize) {
            this.minimizeWidget();
          } else if (this.config.allowClose) {
            this.closeWidget();
          }
        }
      });
    }

    initializeSocket() {
      if (!this.config.autoConnect) return;

      try {
        // Parse the backend API URL to get the correct host and port
        const backendUrl = new URL(this.config.apiUrl);
        const wsProtocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Build WebSocket URL
        let wsUrl;
        if (this.conversationId) {
          wsUrl = `${wsProtocol}//${backendUrl.host}/ws/chat/${this.websiteId}/${this.conversationId}/${this.userIdentifier}/`;
        } else {
          // For new conversations
          wsUrl = `${wsProtocol}//${backendUrl.host}/ws/chat/${this.websiteId}/new/${this.userIdentifier}/`;
        }
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          this.isConnected = true;
          this.connectionRetryCount = 0;
          this.updateConnectionStatus();
          console.log('WebSocket connection established');
          
          // Send identification if we have website ID
          if (this.websiteId) {
            this.socket.send(JSON.stringify({
              type: 'identify',
              website_id: this.websiteId,
              user_identifier: this.userIdentifier,
              metadata: this.getMetadata()
            }));
          }
          
          // Send a ping to keep connection alive
          this.keepAliveInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        this.socket.onclose = (event) => {
          this.isConnected = false;
          this.updateConnectionStatus();
          console.log('WebSocket connection closed', event.code, event.reason);
          
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
          }
          
          // Retry connection with exponential backoff
          if (this.connectionRetryCount < this.maxRetries) {
            this.connectionRetryCount++;
            const delay = this.reconnectDelay * Math.pow(2, this.connectionRetryCount - 1);
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.connectionRetryCount}/${this.maxRetries})`);
            setTimeout(() => this.initializeSocket(), delay);
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnected = false;
          this.updateConnectionStatus();
        };

        this.socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        console.warn('WebSocket not available, using HTTP fallback');
      }
    }

    handleWebSocketMessage(data) {
      const messageType = data.type;
      
      if (messageType === 'pong') return;

      if (messageType === 'chat_message') {
        this.addMessage({
          role: data.role,
          content: data.message,
          timestamp: data.timestamp || new Date().toISOString(),
          isManual: data.is_manual || false
        });
        this.isLoading = false;
        this.updateWidget();
        
        // Update conversation ID if we didn't have one
        if (data.conversation_id && !this.conversationId) {
          this.conversationId = data.conversation_id;
        }
        
      } else if (messageType === 'identified') {
        console.log('Successfully identified with backend');
        
      } else if (messageType === 'connection_established') {
        console.log('Connection established:', data.message);
        
        // Update conversation ID if provided
        if (data.conversation_id) {
          this.conversationId = data.conversation_id;
        }
        
      } else if (messageType === 'config_updated') {
        // Handle configuration updates
        this.handleConfigUpdate(data.config);
        
      } else if (messageType === 'conversation_ended') {
        this.handleConversationEnded(data.message);
        
      } else if (messageType === 'error') {
        console.error('WebSocket error from server:', data.message);
        this.handleError(data.message);
      }
    }

    handleConfigUpdate(newConfig) {
      // Update configuration
      const oldTheme = this.config.theme;
      const oldPosition = this.config.position;
      
      Object.assign(this.config, newConfig);
      
      // Update theme and position if changed
      if (oldTheme !== this.config.theme || oldPosition !== this.config.position) {
        this.applyThemeAndPosition();
      }
      
      // Update widget content
      this.updateWidget();
      
      console.log('Configuration updated:', newConfig);
    }

    applyThemeAndPosition() {
      // Update container classes
      this.container.className = `chatbot-widget-container chatbot-widget--${this.config.position.replace('-', '--')}`;
      
      // If widget is open, update the theme classes
      if (this.isOpen) {
        const widget = this.container.querySelector('.chatbot-widget');
        if (widget) {
          // Remove old theme classes
          widget.className = widget.className.replace(/chatbot-widget--\w+/g, '');
          // Add new theme class
          widget.classList.add(`chatbot-widget--${this.config.theme}`);
        }
      }
      
      // Update toggle button theme
      const toggleBtn = this.container.querySelector('.chatbot-toggle-btn');
      if (toggleBtn) {
        toggleBtn.className = toggleBtn.className.replace(/chatbot-widget--\w+/g, '');
        toggleBtn.classList.add(`chatbot-widget--${this.config.theme}`);
      }
    }

    handleConversationEnded(message) {
      // Add system message about conversation end
      this.addMessage({
        role: 'assistant',
        content: `🔚 **Conversation Ended**\n\n${message}`,
        timestamp: new Date().toISOString(),
        isSystem: true
      });
      
      // Disable input
      this.isLoading = true;
      this.updateWidget();
      
      // Reset after a delay to allow new conversation
      setTimeout(() => {
        this.clearConversation();
      }, 3000);
    }

    async sendMessage() {
      const input = document.getElementById('chatbot-input');
      if (!input || !input.value.trim() || this.isLoading) return;

      const message = input.value.trim();
      input.value = '';

      // Add user message immediately
      this.addMessage({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      this.isLoading = true;
      this.updateWidget();

      try {
        // Generate conversation ID if we don't have one
        if (!this.conversationId) {
          this.conversationId = this.generateUUID();
          console.log('Generated new conversation ID:', this.conversationId);
          
          // Initialize WebSocket connection with the new conversation ID
          if (this.config.autoConnect) {
            this.initializeSocket();
          }
        }

        // Try WebSocket first if available
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isConnected) {
          console.log('Sending message via WebSocket');
          this.socket.send(JSON.stringify({
            type: 'chat_message',
            message: message,
            websiteId: this.websiteId,
            conversationId: this.conversationId,
            metadata: this.getMetadata()
          }));
        } else {
          // Use HTTP API as fallback
          console.log('Sending message via HTTP API');
          await this.sendMessageHTTP(message);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        this.handleError('Failed to send message. Please try again.');
      }
    }

    async sendMessageHTTP(message) {
      try {
        const response = await fetch(`${this.config.apiUrl}/chatbot/api/chat/${this.websiteId}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': this.getCSRFToken()
          },
          body: JSON.stringify({
            message: message,
            conversationId: this.conversationId,
            websiteId: this.websiteId,
            userIdentifier: this.userIdentifier,
            metadata: this.getMetadata()
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Update conversation ID if provided
        if (data.conversationId) {
          this.conversationId = data.conversationId;
          
          // Try to establish WebSocket if not connected
          if (!this.isConnected && this.config.autoConnect) {
            this.initializeSocket();
          }
        }

        // Add the response message
        this.addMessage({
          role: 'assistant',
          content: data.response,
          timestamp: data.timestamp || new Date().toISOString()
        });

        this.isLoading = false;
        this.updateWidget();

      } catch (error) {
        console.error('HTTP API error:', error);
        throw error;
      }
    }

    handleError(errorMessage) {
      this.addMessage({
        role: 'assistant',
        content: `❌ **Error:** ${errorMessage}`,
        timestamp: new Date().toISOString(),
        isError: true
      });
      this.isLoading = false;
      this.updateWidget();
    }

    getMetadata() {
      return {
        page_url: window.location.href,
        page_title: document.title,
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
    }

    updateConnectionStatus() {
      if (this.isOpen) {
        const statusElement = this.container.querySelector('.chatbot-status');
        if (statusElement) {
          const connectionStatus = this.isConnected ?
            `${this.getSVGIcon('wifi', 12)} Online` :
            `${this.getSVGIcon('wifi-off', 12)} Offline`;
          statusElement.innerHTML = connectionStatus;
        }
      }
    }

    addWelcomeMessage() {
      this.addMessage({
        role: 'assistant',
        content: this.config.welcomeMessage,
        timestamp: new Date().toISOString(),
        isWelcome: true
      });
    }

    addMessage(message) {
      this.messages.push(message);
      if (this.messages.length > this.config.maxMessages) {
        this.messages = this.messages.slice(-this.config.maxMessages);
      }

      // Update unread count if widget is closed or minimized
      if ((!this.isOpen || this.isMinimized) && message.role === 'assistant' && !message.isWelcome) {
        this.unreadCount++;
        this.playNotificationSound();
      }
    }

    toggleWidget() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        this.unreadCount = 0;
        this.isMinimized = false;
        
        // Initialize WebSocket if not connected and we have a conversation
        if (!this.isConnected && this.config.autoConnect && this.conversationId) {
          this.initializeSocket();
        }
      }
      this.updateWidget();
    }

    closeWidget() {
      this.isOpen = false;
      this.updateWidget();
    }

    minimizeWidget() {
      this.isMinimized = true;
      this.updateWidget();
    }

    restoreWidget() {
      this.isMinimized = false;
      this.unreadCount = 0;
      this.updateWidget();
    }

    clearConversation() {
      this.messages = [];
      this.conversationId = null;
      this.unreadCount = 0;
      this.isLoading = false;
      
      // Close WebSocket connection
      if (this.socket) {
        this.socket.close();
        this.socket = null;
        this.isConnected = false;
      }
      
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
      
      this.addWelcomeMessage();
      this.updateWidget();
    }

    toggleSound() {
      this.config.enableSound = !this.config.enableSound;
      this.updateWidget();
      
      // Play sound when enabling to give feedback
      if (this.config.enableSound) {
        this.playNotificationSound();
      }
    }

    playNotificationSound() {
      if (!this.config.enableSound) return;

      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (error) {
        console.log('Audio not available');
      }
    }

    updateWidget() {
      if (this.isOpen) {
        this.container.innerHTML = this.renderWidget();
        setTimeout(() => this.scrollToBottom(), 100);

        // Focus input
        const input = document.getElementById('chatbot-input');
        if (input && !this.isMinimized) {
          input.focus();
        }
      } else {
        this.container.innerHTML = this.renderToggleButton();
      }
    }

    scrollToBottom() {
      const messagesContainer = document.getElementById('chatbot-messages');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    getUserIdentifier() {
      // Generate or get user identifier for this session
      let userId = localStorage.getItem('chatbot_user_id');
      if (!userId) {
        userId = this.generateUUID();
        localStorage.setItem('chatbot_user_id', userId);
      }
      return userId;
    }

    getCSRFToken() {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrftoken') {
          return value;
        }
      }
      return '';
    }

    // Public API methods
    open() {
      this.isOpen = true;
      this.isMinimized = false;
      this.unreadCount = 0;
      this.updateWidget();
    }

    close() {
      this.isOpen = false;
      this.updateWidget();
    }

    minimize() {
      this.minimizeWidget();
    }

    restore() {
      this.restoreWidget();
    }

    updateConfig(newConfig) {
      const oldTheme = this.config.theme;
      const oldPosition = this.config.position;
      
      Object.assign(this.config, newConfig);
      
      // Apply theme and position changes
      if (oldTheme !== this.config.theme || oldPosition !== this.config.position) {
        this.applyThemeAndPosition();
      }
      
      this.updateWidget();
    }

    destroy() {
      if (this.socket) {
        this.socket.close();
      }
      if (this.container) {
        this.container.remove();
      }
      clearTimeout(this.typingTimeout);
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
    }
  }

  // Global initialization function
  window.initChatBot = function (config) {
    if (chatbotInstance) {
      chatbotInstance.destroy();
    }
    chatbotInstance = new ChatBotWidget(config);
    return chatbotInstance;
  };

  // Auto-initialize if configuration is provided
  if (window.ChatBotConfig) {
    document.addEventListener('DOMContentLoaded', function() {
      window.initChatBot(window.ChatBotConfig);
    });
  }

  // Expose the ChatBot class globally
  window.ChatBotWidget = ChatBotWidget;

})(window, document);
