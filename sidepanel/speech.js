class SpeechManager {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.recognition = null;
        this.isListening = false;
        this.voices = [];
        this.selectedVoice = null;
        
        this.initializeSpeechRecognition();
        this.loadVoices();
        
        // Load voices when they become available
        if (this.synthesis) {
            this.synthesis.addEventListener('voiceschanged', () => {
                this.loadVoices();
            });
        }
    }

    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            this.recognition.maxAlternatives = 1;
            
            this.recognition.addEventListener('start', () => {
                this.isListening = true;
                console.log('🎤 Speech recognition started');
                // Dispatch custom event for UI updates
                window.dispatchEvent(new CustomEvent('speechStart'));
            });
            
            this.recognition.addEventListener('end', () => {
                this.isListening = false;
                console.log('🎤 Speech recognition ended');
                // Dispatch custom event for UI updates
                window.dispatchEvent(new CustomEvent('speechEnd'));
            });
            
            this.recognition.addEventListener('error', (event) => {
                this.isListening = false;
                console.error('🎤 Speech recognition error:', event.error);
                // Dispatch custom event for UI updates
                window.dispatchEvent(new CustomEvent('speechError', { detail: event.error }));
            });
            
            this.recognition.addEventListener('result', (event) => {
                console.log('🎤 Speech recognition result received');
                const transcript = event.results[0][0].transcript;
                console.log('🎤 Transcript:', transcript);
                // Dispatch custom event with transcript
                window.dispatchEvent(new CustomEvent('speechResult', { detail: transcript }));
            });
            
            console.log('🎤 Speech recognition initialized successfully');
        } else {
            console.warn('🎤 Speech recognition not supported in this browser');
        }
    }

    loadVoices() {
        if (!this.synthesis) {
            console.warn('Speech synthesis not supported');
            return;
        }

        this.voices = this.synthesis.getVoices();
        
        // Try to find a high-quality English voice
        this.selectedVoice = this.voices.find(voice => 
            voice.lang.startsWith('en') && 
            (voice.name.includes('Enhanced') || 
             voice.name.includes('Premium') ||
             voice.name.includes('Neural') ||
             voice.localService === false)
        ) || this.voices.find(voice => voice.lang.startsWith('en')) || this.voices[0];
        
        console.log('Available voices:', this.voices.length);
        if (this.selectedVoice) {
            console.log('Selected voice:', this.selectedVoice.name);
        }
    }

    async startListening() {
        return new Promise((resolve, reject) => {
            if (!this.recognition) {
                const error = 'Speech recognition not supported in this browser';
                console.error('🎤', error);
                reject(new Error(error));
                return;
            }

            if (this.isListening) {
                console.log('🎤 Already listening, stopping current session');
                this.stopListening();
                // Wait a bit before starting new session
                setTimeout(() => {
                    this.startListening().then(resolve).catch(reject);
                }, 500);
                return;
            }

            console.log('🎤 Starting speech recognition...');
            
            // Set up one-time event listeners for this session
            this.recognition.onresult = (event) => {
                if (event.results && event.results[0] && event.results[0][0]) {
                    const transcript = event.results[0][0].transcript.trim();
                    console.log('🎤 Final transcript:', transcript);
                    this.cleanup();
                    resolve(transcript);
                } else {
                    console.error('🎤 No valid results in speech recognition event');
                    this.cleanup();
                    reject(new Error('No speech detected'));
                }
            };

            this.recognition.onend = () => {
                console.log('🎤 Recognition session ended');
                if (this.isListening) {
                    // If we're still supposed to be listening, something went wrong
                    this.cleanup();
                    reject(new Error('Speech recognition ended unexpectedly'));
                }
            };

            this.recognition.onerror = (event) => {
                console.error('🎤 Recognition error:', event.error);
                this.cleanup();
                let errorMessage = 'Speech recognition error';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected. Please try again.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'Microphone not accessible. Please check permissions.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Microphone permission denied. Please allow microphone access.';
                        break;
                    case 'network':
                        errorMessage = 'Network error during speech recognition.';
                        break;
                    default:
                        errorMessage = `Speech recognition error: ${event.error}`;
                }
                
                resolve(transcript);
            };


            try {
                // Request microphone permission first
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    navigator.mediaDevices.getUserMedia({ audio: true })
                        .then(() => {
                            console.log('🎤 Microphone permission granted');
                            this.recognition.start();
                        })
                        .catch((error) => {
                            console.error('🎤 Microphone permission denied:', error);
                            reject(new Error('Microphone permission denied. Please allow microphone access and try again.'));
                        });
                } else {
                    // Fallback for older browsers
                    console.log('🎤 Starting recognition without explicit permission check');
                this.recognition.start();
                }
            } catch (error) {
                console.error('🎤 Error starting speech recognition:', error);
                this.cleanup();
                reject(error);
            }
        });
    }

    cleanup() {
        if (this.recognition) {
            this.recognition.onresult = null;
            this.recognition.onerror = null;
            this.recognition.onend = null;
        }
        this.isListening = false;
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            console.log('🎤 Stopping speech recognition');
            this.cleanup();
            this.recognition.stop();
        }
    }

    speak(text, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.synthesis) {
                reject(new Error('Speech synthesis not supported in this browser'));
                return;
            }

            if (!text || text.trim() === '') {
                reject(new Error('No text to speak'));
                return;
            }

            // Cancel any ongoing speech
            this.synthesis.cancel();

            // Wait a bit for cancel to take effect
            setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configure voice
            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }
            
            // Configure speech parameters
            utterance.rate = options.rate || 0.9;
            utterance.pitch = options.pitch || 1.0;
            utterance.volume = options.volume || 0.8;
            
            utterance.onend = () => {
                console.log('Speech synthesis completed');
                resolve();
            };
            
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
                reject(new Error(`Speech synthesis error: ${event.error}`));
            };
                utterance.onstart = () => {
                    console.log('🔊 Speech synthesis started');
                };

            try {
                this.synthesis.speak(utterance);
                    console.log('🔊 Speech synthesis queued');
            } catch (error) {
                console.error('Error starting speech synthesis:', error);
                reject(error);
            }
            }, 100);
        });
    }

    stopSpeaking() {
        if (this.synthesis) {
            this.synthesis.cancel();
        }
    }

    isSpeaking() {
        return this.synthesis && this.synthesis.speaking;
    }

    isRecognitionSupported() {
        return !!this.recognition;
    }

    isSynthesisSupported() {
        return !!this.synthesis;
    }

    getAvailableVoices() {
        return this.voices;
    }

    setVoice(voiceName) {
        const voice = this.voices.find(v => v.name === voiceName);
        if (voice) {
            this.selectedVoice = voice;
            console.log('Voice changed to:', voice.name);
            return true;
        }
        console.warn('Voice not found:', voiceName);
        return false;
    }
}

// Export singleton instance
window.speechManager = new SpeechManager();