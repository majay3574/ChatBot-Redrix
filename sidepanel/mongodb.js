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
                this.apiKey = config.apiKey || null;
                this.appId = config.appId || null;
                this.baseUrl = config.baseUrl || null;

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
   - App ID
   - API Key
   - Data API URL

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
                <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">App ID:</label>
                <input id="mongoAppId" type="text" placeholder="your-app-id" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc; margin-bottom:1rem;">
                
                <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">API Key:</label>
                <input id="mongoApiKey" type="password" placeholder="your-api-key" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc; margin-bottom:1rem;">
                
                <label style="color: #e2e8f0; display: block; margin-bottom: 0.5rem;">Data API URL:</label>
                <input id="mongoUrl" type="text" placeholder="https://data.mongodb-api.com/app/your-app-id/endpoint/data/v1" style="width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: #f8fafc; margin-bottom:1rem;">
                
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
            if (this.isConnected) {
                console.log('MongoDB Atlas connected successfully');
            } else {
                this.useFallbackStorage();
            }
        } catch (error) {
            console.error('Error saving MongoDB config:', error);
            alert('Failed to connect to MongoDB Atlas. Please check your configuration.');
            this.useFallbackStorage();
        }
    }

    async authenticate() {
        if (!this.apiKey || !this.baseUrl) {
            this.isConnected = false;
            return;
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

                if (!response.ok) throw new Error(`MongoDB insert failed: ${response.status}`);
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

            if (chatHistory.length > 1000) chatHistory.splice(0, chatHistory.length - 1000);

            await chrome.storage.local.set({ chatHistory });
            console.log('Message saved to local storage');
            return message;
        } catch (error) {
            console.error('Error saving to local storage:', error);
            throw error;
        }
    }
}

// Export singleton instance
window.mongoClient = new MongoDBClient();
