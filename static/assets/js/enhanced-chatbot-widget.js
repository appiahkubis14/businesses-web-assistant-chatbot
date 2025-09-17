(function (window, document) {
  'use strict';

  // Default configuration
  const defaultConfig = {
    apiUrl: 'http://172.20.10.2:5000',
    theme: 'green',
    position: 'bottom-right',
    botName: 'AI Assistant',
    welcomeMessage: "Hi! I'm your AI assistant. How can I help you today? 😊",
    enableSound: true,
    showTypingIndicator: true,
    maxMessages: 50,
    autoConnect: true,
    showAvatar: true,
    allowMinimize: true,
    allowClose: true,
    enableFileUpload: true,
    enableEmojis: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['image/*', '.pdf', '.doc', '.docx', '.txt', '.json', '.csv']
  };

  // Global chatbot instance
  let chatbotInstance = null;

  // Emoji data
  const emojiCategories = {
    'recent': ['😊', '👍', '❤️', '😂', '😢', '😮', '😡', '🤔'],
    'smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'],
    'gestures': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    'objects': ['📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '📀', '💿', '💾', '💽', '🗄️', '📁', '📂', '🗂️', '🗞️', '📰', '📑', '🔖', '📋', '📊', '📈', '📉', '📇', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️'],
    'travel': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🚁', '🛸', '✈️', '🛩️', '🚀', '🛰️', '💺', '⛵', '🚤', '🛥️', '🚢']
  };

  class ChatBotWidget {
    constructor(config = {}) {
      this.config = { ...defaultConfig, ...config };
      this.isOpen = false;
      this.isMinimized = false;
      this.messages = [];
      this.conversationId = this.generateUUID();
      this.unreadCount = 0;
      this.isLoading = false;
      this.socket = null;
      this.isConnected = false;
      this.typingTimeout = null;
      this.showEmojiPicker = false;
      this.uploadedFiles = [];
      this.dragCounter = 0;

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
      this.initializeSocket();
      this.addWelcomeMessage();
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
  overflow: hidden;
}

.chatbot-toggle-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, rgba(255,255,255,0.1) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.chatbot-toggle-btn:hover::before {
  opacity: 1;
}

.chatbot-toggle-btn:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: var(--chatbot-shadow-lg);
}

.chatbot-toggle-btn:active {
  transform: translateY(0) scale(0.95);
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
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
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
  position: relative;
}

.chatbot-widget.minimized {
  display: none;
}

.chatbot-widget.drag-over {
  border: 2px dashed var(--chatbot-blue-primary);
  background: var(--chatbot-blue-light);
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
  animation: chatbot-float 3s ease-in-out infinite;
}

@keyframes chatbot-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-2px); }
}

.chatbot-header-text h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(45deg, rgba(255,255,255,1), rgba(255,255,255,0.8));
  background-clip: text;
  -webkit-background-clip: text;
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
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
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
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.8;
  position: relative;
  overflow: hidden;
}

.chatbot-control-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.1);
  transform: scale(0);
  transition: transform 0.2s ease;
  border-radius: 8px;
}

.chatbot-control-btn:hover::before {
  transform: scale(1);
}

.chatbot-control-btn:hover {
  opacity: 1;
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

/* Messages Container */
.chatbot-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: linear-gradient(135deg, var(--chatbot-gray-50) 0%, #fafbfc 100%);
  scroll-behavior: smooth;
  position: relative;
}

.chatbot-messages::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to bottom, rgba(249, 250, 251, 1), rgba(249, 250, 251, 0));
  pointer-events: none;
  z-index: 1;
}

.chatbot-messages::-webkit-scrollbar {
  width: 4px;
}

.chatbot-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chatbot-messages::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, var(--chatbot-gray-300), var(--chatbot-gray-400));
  border-radius: 2px;
}

.chatbot-messages::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, var(--chatbot-gray-400), var(--chatbot-gray-500));
}

/* Message */
.chatbot-message {
  display: flex;
  margin-bottom: 16px;
  animation: chatbot-fadeIn 0.3s ease;
  position: relative;
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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
}

.chatbot-message-avatar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, rgba(255,255,255,0.2) 0%, transparent 100%);
}

.chatbot-message.user .chatbot-message-avatar {
  order: 2;
  margin-right: 0;
  margin-left: 12px;
  background: linear-gradient(135deg, var(--chatbot-gray-600), var(--chatbot-gray-700));
  color: white;
}

.chatbot-message.assistant .chatbot-message-avatar {
  background: linear-gradient(135deg, var(--chatbot-blue-primary), var(--chatbot-blue-secondary));
  color: white;
}

.chatbot-message-content {
  max-width: 260px;
  background: var(--chatbot-white);
  border-radius: 18px;
  padding: 12px 16px;
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--chatbot-gray-200);
  backdrop-filter: blur(10px);
}

.chatbot-message-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.4));
  border-radius: inherit;
  z-index: -1;
}

.chatbot-message.user .chatbot-message-content {
  background: linear-gradient(135deg, var(--chatbot-blue-primary), var(--chatbot-blue-secondary));
  color: white;
  border-color: var(--chatbot-blue-primary);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.chatbot-message.assistant.error .chatbot-message-content {
  background: linear-gradient(135deg, var(--chatbot-red-light), #fde8e8);
  border-color: var(--chatbot-red-primary);
  color: var(--chatbot-red-dark);
}

.chatbot-message.assistant.welcome .chatbot-message-content {
  background: linear-gradient(135deg, var(--chatbot-blue-light), #e0f2fe);
  border-color: var(--chatbot-blue-primary);
  color: var(--chatbot-blue-dark);
}

.chatbot-message.assistant .chatbot-message-content {
  background: linear-gradient(135deg, var(--chatbot-blue-light), #e0f2fe);
  border-color: var(--chatbot-blue-primary);
  color: var(--chatbot-blue-dark);
}

.chatbot-message-content p {
  margin: 0;
  line-height: 1.5;
  font-size: 14px;
  word-wrap: break-word;
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
  font-weight: 500;
}

.chatbot-message.user .chatbot-message-timestamp {
  text-align: left;
}

/* File Attachment */
.chatbot-file-attachment {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.chatbot-file-icon {
  flex-shrink: 0;
}

.chatbot-file-info {
  flex: 1;
  min-width: 0;
}

.chatbot-file-name {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chatbot-file-size {
  font-size: 10px;
  opacity: 0.7;
}

.chatbot-file-preview {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  margin-top: 8px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.chatbot-file-preview:hover {
  transform: scale(1.02);
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
  position: relative;
}

.chatbot-input-form::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--chatbot-gray-200), transparent);
}

.chatbot-error-banner {
  background: linear-gradient(135deg, var(--chatbot-red-light), #fde8e8);
  color: var(--chatbot-red-dark);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--chatbot-red-primary);
  animation: chatbot-shake 0.5s ease-in-out;
}

@keyframes chatbot-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.chatbot-file-upload-area {
  margin-bottom: 12px;
  padding: 8px;
  border: 2px dashed var(--chatbot-gray-300);
  border-radius: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--chatbot-gray-500);
  background: var(--chatbot-gray-50);
  transition: all 0.2s ease;
  display: none;
}

.chatbot-file-upload-area.active {
  display: block;
}

.chatbot-file-upload-area.drag-over {
  border-color: var(--chatbot-blue-primary);
  background: var(--chatbot-blue-light);
  color: var(--chatbot-blue-dark);
}

.chatbot-uploaded-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.chatbot-uploaded-file {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--chatbot-gray-100);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  border: 1px solid var(--chatbot-gray-200);
}

.chatbot-uploaded-file-remove {
  background: var(--chatbot-red-primary);
  color: white;
  border: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  transition: background 0.2s ease;
}

.chatbot-uploaded-file-remove:hover {
  background: var(--chatbot-red-dark);
}

.chatbot-input-container {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  position: relative;
}

.chatbot-input-wrapper {
  flex: 1;
  position: relative;
}

.chatbot-message-input {
  width: 100%;
  border: 1px solid var(--chatbot-gray-300);
  border-radius: 20px;
  padding: 10px 16px 10px 45px;
  outline: none;
  font-size: 14px;
  transition: all 0.2s ease;
  background: var(--chatbot-gray-50);
  resize: none;
  min-height: 40px;
  max-height: 100px;
  line-height: 1.4;
}

.chatbot-message-input:focus {
  border-color: var(--chatbot-blue-primary);
  background: var(--chatbot-white);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.chatbot-message-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chatbot-input-actions {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: flex;
  gap: 4px;
  z-index: 2;
}

.chatbot-input-action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--chatbot-gray-200);
  color: var(--chatbot-gray-600);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.7;
}

.chatbot-input-action-btn:hover {
  opacity: 1;
  background: var(--chatbot-gray-300);
  transform: scale(1.05);
}

.chatbot-input-action-btn.active {
  background: var(--chatbot-blue-primary);
  color: white;
}

.chatbot-send-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--chatbot-blue-primary), var(--chatbot-blue-secondary));
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
  position: relative;
  overflow: hidden;
}

.chatbot-send-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, rgba(255,255,255,0.2) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.chatbot-send-button:hover:not(:disabled)::before {
  opacity: 1;
}

.chatbot-send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--chatbot-blue-dark), var(--chatbot-blue-primary));
  transform: translateY(-1px) scale(1.05);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
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

/* Emoji Picker */
.chatbot-emoji-picker {
  position: absolute;
  bottom: 60px;
  left: 0;
  width: 300px;
  height: 250px;
  background: var(--chatbot-white);
  border: 1px solid var(--chatbot-gray-200);
  border-radius: 12px;
  box-shadow: var(--chatbot-shadow-lg);
  display: none;
  flex-direction: column;
  z-index: 1000;
  animation: chatbot-slideUp 0.2s ease;
}

.chatbot-emoji-picker.show {
  display: flex;
}

.chatbot-emoji-picker-header {
  display: flex;
  padding: 8px;
  border-bottom: 1px solid var(--chatbot-gray-200);
  background: var(--chatbot-gray-50);
  border-radius: 12px 12px 0 0;
}

.chatbot-emoji-category-btn {
  flex: 1;
  padding: 6px 8px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  color: var(--chatbot-gray-600);
  transition: all 0.2s ease;
}

.chatbot-emoji-category-btn.active {
  background: var(--chatbot-blue-primary);
  color: white;
}

.chatbot-emoji-category-btn:hover:not(.active) {
  background: var(--chatbot-gray-200);
}

.chatbot-emoji-picker-content {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  align-content: start;
}

.chatbot-emoji-picker-content::-webkit-scrollbar {
  width: 4px;
}

.chatbot-emoji-picker-content::-webkit-scrollbar-thumb {
  background: var(--chatbot-gray-300);
  border-radius: 2px;
}

.chatbot-emoji-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.1s ease;
}

.chatbot-emoji-btn:hover {
  background: var(--chatbot-gray-100);
  transform: scale(1.2);
}

/* File Upload Input */
.chatbot-file-input {
  display: none;
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
  overflow: hidden;
}

.chatbot-minimized-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.05), rgba(34, 197, 94, 0.05));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.chatbot-minimized-btn:hover::before {
  opacity: 1;
}

.chatbot-minimized-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--chatbot-shadow-lg);
  border-color: var(--chatbot-blue-primary);
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

  .chatbot-emoji-picker {
    width: 280px;
    height: 200px;
  }

  .chatbot-emoji-picker-content {
    grid-template-columns: repeat(6, 1fr);
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
  .chatbot-minimized-btn,
  .chatbot-emoji-picker {
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

  .chatbot-header-icon {
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
    background: linear-gradient(135deg, var(--chatbot-gray-50) 0%, #0f172a 100%);
  }
  
  .chatbot-message-content {
    background: var(--chatbot-green-light);
    border-color: var(--chatbot-gray-300);
    color: var(--chatbot-green-dark);
  }
  
  .chatbot-message-input {
    background: var(--chatbot-green-light);
    border-color: var(--chatbot-gray-300);
    color: white;
  }
  
  .chatbot-minimized-btn {
    background: var(--chatbot-gray-100);
    border-color: var(--chatbot-gray-300);
    color: white;
  }

  .chatbot-emoji-picker {
    background: var(--chatbot-gray-100);
    border-color: var(--chatbot-gray-300);
  }

  .chatbot-emoji-picker-header {
    background: var(--chatbot-gray-200);
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
              <div class="chatbot-header-icon">${this.getSVGIcon('bot', 20)}</div>
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
            ${this.renderFileUploadArea()}
            ${this.renderUploadedFiles()}
            <div class="chatbot-input-container">
              <div class="chatbot-input-wrapper">
                <div class="chatbot-input-actions">
                  ${this.config.enableEmojis ? `
                    <button type="button" class="chatbot-input-action-btn ${this.showEmojiPicker ? 'active' : ''}" data-action="toggle-emoji" title="Add emoji">
                      ${this.getSVGIcon('smile', 16)}
                    </button>
                  ` : ''}
                  ${this.config.enableFileUpload ? `
                    <button type="button" class="chatbot-input-action-btn" data-action="upload-file" title="Upload file">
                      ${this.getSVGIcon('paperclip', 16)}
                    </button>
                  ` : ''}
                </div>
                <textarea
                  id="chatbot-input"
                  placeholder="Type your message..."
                  class="chatbot-message-input"
                  rows="1"
                  ${this.isLoading ? 'disabled' : ''}
                ></textarea>
                ${this.config.enableEmojis ? this.renderEmojiPicker() : ''}
              </div>
              <button type="submit" class="chatbot-send-button" ${this.isLoading ? 'disabled' : ''}>
                ${this.isLoading ? this.getSVGIcon('loader', 18, 'spinning') : this.getSVGIcon('send', 18)}
              </button>
            </div>
            ${this.config.enableFileUpload ? '<input type="file" class="chatbot-file-input" multiple>' : ''}
          </form>
        </div>

        ${this.isMinimized ? this.renderMinimizedButton() : ''}
      `;
    }

    renderFileUploadArea() {
      if (!this.config.enableFileUpload) return '';
      
      return `
        <div class="chatbot-file-upload-area" id="chatbot-file-upload-area">
          <div>📁 Drop files here or click to upload</div>
          <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">
            Max ${this.formatFileSize(this.config.maxFileSize)} • ${this.config.allowedFileTypes.join(', ')}
          </div>
        </div>
      `;
    }

    renderUploadedFiles() {
      if (!this.uploadedFiles.length) return '';
      
      return `
        <div class="chatbot-uploaded-files">
          ${this.uploadedFiles.map((file, index) => `
            <div class="chatbot-uploaded-file">
              ${this.getSVGIcon('file', 12)}
              <span>${file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}</span>
              <button type="button" class="chatbot-uploaded-file-remove" data-file-index="${index}" title="Remove file">
                ×
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    renderEmojiPicker() {
      const categories = Object.keys(emojiCategories);
      const activeCategory = this.activeEmojiCategory || 'recent';
      
      return `
        <div class="chatbot-emoji-picker ${this.showEmojiPicker ? 'show' : ''}" id="chatbot-emoji-picker">
          <div class="chatbot-emoji-picker-header">
            ${categories.map(category => `
              <button type="button" class="chatbot-emoji-category-btn ${category === activeCategory ? 'active' : ''}" data-category="${category}">
                ${category === 'recent' ? '🕒' : category === 'smileys' ? '😊' : category === 'gestures' ? '👋' : category === 'objects' ? '📱' : '🚗'}
              </button>
            `).join('')}
          </div>
          <div class="chatbot-emoji-picker-content" id="chatbot-emoji-picker-content">
            ${emojiCategories[activeCategory].map(emoji => `
              <button type="button" class="chatbot-emoji-btn" data-emoji="${emoji}">${emoji}</button>
            `).join('')}
          </div>
        </div>
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
              ${message.files ? this.renderMessageFiles(message.files) : ''}
              <div class="chatbot-message-timestamp">
                ${this.formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        `;
      }).join('') + (this.isLoading ? this.renderTypingIndicator() : '');
    }

    renderMessageFiles(files) {
      return files.map(file => {
        if (file.type.startsWith('image/')) {
          return `
            <img src="${file.url || URL.createObjectURL(file)}" 
                 alt="${file.name}" 
                 class="chatbot-file-preview"
                 onclick="window.open(this.src, '_blank')" />
          `;
        } else {
          return `
            <div class="chatbot-file-attachment">
              <div class="chatbot-file-icon">${this.getSVGIcon('file', 16)}</div>
              <div class="chatbot-file-info">
                <div class="chatbot-file-name">${file.name}</div>
                <div class="chatbot-file-size">${this.formatFileSize(file.size)}</div>
              </div>
            </div>
          `;
        }
      }).join('');
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
      // Basic markdown-like formatting with better emoji support
      return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>')
        .replace(/([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/gu, '<span style="font-size: 1.2em;">$1</span>');
    }

    formatTimestamp(timestamp) {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        'loader': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
        'smile': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
        'paperclip': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        'file': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/></svg>`
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
            case 'toggle-emoji':
              this.toggleEmojiPicker();
              break;
            case 'upload-file':
              this.triggerFileUpload();
              break;
          }
        } else if (target.closest('.chatbot-toggle-btn')) {
          this.toggleWidget();
        } else if (target.closest('.chatbot-emoji-btn')) {
          this.insertEmoji(target.dataset.emoji);
        } else if (target.closest('.chatbot-emoji-category-btn')) {
          this.switchEmojiCategory(target.dataset.category);
        } else if (target.closest('.chatbot-uploaded-file-remove')) {
          this.removeUploadedFile(parseInt(target.dataset.fileIndex));
        }
      });

      // Form submission
      this.container.addEventListener('submit', (e) => {
        if (e.target.id === 'chatbot-form') {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // File upload change
      this.container.addEventListener('change', (e) => {
        if (e.target.classList.contains('chatbot-file-input')) {
          this.handleFileUpload(e.target.files);
        }
      });

      // Input events
      this.container.addEventListener('input', (e) => {
        if (e.target.id === 'chatbot-input') {
          this.autoResizeTextarea(e.target);
        }
      });

      // Drag and drop events
      this.container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.config.enableFileUpload) {
          this.handleDragOver(e);
        }
      });

      this.container.addEventListener('dragleave', (e) => {
        if (this.config.enableFileUpload) {
          this.handleDragLeave(e);
        }
      });

      this.container.addEventListener('drop', (e) => {
        e.preventDefault();
        if (this.config.enableFileUpload) {
          this.handleDrop(e);
        }
      });

      // Click outside to close emoji picker
      document.addEventListener('click', (e) => {
        if (this.showEmojiPicker && !e.target.closest('.chatbot-emoji-picker') && !e.target.closest('[data-action="toggle-emoji"]')) {
          this.hideEmojiPicker();
        }
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen && !this.isMinimized) {
          if (this.showEmojiPicker) {
            this.hideEmojiPicker();
          } else if (this.config.allowMinimize) {
            this.minimizeWidget();
          } else if (this.config.allowClose) {
            this.closeWidget();
          }
        }
      });

      // Enter key handling for textarea
      this.container.addEventListener('keydown', (e) => {
        if (e.target.id === 'chatbot-input' && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    toggleEmojiPicker() {
      this.showEmojiPicker = !this.showEmojiPicker;
      this.activeEmojiCategory = this.activeEmojiCategory || 'recent';
      this.updateWidget();
    }

    hideEmojiPicker() {
      this.showEmojiPicker = false;
      this.updateWidget();
    }

    switchEmojiCategory(category) {
      this.activeEmojiCategory = category;
      const content = document.getElementById('chatbot-emoji-picker-content');
      if (content) {
        content.innerHTML = emojiCategories[category].map(emoji => `
          <button type="button" class="chatbot-emoji-btn" data-emoji="${emoji}">${emoji}</button>
        `).join('');
      }
      
      // Update active category button
      const buttons = this.container.querySelectorAll('.chatbot-emoji-category-btn');
      buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
      });
    }

    insertEmoji(emoji) {
      const input = document.getElementById('chatbot-input');
      if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
        this.autoResizeTextarea(input);
        
        // Add to recent emojis
        if (!emojiCategories.recent.includes(emoji)) {
          emojiCategories.recent.unshift(emoji);
          emojiCategories.recent = emojiCategories.recent.slice(0, 8);
        }
      }
      this.hideEmojiPicker();
    }

    triggerFileUpload() {
      const fileInput = this.container.querySelector('.chatbot-file-input');
      if (fileInput) {
        fileInput.click();
      }
    }

    handleFileUpload(files) {
      Array.from(files).forEach(file => {
        if (this.validateFile(file)) {
          this.uploadedFiles.push(file);
        }
      });
      this.updateWidget();
    }

    validateFile(file) {
      // Check file size
      if (file.size > this.config.maxFileSize) {
        this.showError(`File "${file.name}" is too large. Maximum size is ${this.formatFileSize(this.config.maxFileSize)}.`);
        return false;
      }

      // Check file type
      const isValidType = this.config.allowedFileTypes.some(type => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        } else if (type.includes('/')) {
          return file.type.match(type.replace('*', '.*'));
        }
        return false;
      });

      if (!isValidType) {
        this.showError(`File type "${file.type}" is not allowed.`);
        return false;
      }

      return true;
    }

    removeUploadedFile(index) {
      this.uploadedFiles.splice(index, 1);
      this.updateWidget();
    }

    handleDragOver(e) {
      this.dragCounter++;
      const widget = this.container.querySelector('.chatbot-widget');
      const uploadArea = document.getElementById('chatbot-file-upload-area');
      
      if (widget) {
        widget.classList.add('drag-over');
      }
      if (uploadArea) {
        uploadArea.classList.add('active', 'drag-over');
      }
    }

    handleDragLeave(e) {
      this.dragCounter--;
      if (this.dragCounter === 0) {
        const widget = this.container.querySelector('.chatbot-widget');
        const uploadArea = document.getElementById('chatbot-file-upload-area');
        
        if (widget) {
          widget.classList.remove('drag-over');
        }
        if (uploadArea) {
          uploadArea.classList.remove('drag-over');
        }
      }
    }

    handleDrop(e) {
      this.dragCounter = 0;
      const widget = this.container.querySelector('.chatbot-widget');
      const uploadArea = document.getElementById('chatbot-file-upload-area');
      
      if (widget) {
        widget.classList.remove('drag-over');
      }
      if (uploadArea) {
        uploadArea.classList.remove('active', 'drag-over');
      }

      const files = e.dataTransfer.files;
      this.handleFileUpload(files);
    }

    showError(message) {
      // You could implement a toast notification system here
      console.error(message);
      alert(message); // Simple fallback
    }

    initializeSocket() {
      if (!this.config.autoConnect) return;

      try {
        // Parse the API URL to extract host and port correctly
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // This includes the correct port
        
        const wsUrl = `${wsProtocol}//${host}/ws/chat/${this.conversationId}/`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          this.isConnected = true;
          this.updateConnectionStatus();
          console.log('WebSocket connection established');
          
          // Send a ping to keep connection alive
          this.keepAliveInterval = setInterval(() => {
            if (this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000); // Ping every 30 seconds
        };

        this.socket.onclose = (event) => {
          this.isConnected = false;
          this.updateConnectionStatus();
          console.log('WebSocket connection closed', event.code, event.reason);
          
          // Clear the keep-alive interval
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
          }
          
          // Try to reconnect after 5 seconds
          setTimeout(() => this.initializeSocket(), 5000);
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnected = false;
          this.updateConnectionStatus();
        };

        this.socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            
            // Handle pong responses
            if (data.type === 'pong') {
              return; // Just ignore pong messages
            }

            if (data.type === 'chat_message') {
              this.addMessage({
                role: data.role,
                content: data.message,
                timestamp: new Date().toISOString()
              });
              this.isLoading = false;
              this.updateWidget();
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        console.warn('WebSocket not available, using HTTP fallback');
      }
    }

    async sendMessage() {
      const input = document.getElementById('chatbot-input');
      if (!input || (!input.value.trim() && !this.uploadedFiles.length) || this.isLoading) return;

      const message = input.value.trim();
      const files = [...this.uploadedFiles];
      
      input.value = '';
      this.uploadedFiles = [];
      this.autoResizeTextarea(input);

      this.addMessage({
        role: 'user',
        content: message || '📎 File attachment',
        files: files,
        timestamp: new Date().toISOString()
      });

      this.isLoading = true;
      this.updateWidget();

      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          // Send via WebSocket with file data
          const payload = {
            type: 'chat_message',
            message: message,
            conversationId: this.conversationId,
            files: files.length > 0 ? await this.prepareFilesForUpload(files) : undefined
          };
          
          this.socket.send(JSON.stringify(payload));
        } else {
          // Fallback to HTTP with FormData for file support
          const formData = new FormData();
          formData.append('message', message);
          formData.append('conversationId', this.conversationId);
          
          files.forEach((file, index) => {
            formData.append(`file_${index}`, file);
          });

          const response = await fetch(`${this.config.apiUrl}/api/chat/${this.config.websiteId}/`, {
            method: 'POST',
            headers: {
              'X-CSRFToken': this.getCSRFToken()
            },
            body: formData
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          this.addMessage({
            role: 'assistant',
            content: data.response,
            timestamp: data.timestamp || new Date().toISOString()
          });
          this.isLoading = false;
          this.updateWidget();
        }
      } catch (error) {
        console.error('Error sending message:', error);
        this.addMessage({
          role: 'assistant',
          content: '❌ **Error:** Failed to send message. Please try again.',
          timestamp: new Date().toISOString(),
          isError: true
        });
        this.isLoading = false;
        this.updateWidget();
      }
    }

    async prepareFilesForUpload(files) {
      // Convert files to base64 for WebSocket transmission
      const filePromises = files.map(async (file) => {
        const base64 = await this.fileToBase64(file);
        return {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64
        };
      });
      
      return Promise.all(filePromises);
    }

    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
      });
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
        this.showEmojiPicker = false;
      }
      this.updateWidget();
    }

    closeWidget() {
      this.isOpen = false;
      this.showEmojiPicker = false;
      this.updateWidget();
    }

    minimizeWidget() {
      this.isMinimized = true;
      this.showEmojiPicker = false;
      this.updateWidget();
    }

    restoreWidget() {
      this.isMinimized = false;
      this.unreadCount = 0;
      this.updateWidget();
    }

    clearConversation() {
      this.messages = [];
      this.conversationId = this.generateUUID();
      this.unreadCount = 0;
      this.uploadedFiles = [];
      this.showEmojiPicker = false;
      this.addWelcomeMessage();

      if (this.socket) {
        this.socket.send(JSON.stringify({
          type: 'join-conversation',
          conversationId: this.conversationId
        }));
      }

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
          this.autoResizeTextarea(input);
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
      this.showEmojiPicker = false;
      this.updateWidget();
    }

    minimize() {
      this.minimizeWidget();
    }

    restore() {
      this.restoreWidget();
    }

    destroy() {
      if (this.socket) {
        this.socket.close();
      }
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
      if (this.container) {
        this.container.remove();
      }
      clearTimeout(this.typingTimeout);
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