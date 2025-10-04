(function (window, document) {
  'use strict';

  // Default configuration
  const defaultConfig = {
    apiUrl: 'http://172.20.10.2:5000',
    theme: 'green',
    position: 'bottom-right',
    websiteId: null,
    botName: 'AI Assistant',
    welcomeMessage: "",
    enableSound: true,
    showTypingIndicator: true,
    maxMessages: 50,
    autoConnect: true,
    showAvatar: true,
    allowMinimize: true,
    allowClose: true,
    enableVoiceRecording: true,
    enableFileAttachment: true,
    enableEmojis: true,
    maxFileSize: 10 * 1024 * 1024,
    allowedFileTypes: ['image/*', 'audio/*', 'video/*', '.pdf', '.doc', '.docx', '.txt']
  };

  // Global chatbot instance
  let chatbotInstance = null;

  class ChatBotWidget {
    constructor(config = {}) {
      this.config = { ...defaultConfig, ...config };
      this.isOpen = false;
      this.isMinimized = false;
      this.messages = [];
      this.websiteId = this.config.websiteId || 'default-website';
      this.conversationId = this.generateUUID();
      this.unreadCount = 0;
      this.isLoading = false;
      this.socket = null;
      this.isConnected = false;
      this.typingTimeout = null;

      this.isRecording = false;
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.showEmojiPicker = false;
      this.attachedFiles = [];
      this.recordingStartTime = null;
      this.recordingInterval = null;
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
    }

    loadCSS() {
      if (document.getElementById('chatbot-widget-styles')) return;

      const css = `
        /* Enhanced Chat Widget Styles */
        .chatbot-widget-container {
          position: fixed;
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        }

        .chatbot-widget-container.bottom-right {
          bottom: 24px;
          right: 24px;
        }

        .chatbot-widget {
          width: 380px;
          height: 600px;
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 20px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .chatbot-widget.minimized {
          display: none;
        }

        /* Enhanced Header */
        .chatbot-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .chatbot-header-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .chatbot-avatar {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.3);
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

        .chatbot-header-controls {
          display: flex;
          gap: 8px;
        }

        .chatbot-control-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
        }

        .chatbot-control-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }

        /* Enhanced Messages Area */
        .chatbot-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 16px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .chatbot-messages::-webkit-scrollbar {
          display: none;
        }

        .chatbot-message {
          display: flex;
          gap: 8px;
          animation: messageSlideIn 0.3s ease-out;
        }

        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chatbot-message.user {
          justify-content: flex-end;
        }

        .chatbot-message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #667eea;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          flex-shrink: 0;
        }

        .chatbot-message.user .chatbot-message-avatar {
          background: #10b981;
        }

        .chatbot-message-content {
          max-width: 280px;
          padding: 12px 16px;
          border-radius: 18px;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
        }

        .chatbot-message.user .chatbot-message-content {
          background: #667eea;
          color: white;
          border-color: #667eea;
        }

        .chatbot-message-timestamp {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 4px;
        }

        /* Enhanced Input Area */
        .chatbot-input-form {
          border-top: 1px solid #e2e8f0;
          background: white;
          padding: 0;
        }

        .chatbot-input-container {
          padding: 16px 20px;
          position: relative;
        }

        .chatbot-input-wrapper {
          position: relative;
          margin-bottom: 12px;
        }

        .chatbot-message-input {
          width: 100%;
          border: 2px solid #e2e8f0;
          border-radius: 25px;
          padding: 12px 50px 12px 16px;
          resize: none;
          font-size: 14px;
          line-height: 1.4;
          transition: all 0.2s ease;
          background: white;
          max-height: 120px;
          min-height: 44px;
          font-family: inherit;
          scrollbar-width: none;
        }

        .chatbot-message-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .chatbot-message-input::-webkit-scrollbar {
          display: none;
        }

        /* Enhanced Send Button */
        .chatbot-send-button {
          position: absolute;
          right: 8px;
          bottom: 8px;
          background: #667eea;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          transform: scale(1);
        }

        .chatbot-send-button:hover:not(:disabled) {
          background: #5a6fd8;
          transform: scale(1.05);
        }

        .chatbot-send-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: scale(1);
        }

        .chatbot-send-button .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Enhanced Input Controls */
        .chatbot-input-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .chatbot-input-control-btn {
          background: none;
          border: none;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chatbot-input-control-btn:hover {
          background: #f1f5f9;
          color: #334155;
        }

        .chatbot-input-control-btn.recording {
          color: #ef4444;
          background: #fef2f2;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { 
            transform: scale(1);
            box-shadow: none;
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
          }
        }

        /* Enhanced Emoji Picker */
        .chatbot-emoji-picker {
          position: absolute;
          bottom: 100%;
          right: 0;
          margin-bottom: 8px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          width: 300px;
          max-height: 200px;
          z-index: 1000;
          animation: emojiSlideUp 0.2s ease-out;
          overflow: hidden;
        }

        @keyframes emojiSlideUp {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .chatbot-emoji-picker-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          background: #f8fafc;
        }

        .chatbot-emoji-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 4px;
          padding: 12px;
          max-height: 160px;
          overflow-y: auto;
          scrollbar-width: none;
        }

        .chatbot-emoji-grid::-webkit-scrollbar {
          display: none;
        }

        .chatbot-emoji-item {
          width: 32px;
          height: 32px;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: all 0.2s ease;
        }

        .chatbot-emoji-item:hover {
          background: #f1f5f9;
          transform: scale(1.1);
        }

        /* Enhanced Audio Recording */
        .chatbot-recording-timer {
          position: absolute;
          bottom: 100%;
          left: 0;
          background: #ef4444;
          color: white;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 8px;
          animation: timerSlideUp 0.2s ease-out;
        }

        @keyframes timerSlideUp {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chatbot-audio-preview {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
          margin: 8px 0;
          border: 1px solid #e2e8f0;
        }

        .chatbot-audio-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .chatbot-audio-play-btn {
          background: #667eea;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chatbot-audio-play-btn:hover {
          background: #5a6fd8;
          transform: scale(1.05);
        }

        .chatbot-audio-waveform {
          flex: 1;
          height: 20px;
          background: linear-gradient(90deg, 
            #667eea 0%, #667eea 50%, 
            #e2e8f0 50%, #e2e8f0 100%);
          background-size: 200% 100%;
          border-radius: 10px;
          overflow: hidden;
        }

        .chatbot-audio-duration {
          font-size: 12px;
          color: #64748b;
          min-width: 40px;
        }

        /* Enhanced File Attachments */
        .chatbot-attached-files {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
          padding: 0 20px;
        }

        .chatbot-attached-file-preview {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 12px;
          max-width: 200px;
        }

        .chatbot-attached-file-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .chatbot-remove-file-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          color: #64748b;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .chatbot-remove-file-btn:hover {
          background: #e2e8f0;
          color: #374151;
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
          transition: all 0.3s ease;
        }

        .chatbot-toggle-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(102, 126, 234, 0.5);
        }

        /* Responsive */
        @media (max-width: 480px) {
          .chatbot-widget {
            width: 100vw;
            height: 100vh;
            border-radius: 0;
          }
          
          .chatbot-widget-container.bottom-right {
            bottom: 0;
            right: 0;
            width: 100%;
            height: 100%;
          }
          
          .chatbot-emoji-picker {
            width: calc(100vw - 40px);
            right: 20px;
            left: 20px;
          }
        }
      `;

      const style = document.createElement('style');
      style.id = 'chatbot-widget-styles';
      style.innerHTML = css;
      document.head.appendChild(style);
    }

    createWidget() {
      const existingWidget = document.getElementById('chatbot-widget-container');
      if (existingWidget) {
        existingWidget.remove();
      }
      
      const container = document.createElement('div');
      container.id = 'chatbot-widget-container';
      container.className = `chatbot-widget-container ${this.config.position}`;
      container.innerHTML = this.renderToggleButton();
      document.body.appendChild(container);
      this.container = container;
      
      this.createFileInput();
    }

    createFileInput() {
      if (!this.config.enableFileAttachment) return;
      
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'chatbot-file-input';
      fileInput.className = 'chatbot-file-input';
      fileInput.multiple = true;
      fileInput.accept = this.config.allowedFileTypes.join(',');
      
      fileInput.addEventListener('change', (e) => {
        this.handleFileSelection(e.target.files);
      });
      
      this.container.appendChild(fileInput);
    }

    renderToggleButton() {
      const unreadBadge = this.unreadCount > 0 ?
        `<span class="chatbot-unread-badge">${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>` : '';

      return `
        <button class="chatbot-toggle-btn" title="Chat with ${this.config.botName}">
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
        <div class="chatbot-widget ${this.isMinimized ? 'minimized' : ''}">
          <!-- Header -->
          <div class="chatbot-header">
            <div class="chatbot-header-info">
              <div class="chatbot-avatar">
                ${this.getSVGIcon('bot', 20)}
              </div>
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

          <!-- Input Area -->
          <form class="chatbot-input-form" id="chatbot-form">
            ${this.attachedFiles.length > 0 ? this.renderAttachedFiles() : ''}
            ${this.isRecording ? this.renderRecordingTimer() : ''}
            <div class="chatbot-input-container">
              <div class="chatbot-input-wrapper">
                <textarea
                  id="chatbot-input"
                  placeholder="Type your message..."
                  class="chatbot-message-input"
                  ${this.isLoading ? 'disabled' : ''}
                ></textarea>
                <button type="submit" class="chatbot-send-button" ${this.isLoading || this.isRecording ? 'disabled' : ''}>
                  ${this.isLoading ? this.getSVGIcon('loader', 18, 'spinning') : this.getSVGIcon('send', 18)}
                </button>
              </div>
              <div class="chatbot-input-controls">
                ${this.config.enableEmojis ? `
                  <button type="button" class="chatbot-input-control-btn" data-action="toggle-emoji" title="Add emoji">
                    ${this.getSVGIcon('smile', 16)}
                  </button>
                ` : ''}
                ${this.config.enableFileAttachment ? `
                  <button type="button" class="chatbot-input-control-btn" data-action="attach-file" title="Attach file">
                    ${this.getSVGIcon('paperclip', 16)}
                  </button>
                ` : ''}
                ${this.config.enableVoiceRecording ? `
                  <button type="button" class="chatbot-input-control-btn ${this.isRecording ? 'recording' : ''}" data-action="toggle-recording" title="${this.isRecording ? 'Stop recording' : 'Record voice message'}">
                    ${this.getSVGIcon('mic', 16)}
                  </button>
                ` : ''}
              </div>
            </div>
            ${this.showEmojiPicker ? this.renderEmojiPicker() : ''}
          </form>
        </div>
      `;
    }

    renderAttachedFiles() {
      if (this.attachedFiles.length === 0) return '';
      
      return `
        <div class="chatbot-attached-files">
          ${this.attachedFiles.map((file, index) => `
            <div class="chatbot-attached-file-preview">
              <span class="chatbot-attached-file-name" title="${file.name}">${file.name}</span>
              <button type="button" class="chatbot-remove-file-btn" data-index="${index}" title="Remove file">
                ${this.getSVGIcon('x', 12)}
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    renderEmojiPicker() {
      const commonEmojis = [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
        '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
        '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪',
        '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨',
        '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
        '😔', '😕', '🙁', '😖', '😣', '😞', '😓', '😩',
        '😫', '🥱', '😴', '😪', '😵', '🤯', '🥳', '🤓'
      ];
      
      return `
        <div class="chatbot-emoji-picker">
          <div class="chatbot-emoji-picker-header">Choose an emoji</div>
          <div class="chatbot-emoji-grid">
            ${commonEmojis.map(emoji => `
              <button type="button" class="chatbot-emoji-item" data-emoji="${emoji}">${emoji}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    renderRecordingTimer() {
      const duration = this.getRecordingDuration();
      return `
        <div class="chatbot-recording-timer">
          ⏺️ Recording: ${duration}
        </div>
      `;
    }

    renderMessages() {
      return this.messages.map((message, index) => {
        const avatar = this.config.showAvatar ?
          `<div class="chatbot-message-avatar">
            ${message.role === 'user' ? this.getSVGIcon('user', 16) : this.getSVGIcon('bot', 16)}
          </div>` : '';

        return `
          <div class="chatbot-message ${message.role}">
            ${avatar}
            <div class="chatbot-message-content">
              <div>${this.formatMessage(message.content)}</div>
              <div class="chatbot-message-timestamp">
                ${this.formatTimestamp(message.timestamp)}
              </div>
            </div>
          </div>
        `;
      }).join('') + (this.isLoading ? this.renderTypingIndicator() : '');
    }

    renderTypingIndicator() {
      return `
        <div class="chatbot-message assistant">
          <div class="chatbot-message-avatar">${this.getSVGIcon('bot', 16)}</div>
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

    getRecordingDuration() {
      if (!this.recordingStartTime) return '0:00';
      const seconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
        'mic': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
        'paperclip': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        'smile': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
      };
      return icons[name] || '';
    }

    bindEvents() {
      this.container.addEventListener('click', (e) => {
        this.handleClick(e);
      });

      this.container.addEventListener('submit', (e) => {
        if (e.target.id === 'chatbot-form') {
          e.preventDefault();
          this.sendMessage();
        }
      });

      this.container.addEventListener('input', (e) => {
        if (e.target.id === 'chatbot-input') {
          this.autoResizeTextarea(e.target);
        }
      });

      document.addEventListener('click', (e) => {
        if (this.showEmojiPicker && !e.target.closest('.chatbot-emoji-picker') && !e.target.closest('[data-action="toggle-emoji"]')) {
          this.showEmojiPicker = false;
          this.updateWidget();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen && !this.isMinimized) {
          if (this.showEmojiPicker) {
            this.showEmojiPicker = false;
            this.updateWidget();
          }
        }
      });
    }

    handleClick(e) {
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
          case 'toggle-emoji':
            this.toggleEmojiPicker();
            break;
          case 'attach-file':
            this.triggerFileSelection();
            break;
          case 'toggle-recording':
            this.toggleRecording();
            break;
        }
      } else if (target.closest('.chatbot-toggle-btn')) {
        this.toggleWidget();
      } else if (target.closest('.chatbot-emoji-item')) {
        this.insertEmoji(target.dataset.emoji);
      } else if (target.closest('.chatbot-remove-file-btn')) {
        this.removeAttachedFile(parseInt(target.closest('.chatbot-remove-file-btn').dataset.index));
      }
    }

    autoResizeTextarea(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    toggleEmojiPicker() {
      this.showEmojiPicker = !this.showEmojiPicker;
      this.updateWidget();
    }

    insertEmoji(emoji) {
      const input = document.getElementById('chatbot-input');
      if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.slice(0, start) + emoji + text.slice(end);
        input.setSelectionRange(start + emoji.length, start + emoji.length);
        input.focus();
      }
      this.showEmojiPicker = false;
      this.updateWidget();
    }

    triggerFileSelection() {
      const fileInput = document.getElementById('chatbot-file-input');
      if (fileInput) {
        fileInput.click();
      }
    }

    handleFileSelection(files) {
      for (let file of files) {
        if (file.size > this.config.maxFileSize) {
          alert(`File "${file.name}" is too large. Maximum size is ${this.formatFileSize(this.config.maxFileSize)}.`);
          continue;
        }
        
        if (this.attachedFiles.length >= 5) {
          alert('Maximum 5 files can be attached at once.');
          break;
        }
        
        this.attachedFiles.push(file);
      }
      
      this.updateWidget();
    }

    removeAttachedFile(index) {
      this.attachedFiles.splice(index, 1);
      this.updateWidget();
    }

    async toggleRecording() {
      if (this.isRecording) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    }

    async startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          } 
        });
        
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        this.audioChunks = [];
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        
        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          this.handleAudioRecording(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };
        
        this.mediaRecorder.start(100);
        this.updateWidget();
        
        this.recordingInterval = setInterval(() => {
          this.updateWidget();
        }, 1000);
        
      } catch (error) {
        console.error('Error starting recording:', error);
        alert('Unable to access microphone. Please check your permissions.');
      }
    }

    async stopRecording() {
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.recordingStartTime = null;
        
        if (this.recordingInterval) {
          clearInterval(this.recordingInterval);
          this.recordingInterval = null;
        }
        
        this.updateWidget();
      }
    }

    handleAudioRecording(audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioFile = new File([audioBlob], `voice-message-${Date.now()}.webm`, { 
        type: 'audio/webm'
      });
      
      this.attachedFiles.push(audioFile);
      
      // Add audio preview to messages
      this.addMessage({
        role: 'user',
        content: this.renderAudioPreview(audioUrl),
        timestamp: new Date().toISOString()
      });
      
      this.updateWidget();
    }

    renderAudioPreview(audioUrl) {
      return `
        <div class="chatbot-audio-preview">
          <div class="chatbot-audio-controls">
            <button class="chatbot-audio-play-btn" onclick="chatbotInstance.playAudio('${audioUrl}')">
              ${this.getSVGIcon('play', 16)}
            </button>
            <div class="chatbot-audio-waveform"></div>
            <div class="chatbot-audio-duration">${this.getRecordingDuration()}</div>
          </div>
        </div>
      `;
    }

    playAudio(url) {
      const audio = new Audio(url);
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
      });
    }

    initializeSocket() {
      if (!this.config.autoConnect) return;

      try {
        const backendUrl = new URL(this.config.apiUrl);
        const wsProtocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${backendUrl.host}/ws/chat/${this.conversationId}/`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
          this.isConnected = true;
          this.updateConnectionStatus();
        };

        this.socket.onclose = () => {
          this.isConnected = false;
          this.updateConnectionStatus();
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
        console.warn('WebSocket not available');
      }
    }

    async sendMessage() {
      const input = document.getElementById('chatbot-input');
      if (!input || !input.value.trim() || this.isLoading || this.isRecording) return;

      const message = input.value.trim();
      input.value = '';

      this.addMessage({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      this.isLoading = true;
      this.updateWidget();

      try {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: 'chat_message',
            message: message,
            websiteId: this.websiteId,
            conversationId: this.conversationId
          }));
        } else {
          // HTTP fallback
          const response = await fetch(`${this.config.apiUrl}/api/chat/${this.config.websiteId}/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: message,
              conversationId: this.conversationId
            })
          });

          if (response.ok) {
            const data = await response.json();
            this.addMessage({
              role: 'assistant',
              content: data.response,
              timestamp: data.timestamp || new Date().toISOString()
            });
          } else {
            throw new Error('HTTP error');
          }
        }
      } catch (error) {
        console.error('Error sending message:', error);
        this.addMessage({
          role: 'assistant',
          content: '❌ **Error:** Failed to send message. Please try again.',
          timestamp: new Date().toISOString(),
          isError: true
        });
      } finally {
        this.isLoading = false;
        this.updateWidget();
      }
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

    addMessage(message) {
      this.messages.push(message);
      if (this.messages.length > this.config.maxMessages) {
        this.messages = this.messages.slice(-this.config.maxMessages);
      }

      if ((!this.isOpen || this.isMinimized) && message.role === 'assistant') {
        this.unreadCount++;
        this.playNotificationSound();
      }
    }

    toggleWidget() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        this.unreadCount = 0;
        this.isMinimized = false;
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

    clearConversation() {
      this.messages = [];
      this.conversationId = this.generateUUID();
      this.unreadCount = 0;
      this.updateWidget();
    }

    toggleSound() {
      this.config.enableSound = !this.config.enableSound;
      this.updateWidget();
    }

    playNotificationSound() {
      if (!this.config.enableSound) return;
      // Simple notification sound implementation
    }

    updateWidget() {
      if (this.isOpen) {
        this.container.innerHTML = this.renderWidget();
        this.scrollToBottom();
        
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

    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Public API
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

    destroy() {
      if (this.socket) {
        this.socket.close();
      }
      if (this.container) {
        this.container.remove();
      }
    }
  }

  // Global initialization
  window.initChatBot = function (config) {
    if (chatbotInstance) {
      chatbotInstance.destroy();
    }
    chatbotInstance = new ChatBotWidget(config);
    return chatbotInstance;
  };

  if (window.ChatBotConfig) {
    document.addEventListener('DOMContentLoaded', function() {
      window.initChatBot(window.ChatBotConfig);
    });
  }

  window.ChatBotWidget = ChatBotWidget;

})(window, document);