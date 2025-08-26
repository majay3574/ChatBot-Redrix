class GroqAPI {
    constructor() {
        this.apiKey = null;
        this.baseURL = "https://api.groq.com/openai/v1/chat/completions";
        this.models = [
            { 
                name: "llama-3.3-70b-versatile", 
                displayName: "Llama versatile", 
                supportsImages: false 
            },
            { 
                name: "llama-3.3-70b-specdec", 
                displayName: "Llama 3.3 70B Speculative", 
                supportsImages: false 
            },
            { 
                name: "llama-3.1-8b-instant", 
                displayName: "Llama 3.1 8B (Fast)", 
                supportsImages: false 
            },
            { 
                name: "llama-3.2-1b-preview", 
                displayName: "Llama 3.2 1B", 
                supportsImages: false 
            },
            { 
                name: "llama-3.2-3b-preview", 
                displayName: "Llama 3.2 3B", 
                supportsImages: false 
            },
            { 
                name: "llama-3.2-11b-text-preview", 
                displayName: "Llama 3.2 11B Text", 
                supportsImages: false 
            },
            { 
                name: "meta-llama/llama-4-scout-17b-16e-instruct", 
                displayName: "Llama 4 Scout 17B 16E Instruct", 
                supportsImages: true 
            },
            { 
                name: "meta-llama/llama-4-maverick-17b-128e-instruct", 
                displayName: "Llama 4 Maverick 17B 128E Instruct", 
                supportsImages: true 
            },
            { 
                name: "llama-3.2-90b-text-preview", 
                displayName: "Llama 3.2 90B Text", 
                supportsImages: false 
            },
            { 
                name: "mixtral-8x7b-32768", 
                displayName: "Mixtral 8x7B", 
                supportsImages: false 
            },
            { 
                name: "gemma-7b-it", 
                displayName: "Gemma 7B", 
                supportsImages: false 
            },
            { 
                name: "gemma2-9b-it", 
                displayName: "Gemma 2 9B", 
                supportsImages: false 
            }
        ];
        this.currentModel = this.models[0].name;
        this.loadApiKey();
    }

    async loadApiKey() {
        try {
            const result = await chrome.storage.local.get(['groqApiKey']);
            if (result.groqApiKey) {
                this.apiKey = result.groqApiKey;
                console.log('Groq API key loaded successfully');
            } else {
                this.promptForApiKey();
            }
        } catch (error) {
            console.error('Error loading API key:', error);
            this.promptForApiKey();
        }
    }

    promptForApiKey() {
        const key = prompt(
            'Please enter your Groq API key:\n\n' +
            'You can get one for free at: https://console.groq.com/keys\n\n' +
            'This will be stored locally in your browser.'
        );
        
        if (key && key.trim()) {
            this.setApiKey(key.trim());
        } else {
            console.warn('No API key provided');
        }
    }

    async setApiKey(key) {
        this.apiKey = key;
        try {
            await chrome.storage.local.set({ groqApiKey: key });
            console.log('API key saved successfully');
        } catch (error) {
            console.error('Error saving API key:', error);
        }
    }

    getModels() {
        return this.models;
    }

    setCurrentModel(modelName) {
        const model = this.models.find(m => m.name === modelName);
        if (model) {
            this.currentModel = modelName;
            console.log('Model switched to:', model.displayName);
            return model;
        }
        console.error('Model not found:', modelName);
        return null;
    }

    getCurrentModel() {
        return this.models.find(m => m.name === this.currentModel);
    }

    async sendMessage(message, chatHistory = [], images = []) {
        if (!this.apiKey) {
            throw new Error('No API key configured. Please set your Groq API key.');
        }

        const currentModel = this.getCurrentModel();
        if (!currentModel) {
            throw new Error('No model selected');
        }
        
        try {
            const messages = [
                {
                    role: "system",
                    content: "You are a helpful AI assistant. Provide clear, accurate, and engaging responses."
                }
            ];

            // Add chat history (limit to last 10 messages to avoid token limits)
            const recentHistory = chatHistory.slice(-10);
            recentHistory.forEach(({ role, content }) => {
                messages.push({
                    role: role === "user" ? "user" : "assistant",
                    content
                });
            });

            // Add current message
            let userMessage = { role: "user", content: message };
            
            // Add images if supported and provided
            if (images.length > 0 && currentModel.supportsImages) {
                userMessage.content = [
                    { type: "text", text: message },
                    ...images.map(img => ({
                        type: "image_url",
                        image_url: { url: img }
                    }))
                ];
            } else if (images.length > 0 && !currentModel.supportsImages) {
                throw new Error(`Current model ${currentModel.displayName} does not support images. Please switch to a vision model.`);
            }
            
            messages.push(userMessage);

            console.log('Sending request to Groq API:', {
                model: this.currentModel,
                messageCount: messages.length,
                hasImages: images.length > 0
            });

            const response = await fetch(this.baseURL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    messages: messages,
                    temperature: 0.3,
                    max_tokens: 3000,
                    stream: false
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Error Response:', errorData);
                
                if (response.status === 401) {
                    this.promptForApiKey();
                    throw new Error('Invalid API key. Please check your Groq API key.');
                } else if (response.status === 400) {
                    throw new Error(`API Error: ${errorData.error?.message || 'Bad request'}`);
                } else {
                    throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
                }
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('Invalid API response:', data);
                throw new Error('Invalid response format from API');
            }

            console.log('Groq API response received successfully');

            return {
                content: data.choices[0].message.content,
                model: this.currentModel,
                usage: data.usage || null
            };

        } catch (error) {
            console.error('Groq API Error:', error);
            throw error;
        }
    }

    async testConnection() {
        try {
            const response = await this.sendMessage("Hello", []);
            return { success: true, response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
window.groqAPI = new GroqAPI();