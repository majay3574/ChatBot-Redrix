class MongoDBClient {
    constructor() {
        this.isConnected = false;
        this.apiKey = null;
        this.appId = null;
        this.baseUrl = null;
        this.dbName = "chatMemory";
        this.collectionName = "conversations";
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const result = await chrome.storage.local.get(['mongoConfig']);
            if (result.mongoConfig) {
                const config = result.mongoConfig;
                this.apiKey = config.apiKey;
                this.appId = config.appId;
                this.baseUrl = config.baseUrl;
                
                if (this.apiKey && this.appId && this.baseUrl) {
                    await this.authenticate();
                } else {
                    console.log('MongoDB config incomplete, using local storage');
                    this.useFallbackStorage();
                }
            } else {
                console.log('No MongoDB config found, using local storage');
                this.useFallbackStorage();
            }
        } catch (error) {
            console.error('Error loading MongoDB config:', error);
            this.useFallbackStorage();
        }
    }

    promptForConfig() {
        const setupInstructions = `
MongoDB Atlas Setup Required:

1. Go to https://cloud.mongodb.com/
2. Create a free account and cluster
3. Go to App Services → Create App
4. Enable Data API in your app
5. Get your:
   - App ID (from App Settings)
   - API Key (from Authentication → API Keys)
   - Data API URL (from Data API settings)

Would you like to set up MongoDB Atlas connection now?
        `;

        if (confirm(setupInstructions)) {
            this.showConfigDialog();
        } else {
            console.log('MongoDB setup skipped - using local storage');
            this.useFallbackStorage();
        }
    }

    showConfigDialog() {
        // Create a simple config dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        dialog.innerHTML = `
            <div style="background: #1e293b; padding: 2rem; border-radius: 12px; max-width: 500px; width: 90%;">
                <h3 style="color: #f8fafc; margin-bottom: 1rem;">MongoDB Atlas Configuration</h3>
                <div style="margin-bottom: 1rem;">
                    <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">App ID:</label>
                    <input id="mongoAppId" type="text" placeholder="your-app-id" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">API Key:</label>
                    <input id="mongoApiKey" type="password" placeholder="your-api-key" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">Data API URL:</label>
                    <input id="mongoUrl" type="text" placeholder="https://data.mongodb-api.com/app/your-app-id/endpoint/data/v1" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc;">
                </div>
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button id="cancelMongo" style="padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid #374151; background: transparent; color: #e2e8f0; cursor: pointer;">Cancel</button>
                    <button id="saveMongo" style="padding: 0.5rem 1rem; border-radius: 6px; border: none; background: #3b82f6; color: white; cursor: pointer;">Save & Connect</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('cancelMongo').onclick = () => {
            document.body.removeChild(dialog);
            this.useFallbackStorage();
        };

        document.getElementById('saveMongo').onclick = async () => {
            const appId = document.getElementById('mongoAppId').value.trim();
            const apiKey = document.getElementById('mongoApiKey').value.trim();
            const baseUrl = document.getElementById('mongoUrl').value.trim();

            if (!appId || !apiKey || !baseUrl) {
                alert('Please fill in all fields');
                return;
            }

            await this.saveConfig(appId, apiKey, baseUrl);
            document.body.removeChild(dialog);
        };
    }

    async saveConfig(appId, apiKey, baseUrl) {
        this.appId = appId;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;

        try {
            await chrome.storage.local.set({
                mongoConfig: { appId, apiKey, baseUrl }
            });

            await this.authenticate();
            console.log('MongoDB Atlas connected successfully');
        } catch (error) {
            console.error('Error saving MongoDB config:', error);
            alert('Failed to connect to MongoDB Atlas. Please check your configuration.');
            this.useFallbackStorage();
        }
    }

    async authenticate() {
        try {
            const response = await fetch(`${this.baseUrl}/action/findOne`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify({
                    dataSource: 'Cluster0',
                    database: this.dbName,
                    collection: this.collectionName,
                    filter: { _id: 'test' }
                })
            });

            if (response.ok) {
                this.isConnected = true;
                console.log('MongoDB Atlas authentication successful');
            } else {
                throw new Error(`Authentication failed: ${response.status}`);
            }
        } catch (error) {
            console.error('MongoDB authentication error:', error);
            this.isConnected = false;
            this.useFallbackStorage();
        }
    }

    useFallbackStorage() {
        console.log('Using Chrome storage as fallback for MongoDB');
        this.isConnected = false;
    }

    async saveMessage(role, content, model = null) {
        const message = {
            role,
            content,
            model,
            timestamp: new Date().toISOString(),
            id: Date.now().toString()
        };

        if (this.isConnected) {
            try {
                const response = await fetch(`${this.baseUrl}/action/insertOne`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        dataSource: 'Cluster0',
                        database: this.dbName,
                        collection: this.collectionName,
                        document: message
                    })
                });

                if (!response.ok) {
                    throw new Error(`MongoDB insert failed: ${response.status}`);
                }

                console.log('Message saved to MongoDB Atlas');
                return message;
            } catch (error) {
                console.error('Error saving to MongoDB, falling back to local storage:', error);
                return this.saveToLocalStorage(message);
            }
        } else {
            return this.saveToLocalStorage(message);
        }
    }

    async saveToLocalStorage(message) {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            const chatHistory = result.chatHistory || [];
            chatHistory.push(message);
            
            // Keep only last 1000 messages to prevent storage overflow
            if (chatHistory.length > 1000) {
                chatHistory.splice(0, chatHistory.length - 1000);
            }
            
            await chrome.storage.local.set({ chatHistory });
            console.log('Message saved to local storage');
            return message;
        } catch (error) {
            console.error('Error saving to local storage:', error);
            throw error;
        }
    }

    async getConversationHistory(limit = 100) {
        if (this.isConnected) {
            try {
                const response = await fetch(`${this.baseUrl}/action/find`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        dataSource: 'Cluster0',
                        database: this.dbName,
                        collection: this.collectionName,
                        sort: { timestamp: 1 },
                        limit: limit
                    })
                });

                if (!response.ok) {
                    throw new Error(`MongoDB find failed: ${response.status}`);
                }

                const data = await response.json();
                return data.documents.map(doc => ({
                    role: doc.role,
                    content: doc.content,
                    model: doc.model,
                    timestamp: doc.timestamp
                }));
            } catch (error) {
                console.error('Error getting history from MongoDB, falling back to local storage:', error);
                return this.getFromLocalStorage(limit);
            }
        } else {
            return this.getFromLocalStorage(limit);
        }
    }

    async getFromLocalStorage(limit = 100) {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            const chatHistory = result.chatHistory || [];
            return chatHistory
                .slice(-limit)
                .map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    model: msg.model,
                    timestamp: msg.timestamp
                }));
        } catch (error) {
            console.error('Error getting history from local storage:', error);
            return [];
        }
    }

    async clearHistory() {
        if (this.isConnected) {
            try {
                const response = await fetch(`${this.baseUrl}/action/deleteMany`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        dataSource: 'Cluster0',
                        database: this.dbName,
                        collection: this.collectionName,
                        filter: {}
                    })
                });

                if (!response.ok) {
                    throw new Error(`MongoDB delete failed: ${response.status}`);
                }

                console.log('Chat history cleared from MongoDB Atlas');
            } catch (error) {
                console.error('Error clearing MongoDB history, clearing local storage:', error);
                await this.clearLocalStorage();
            }
        } else {
            await this.clearLocalStorage();
        }
    }

    async clearLocalStorage() {
        try {
            await chrome.storage.local.remove(['chatHistory']);
            console.log('Chat history cleared from local storage');
        } catch (error) {
            console.error('Error clearing local storage:', error);
            throw error;
        }
    }

    async getHistoryForDownload() {
        if (this.isConnected) {
            try {
                const response = await fetch(`${this.baseUrl}/action/find`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        dataSource: 'Cluster0',
                        database: this.dbName,
                        collection: this.collectionName,
                        sort: { timestamp: 1 }
                    })
                });

                if (!response.ok) {
                    throw new Error(`MongoDB find failed: ${response.status}`);
                }

                const data = await response.json();
                return data.documents;
            } catch (error) {
                console.error('Error getting download history from MongoDB:', error);
                return this.getLocalStorageForDownload();
            }
        } else {
            return this.getLocalStorageForDownload();
        }
    }

    async getLocalStorageForDownload() {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            return result.chatHistory || [];
        } catch (error) {
            console.error('Error getting download history from local storage:', error);
            return [];
        }
    }

    isMongoConnected() {
        return this.isConnected;
    }

    async testConnection() {
        if (!this.isConnected) {
            return { success: false, error: 'Not connected to MongoDB Atlas' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/action/findOne`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': this.apiKey
                },
                body: JSON.stringify({
                    dataSource: 'Cluster0',
                    database: this.dbName,
                    collection: this.collectionName,
                    filter: { _id: 'connection-test' }
                })
            });

            if (response.ok) {
                return { success: true, message: 'MongoDB Atlas connection successful' };
            } else {
                throw new Error(`Connection test failed: ${response.status}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
window.mongoClient = new MongoDBClient();