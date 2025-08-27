class ChatbotApp {
  constructor() {
    this.chatHistory = [];
    this.currentModel = null;
    this.isProcessing = false;
    this.selectedImages = [];
    this.originalModel = null;

    this.initializeElements();
    this.bindEvents();
    this.loadModels();
    this.loadChatHistory();
    this.setupAutoResize();
  }

  initializeElements() {
    this.elements = {
      modelSelect: document.getElementById("modelSelect"),
      chatMessages: document.getElementById("chatMessages"),
      messageInput: document.getElementById("messageInput"),
      sendBtn: document.getElementById("sendBtn"),
      voiceBtn: document.getElementById("voiceBtn"),
      imageBtn: document.getElementById("imageBtn"),
      imageInput: document.getElementById("imageInput"),
      imagePreview: document.getElementById("imagePreview"),
      clearBtn: document.getElementById("clearBtn"),
      downloadBtn: document.getElementById("downloadBtn"),
      speakBtn: document.getElementById("speakBtn"),
      loadingOverlay: document.getElementById("loadingOverlay"),
    };

    // Verify all elements exist
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element) {
        console.error(`Element not found: ${key}`);
      }
    }
  }

  bindEvents() {
    this.elements.sendBtn.addEventListener("click", () => this.sendMessage());
    this.elements.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.elements.voiceBtn.addEventListener("click", () =>
      this.toggleVoiceInput()
    );
    this.elements.imageBtn.addEventListener("click", () =>
      this.elements.imageInput.click()
    );
    this.elements.imageInput.addEventListener("change", (e) =>
      this.handleImageSelection(e)
    );
    this.elements.clearBtn.addEventListener("click", () => this.clearChat());
    this.elements.downloadBtn.addEventListener("click", () =>
      this.downloadTranscript()
    );
    this.elements.speakBtn.addEventListener("click", () =>
      this.speakLastMessage()
    );

    this.elements.modelSelect.addEventListener("change", (e) => {
      this.setCurrentModel(e.target.value);
      this.originalModel = e.target.value; // Store user's manual selection
    });

    // Listen for speech events
    window.addEventListener("speechStart", () => {
      console.log("🎤 Speech started - updating UI");
      this.elements.voiceBtn.classList.add("recording");
      this.elements.voiceBtn.title = "Listening... Click to stop";
    });

    window.addEventListener("speechEnd", () => {
      console.log("🎤 Speech ended - updating UI");
      this.elements.voiceBtn.classList.remove("recording");
      this.elements.voiceBtn.title = "Voice Input";
    });

    window.addEventListener("speechError", (event) => {
      console.log("🎤 Speech error - updating UI");
      this.elements.voiceBtn.classList.remove("recording");
      this.elements.voiceBtn.title = "Voice Input";
      this.showError(`Voice input error: ${event.detail}`);
    });

    window.addEventListener("speechResult", (event) => {
      console.log("🎤 Speech result received:", event.detail);
      this.elements.messageInput.value = event.detail;
      this.elements.messageInput.focus();
      // Auto-resize the textarea
      this.elements.messageInput.style.height = "auto";
      this.elements.messageInput.style.height =
        Math.min(this.elements.messageInput.scrollHeight, 120) + "px";
    });
  }

  setupAutoResize() {
    this.elements.messageInput.addEventListener("input", () => {
      this.elements.messageInput.style.height = "auto";
      this.elements.messageInput.style.height =
        Math.min(this.elements.messageInput.scrollHeight, 120) + "px";
    });
  }

  async loadModels() {
    try {
      const models = window.groqAPI.getModels();
      this.elements.modelSelect.innerHTML = "";

      models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.name;
        option.textContent = `${model.displayName}${
          model.supportsImages ? " 🖼️" : ""
        }`;
        this.elements.modelSelect.appendChild(option);
      });

      if (models.length > 0) {
        this.elements.modelSelect.value = models[0].name;
        this.setCurrentModel(models[0].name);
      }
    } catch (error) {
      console.error("Error loading models:", error);
    }
  }

  setCurrentModel(modelName) {
    const model = window.groqAPI.setCurrentModel(modelName);
    if (model) {
      this.currentModel = model;
      this.elements.modelSelect.value = modelName;
      console.log("Model switched to:", model.displayName);
      this.updateModelIndicator();
    }
  }

  updateModelIndicator() {
    // Remove existing indicator
    const existingIndicator = document.querySelector(".auto-switch-indicator");
    if (existingIndicator) {
      existingIndicator.remove();
    }

    // Add indicator if auto-switched
    if (
      this.selectedImages.length > 0 &&
      this.originalModel &&
      this.currentModel.name !== this.originalModel
    ) {
      const indicator = document.createElement("span");
      indicator.className = "auto-switch-indicator";
      indicator.textContent = "Auto-switched for images";
      this.elements.modelSelect.parentNode.appendChild(indicator);
    }
  }

  autoSwitchModel() {
    if (this.selectedImages.length > 0) {
      // Need a vision model
      const visionModels = window.groqAPI
        .getModels()
        .filter((m) => m.supportsImages);
      if (visionModels.length > 0 && !this.currentModel.supportsImages) {
        // Store original model if not already stored
        if (!this.originalModel) {
          this.originalModel = this.currentModel.name;
        }
        this.setCurrentModel(visionModels[0].name);
      }
    } else {
      // No images, switch back to original model if we auto-switched
      if (this.originalModel && this.currentModel.name !== this.originalModel) {
        this.setCurrentModel(this.originalModel);
        this.originalModel = null;
      }
    }
  }

  async handleImageSelection(event) {
    const files = Array.from(event.target.files);

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        try {
          const base64 = await this.fileToBase64(file);
          this.selectedImages.push({
            file: file,
            base64: base64,
            name: file.name,
          });
        } catch (error) {
          console.error("Error processing image:", error);
          alert(`Error processing image ${file.name}: ${error.message}`);
        }
      }
    }

    this.updateImagePreview();
    this.autoSwitchModel();

    // Clear the input so the same file can be selected again
    event.target.value = "";
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  updateImagePreview() {
    if (this.selectedImages.length === 0) {
      this.elements.imagePreview.classList.add("hidden");
      return;
    }

    this.elements.imagePreview.classList.remove("hidden");
    this.elements.imagePreview.innerHTML = "";

    this.selectedImages.forEach((image, index) => {
      const previewItem = document.createElement("div");
      previewItem.className = "image-preview-item";

      const img = document.createElement("img");
      img.src = image.base64;
      img.alt = image.name;

      const removeBtn = document.createElement("button");
      removeBtn.className = "image-remove-btn";
      removeBtn.innerHTML = "×";
      removeBtn.onclick = () => this.removeImage(index);

      previewItem.appendChild(img);
      previewItem.appendChild(removeBtn);
      this.elements.imagePreview.appendChild(previewItem);
    });
  }

  removeImage(index) {
    this.selectedImages.splice(index, 1);
    this.updateImagePreview();
    this.autoSwitchModel();
  }

  async loadChatHistory() {
    try {
      // Show connection status
      if (window.mongoClient.isMongoConnected()) {
        console.log("Loading chat history from MongoDB Atlas...");
      } else {
        console.log("Loading chat history from local storage...");
      }

      const history = await window.mongoClient.getConversationHistory();
      this.chatHistory = history;
      this.renderChatHistory();
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  }

  renderChatHistory() {
    // Clear existing messages except welcome message
    const welcomeMessage =
      this.elements.chatMessages.querySelector(".welcome-message");
    this.elements.chatMessages.innerHTML = "";

    if (this.chatHistory.length === 0 && welcomeMessage) {
      this.elements.chatMessages.appendChild(welcomeMessage);
    }

    this.chatHistory.forEach((message) => {
      this.addMessageToUI(message.role, message.content, message.model);
    });

    this.scrollToBottom();
  }

  addMessageToUI(role, content, model = null, images = null) {
    // Remove welcome message when first real message appears
    const welcomeMessage =
      this.elements.chatMessages.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML =
      role === "user"
        ? '<img class="avatar" src="./ajay.jpg" alt="MJ" width="24" height="24">'
        : '<img class="avatar" src="./miwa.png" alt="MJ" width="24" height="24">';

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    // Add images if present
    if (images && images.length > 0) {
      const imagesContainer = document.createElement("div");
      imagesContainer.className = "message-images";
      images.forEach((image) => {
        const img = document.createElement("img");
        img.src = image.base64;
        img.alt = image.name;
        imagesContainer.appendChild(img);
      });
      messageContent.appendChild(imagesContainer);
    }

    // Add text content
    const textContent = document.createElement("div");
    textContent.innerHTML = this.formatMessage(content);
    messageContent.appendChild(textContent);

    if (role === "assistant" && model) {
      const modelInfo = window.groqAPI
        .getModels()
        .find((m) => m.name === model);
      if (modelInfo) {
        const modelIndicator = document.createElement("div");
        modelIndicator.className = "model-indicator";
        modelIndicator.innerHTML = `
                    <span>${modelInfo.displayName}</span>
                    ${
                      modelInfo.supportsImages
                        ? '<span class="image-support-badge">Vision</span>'
                        : ""
                    }
                `;
        messageContent.appendChild(modelIndicator);
      }
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);

    this.elements.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  formatMessage(content) {
    if (!content) return "";

    // Basic markdown-like formatting
    return content
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  }

  showTypingIndicator() {
    const typingDiv = document.createElement("div");
    typingDiv.className = "message assistant typing-indicator";
    typingDiv.innerHTML = `
            <div class="message-avatar">
                <img class="avatar" src="./miwa.png" alt="MJ" width="24" height="24">
            </div>
            <div class="message-content">
                <span>AI is thinking</span>
                <div class="typing-dots">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>
        `;

    this.elements.chatMessages.appendChild(typingDiv);
    this.scrollToBottom();
    return typingDiv;
  }

  removeTypingIndicator(indicator) {
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }

  async sendMessage() {
    const message = this.elements.messageInput.value.trim();
    if ((!message && this.selectedImages.length === 0) || this.isProcessing)
      return;

    this.isProcessing = true;
    this.elements.sendBtn.disabled = true;
    this.elements.messageInput.value = "";
    this.elements.messageInput.style.height = "auto";

    let typingIndicator = null;

    try {
      // Add user message to UI
      this.addMessageToUI(
        "user",
        message || "[Images uploaded]",
        null,
        this.selectedImages.length > 0 ? this.selectedImages : null
      );

      // Save user message
      await window.mongoClient.saveMessage(
        "user",
        message || "[Images uploaded]",
        this.currentModel?.name
      );

      // Show typing indicator
      typingIndicator = this.showTypingIndicator();

      // Prepare images for API
      const imageUrls = this.selectedImages.map((img) => img.base64);

      // Send to API
      const response = await window.groqAPI.sendMessage(
        message || "Please describe these images.",
        this.chatHistory,
        imageUrls
      );

      // Remove typing indicator
      this.removeTypingIndicator(typingIndicator);
      typingIndicator = null;

      // Add assistant response to UI
      this.addMessageToUI("assistant", response.content, response.model);

      // Save assistant response
      await window.mongoClient.saveMessage(
        "assistant",
        response.content,
        response.model
      );

      // Update local chat history
      this.chatHistory.push(
        {
          role: "user",
          content: message || "[Images uploaded]",
          model: this.currentModel?.name,
        },
        { role: "assistant", content: response.content, model: response.model }
      );

      // Clear images after sending
      this.selectedImages = [];
      this.updateImagePreview();
      this.autoSwitchModel();
    } catch (error) {
      console.error("Error sending message:", error);
      if (typingIndicator) {
        this.removeTypingIndicator(typingIndicator);
      }
      this.addMessageToUI("assistant", `Error: ${error.message}`, "system");
    } finally {
      this.isProcessing = false;
      this.elements.sendBtn.disabled = false;
      this.elements.messageInput.focus();
    }
  }

  async toggleVoiceInput() {
    console.log("🎤 Voice button clicked");

    if (!window.speechManager.isRecognitionSupported()) {
      this.showError(
        "Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari."
      );
      return;
    }

    if (window.speechManager.isListening) {
      console.log("🎤 Currently listening, stopping...");
      window.speechManager.stopListening();
      return;
    }

    console.log("🎤 Starting voice input...");

    try {
      // Show immediate feedback
      this.elements.voiceBtn.classList.add("recording");
      this.elements.voiceBtn.title = "Initializing...";

      const transcript = await window.speechManager.startListening();

      if (transcript && transcript.trim()) {
        console.log("🎤 Transcript received:", transcript);
        this.elements.messageInput.value = transcript.trim();
        this.elements.messageInput.focus();

        // Auto-resize the textarea
        this.elements.messageInput.style.height = "auto";
        this.elements.messageInput.style.height =
          Math.min(this.elements.messageInput.scrollHeight, 120) + "px";

        // Show success feedback
        this.showSuccess("Voice input captured successfully!");
      } else {
        this.showError("No speech detected. Please try again.");
      }
    } catch (error) {
      console.error("🎤 Voice input error:", error);
      this.showError(error.message);
    } finally {
      this.elements.voiceBtn.classList.remove("recording");
      this.elements.voiceBtn.title = "Voice Input";
    }
  }

  showError(message) {
    console.error("❌", message);

    // Create error notification
    const notification = document.createElement("div");
    notification.className = "notification error";
    notification.textContent = message;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, 5000);
  }

  showSuccess(message) {
    console.log("✅", message);

    // Create success notification
    const notification = document.createElement("div");
    notification.className = "notification success";
    notification.textContent = message;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            z-index: 10000;
            font-size: 14px;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
  }
  async speakLastMessage() {
    console.log("🔊 Speak Last button clicked");

    if (!window.speechManager.isSynthesisSupported()) {
      this.showError("Speech synthesis is not supported in your browser");
      return;
    }

    // Stop any current speech
    if (window.speechManager.isSpeaking()) {
      console.log("🔊 Stopping current speech");
      window.speechManager.stopSpeaking();
      this.elements.speakBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                Speak Last
            `;
      return;
    }

    const messages = this.elements.chatMessages.querySelectorAll(
      ".message.assistant .message-content"
    );
    console.log("🔊 Found assistant messages:", messages.length);

    if (messages.length === 0) {
      this.showError("No assistant messages to speak");
      return;
    }

    const lastMessage = messages[messages.length - 1];

    // Extract text content, excluding model indicator
    let text = "";
    const textNodes = lastMessage.childNodes;
    for (let node of textNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.tagName && !node.classList.contains("model-indicator")) {
        text += node.textContent;
      }
    }

    // Clean up the text
    text = text
      .trim()
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .replace(/\n+/g, " "); // Replace newlines with spaces

    console.log("🔊 Text to speak:", text.substring(0, 100) + "...");

    if (!text) {
      this.showError("No text content found to speak");
      return;
    }

    try {
      // Update button to show speaking state
      this.elements.speakBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
                Stop Speaking
            `;
      this.elements.speakBtn.style.background =
        "linear-gradient(135deg, #ef4444, #dc2626)";

      await window.speechManager.speak(text);

      // Reset button after speaking
      this.elements.speakBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                Speak Last
            `;
      this.elements.speakBtn.style.background = "";

      this.showSuccess("Message spoken successfully");
    } catch (error) {
      console.error("🔊 Speech synthesis error:", error);
      this.showError(`Speech error: ${error.message}`);

      // Reset button on error
      this.elements.speakBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                Speak Last
            `;
      this.elements.speakBtn.style.background = "";
    }
  }

  async clearChat() {
    if (
      !confirm(
        "Are you sure you want to clear all chat history? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      //not works fix it later
      // await window.mongoClient.clearHistory();
      this.chatHistory = [];
      this.elements.chatMessages.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">
                       <img class="homeImage" src="./miwa.png" alt="MJ">
                    </div>
                    <h3>Welcome to Redrix</h3>
                    <p>Start a conversation with Redrix. Your chat history is automatically saved.</p>
                </div>
            `;
      console.log("Chat history cleared");
    } catch (error) {
      console.error("Error clearing chat:", error);
      alert("Failed to clear chat history");
    }
  }

  async downloadTranscript() {
    try {
      const fullHistory = await window.mongoClient.getHistoryForDownload();

      if (fullHistory.length === 0) {
        alert("No chat history to download");
        return;
      }

      const transcript = this.generateTranscript(fullHistory);
      this.downloadFile(transcript, "chat-transcript.txt", "text/plain");
    } catch (error) {
      console.error("Error downloading transcript:", error);
      alert("Failed to download transcript");
    }
  }

  generateTranscript(history) {
    const header = `AI Assistant Chat Transcript
Generated: ${new Date().toLocaleString()}
Total Messages: ${history.length}

${"=".repeat(50)}

`;

    const messages = history
      .map((msg) => {
        const timestamp = msg.timestamp
          ? new Date(msg.timestamp).toLocaleString()
          : "Unknown";
        const model = msg.model ? ` (${msg.model})` : "";
        const role = msg.role === "user" ? "You" : `AI${model}`;

        return `[${timestamp}] ${role}:
${msg.content}

`;
      })
      .join("");

    return header + messages;
  }

  downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  scrollToBottom() {
    setTimeout(() => {
      this.elements.chatMessages.scrollTop =
        this.elements.chatMessages.scrollHeight;
    }, 100);
  }

  showLoading(show = true) {
    this.elements.loadingOverlay.classList.toggle("hidden", !show);
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("Initializing AI Chatbot Extension...");

  // Check if all required APIs are available
  if (!window.groqAPI) {
    console.error("Groq API not available");
    return;
  }

  if (!window.mongoClient) {
    console.error("MongoDB client not available");
    return;
  }

  if (!window.speechManager) {
    console.error("Speech manager not available");
    return;
  }

  // Initialize the main app
  window.chatbotApp = new ChatbotApp();
  console.log("AI Chatbot Extension initialized successfully");
});
