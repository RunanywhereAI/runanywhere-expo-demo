import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// =============================================================================
// RunAnywhere SDK Integration
// =============================================================================
//
// ARCHITECTURE:
//   The SDK uses a provider-based architecture for different AI backends:
//
//   1. LlamaCppProvider - For GGUF models (LLM text generation)
//      - Models from Hugging Face (SmolLM2, LFM2, Qwen, etc.)
//      - Uses llama.cpp for inference
//
//   2. ONNXProvider - For ONNX models (STT/TTS)
//      - STT: Whisper models from sherpa-onnx
//      - TTS: VITS/Piper models from sherpa-onnx
//      - Uses ONNX Runtime for inference
//
//   Providers are auto-registered during RunAnywhere.initialize():
//   - LlamaCppProvider.register() -> Handles .gguf models
//   - registerONNXProviders() -> Handles STT/TTS models
//
// DEVELOPMENT MODE (this demo):
//   - No API key required
//   - All inference runs 100% on-device
//   - No network calls, complete privacy
//   - Great for prototyping and "vibe coding"
//
// PRODUCTION MODE (coming soon):
//   - API key required: RunAnywhere.initialize({ apiKey: 'your-key' })
//   - Enables cloud observability & analytics dashboard
//   - Policy engine for cost/latency/privacy routing decisions
//   - Hybrid on-device + cloud inference with smart fallbacks
//   - Usage tracking, rate limiting, and billing
//
// MODEL SOURCES:
//   - LLM: https://huggingface.co/ (GGUF format)
//   - STT: https://github.com/k2-fsa/sherpa-onnx (Whisper ONNX)
//   - TTS: https://github.com/k2-fsa/sherpa-onnx (VITS/Piper ONNX)
//
// =============================================================================

// Import RunAnywhere SDK
// Note: This requires a development build (not Expo Go)
let RunAnywhere: any = null;
let ModelRegistry: any = null;
let LlamaCppProvider: any = null;
let sdkAvailable = false;

try {
  const sdk = require('runanywhere-react-native');
  RunAnywhere = sdk.RunAnywhere;
  ModelRegistry = sdk.ModelRegistry;
  LlamaCppProvider = sdk.LlamaCppProvider;
  sdkAvailable = true;
} catch (e) {
  console.log('RunAnywhere SDK not available (expected in Expo Go)');
}

type DemoMode = 'llm' | 'stt' | 'tts';

interface ModelInfo {
  id: string;
  name: string;
  category: string;
  isDownloaded?: boolean;
  localPath?: string;
  downloadSize?: number;
}

export default function HomeScreen() {
  const [mode, setMode] = useState<DemoMode>('llm');
  const [prompt, setPrompt] = useState('Hello! Tell me a fun fact about AI.');
  const [ttsText, setTtsText] = useState('Hello! I am RunAnywhere, your on-device AI assistant.');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Model states
  const [llmLoaded, setLlmLoaded] = useState(false);
  const [sttLoaded, setSttLoaded] = useState(false);
  const [ttsLoaded, setTtsLoaded] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [backendInfo, setBackendInfo] = useState<string>('');
  const [registeredProviders, setRegisteredProviders] = useState<string[]>([]);

  useEffect(() => {
    initializeSDK();
  }, []);

  const initializeSDK = async () => {
    if (!sdkAvailable) {
      setError('SDK not available. Please use a Development Build, not Expo Go.');
      return;
    }

    try {
      // =================================================================
      // DEVELOPMENT MODE - No API key, 100% on-device inference
      // =================================================================
      // For production, you would initialize with:
      //
      // await RunAnywhere.initialize({
      //   apiKey: process.env.EXPO_PUBLIC_RUNANYWHERE_API_KEY,
      //   environment: 'production',
      //   // Enables:
      //   // - Cloud observability & analytics dashboard
      //   // - Policy engine for routing decisions (cost/latency/privacy)
      //   // - Hybrid on-device + cloud inference
      //   // - Usage tracking and billing
      // });
      // =================================================================
      
      // Initialize SDK - this auto-registers providers:
      // 1. LlamaCppProvider.register() - for GGUF models
      // 2. registerONNXProviders() - for STT/TTS ONNX models
      await RunAnywhere.initialize({
        // Development mode - no API key needed
        // All inference runs locally on-device
      });
      setIsInitialized(true);
      setError(null);
      
      // Get backend info to show registered providers
      try {
        const info = await RunAnywhere.getBackendInfo();
        setBackendInfo(JSON.stringify(info, null, 2));
        
        // Determine which providers are registered based on available models
        const providers: string[] = [];
        const models = await RunAnywhere.getAvailableModels();
        
        const hasGGUF = models.some((m: ModelInfo) => m.category === 'language');
        const hasSTT = models.some((m: ModelInfo) => m.category === 'speech-recognition');
        const hasTTS = models.some((m: ModelInfo) => m.category === 'speech-synthesis');
        
        if (hasGGUF) providers.push('LlamaCpp (GGUF)');
        if (hasSTT || hasTTS) providers.push('ONNX Runtime (STT/TTS)');
        
        setRegisteredProviders(providers);
      } catch (e) {
        console.log('Could not get backend info:', e);
      }
      
      // Fetch available models
      await refreshModels();
    } catch (e: any) {
      setError(`Init failed: ${e.message}`);
    }
  };

  const refreshModels = async () => {
    try {
      const models = await RunAnywhere.getAvailableModels();
      setAvailableModels(models);
      console.log('Available models:', models.map((m: ModelInfo) => `${m.id} (downloaded: ${m.isDownloaded})`));
    } catch (e: any) {
      console.error('Failed to get models:', e);
    }
  };

  const getModelsForCategory = (category: string): ModelInfo[] => {
    return availableModels.filter(m => m.category === category);
  };

  // ==========================================================================
  // LLM Functions
  // ==========================================================================
  
  const loadLLMModel = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const llmModels = getModelsForCategory('language');
      console.log('LLM models:', llmModels);
      
      // Find a small downloaded model or download one
      let model = llmModels.find(m => m.isDownloaded);
      
      if (!model) {
        // Download the smallest model
        const smallestModel = llmModels.find(m => 
          m.id.includes('350m') || m.id.includes('small') || m.id.includes('tiny')
        ) || llmModels[0];
        
        if (!smallestModel) {
          setError('No LLM models available');
          return;
        }
        
        setResponse(`Downloading ${smallestModel.name}...`);
        setDownloadProgress(0);
        
        await RunAnywhere.downloadModel(smallestModel.id, (progress: number) => {
          setDownloadProgress(Math.round(progress * 100));
        });
        
        setDownloadProgress(null);
        await refreshModels();
        model = smallestModel;
      }
      
      // Load the model
      setResponse(`Loading ${model.name}...`);
      const modelPath = await RunAnywhere.getModelPath(model.id);
      
      if (modelPath) {
        await RunAnywhere.loadTextModel(modelPath);
        setLlmLoaded(true);
        setResponse(`✅ LLM loaded: ${model.name}`);
      } else {
        setError('Could not get model path');
      }
    } catch (e: any) {
      setError(`LLM load failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const generateText = async () => {
    if (!llmLoaded) {
      setError('Please load an LLM model first');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      const result = await RunAnywhere.generate(prompt, {
        maxTokens: 150,
        temperature: 0.7,
      });
      setResponse(result.text || JSON.stringify(result));
    } catch (e: any) {
      setError(`Generation failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // STT Functions
  // ==========================================================================
  
  const loadSTTModel = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const sttModels = getModelsForCategory('speech-recognition');
      console.log('STT models:', sttModels);
      
      let model = sttModels.find(m => m.isDownloaded);
      
      if (!model) {
        const smallestModel = sttModels[0];
        if (!smallestModel) {
          setError('No STT models available');
          return;
        }
        
        setResponse(`Downloading ${smallestModel.name}...`);
        setDownloadProgress(0);
        
        await RunAnywhere.downloadModel(smallestModel.id, (progress: number) => {
          setDownloadProgress(Math.round(progress * 100));
        });
        
        setDownloadProgress(null);
        await refreshModels();
        model = smallestModel;
      }
      
      setResponse(`Loading ${model.name}...`);
      const modelPath = await RunAnywhere.getModelPath(model.id);
      
      if (modelPath) {
        await RunAnywhere.loadSTTModel(modelPath);
        setSttLoaded(true);
        setResponse(`✅ STT loaded: ${model.name}\n\nReady for transcription!`);
      }
    } catch (e: any) {
      setError(`STT load failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const transcribeAudio = async () => {
    if (!sttLoaded) {
      setError('Please load an STT model first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In a real app, you'd record audio here
      // For demo, we'll show instructions
      setResponse(
        '🎤 STT Ready!\n\n' +
        'To transcribe audio:\n' +
        '1. Record audio using expo-av or react-native-audio\n' +
        '2. Convert to base64\n' +
        '3. Call: await RunAnywhere.transcribe(audioBase64)\n\n' +
        'Or transcribe a file:\n' +
        'await RunAnywhere.transcribeFile(filePath)'
      );
    } catch (e: any) {
      setError(`Transcription failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // TTS Functions
  // ==========================================================================
  
  const loadTTSModel = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const ttsModels = getModelsForCategory('speech-synthesis');
      console.log('TTS models:', ttsModels);
      
      let model = ttsModels.find(m => m.isDownloaded);
      
      if (!model) {
        const smallestModel = ttsModels[0];
        if (!smallestModel) {
          setError('No TTS models available');
          return;
        }
        
        setResponse(`Downloading ${smallestModel.name}...`);
        setDownloadProgress(0);
        
        await RunAnywhere.downloadModel(smallestModel.id, (progress: number) => {
          setDownloadProgress(Math.round(progress * 100));
        });
        
        setDownloadProgress(null);
        await refreshModels();
        model = smallestModel;
      }
      
      setResponse(`Loading ${model.name}...`);
      const modelPath = await RunAnywhere.getModelPath(model.id);
      
      if (modelPath) {
        await RunAnywhere.loadTTSModel(modelPath);
        setTtsLoaded(true);
        setResponse(`✅ TTS loaded: ${model.name}\n\nReady for speech synthesis!`);
      }
    } catch (e: any) {
      setError(`TTS load failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const synthesizeSpeech = async () => {
    if (!ttsLoaded) {
      setError('Please load a TTS model first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await RunAnywhere.synthesize(ttsText, {
        rate: 1.0,
        pitch: 1.0,
      });
      
      setResponse(
        `🔊 Speech synthesized!\n\n` +
        `Audio file: ${result.audioPath || result.filePath || 'Generated'}\n` +
        `Duration: ${result.duration ? result.duration.toFixed(2) + 's' : 'N/A'}\n\n` +
        `Text: "${ttsText}"`
      );
    } catch (e: any) {
      setError(`Synthesis failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  const renderModeButton = (m: DemoMode, label: string, emoji: string) => (
    <TouchableOpacity
      style={[styles.modeButton, mode === m && styles.modeButtonActive]}
      onPress={() => setMode(m)}
    >
      <Text style={[styles.modeButtonText, mode === m && styles.modeButtonTextActive]}>
        {emoji} {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🚀 RunAnywhere Demo</Text>
          <Text style={styles.subtitle}>On-Device AI with React Native</Text>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>🔧 DEVELOPMENT MODE</Text>
          </View>
          <Text style={styles.modeDescription}>
            100% on-device • No API key • Complete privacy
          </Text>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>SDK:</Text>
            <Text style={[styles.statusValue, { color: sdkAvailable ? '#4CAF50' : '#F44336' }]}>
              {sdkAvailable ? '✓ Available' : '✗ Not Available'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Initialized:</Text>
            <Text style={[styles.statusValue, { color: isInitialized ? '#4CAF50' : '#FF9800' }]}>
              {isInitialized ? '✓ Yes' : '○ No'}
            </Text>
          </View>
          
          {/* Registered Providers */}
          {registeredProviders.length > 0 && (
            <View style={styles.providersSection}>
              <Text style={styles.providersLabel}>Registered Providers:</Text>
              {registeredProviders.map((provider, idx) => (
                <Text key={idx} style={styles.providerItem}>• {provider}</Text>
              ))}
            </View>
          )}
          
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>LLM Model:</Text>
            <Text style={[styles.statusValue, { color: llmLoaded ? '#4CAF50' : '#888' }]}>
              {llmLoaded ? '✓ Loaded' : '○ Not Loaded'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>STT Model:</Text>
            <Text style={[styles.statusValue, { color: sttLoaded ? '#4CAF50' : '#888' }]}>
              {sttLoaded ? '✓ Loaded' : '○ Not Loaded'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>TTS Model:</Text>
            <Text style={[styles.statusValue, { color: ttsLoaded ? '#4CAF50' : '#888' }]}>
              {ttsLoaded ? '✓ Loaded' : '○ Not Loaded'}
            </Text>
          </View>
        </View>

        {/* Mode Selector */}
        {isInitialized && (
          <View style={styles.modeSelector}>
            {renderModeButton('llm', 'LLM', '💬')}
            {renderModeButton('stt', 'STT', '🎤')}
            {renderModeButton('tts', 'TTS', '🔊')}
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Download Progress */}
        {downloadProgress !== null && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>Downloading: {downloadProgress}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${downloadProgress}%` }]} />
            </View>
          </View>
        )}

        {/* LLM Mode */}
        {isInitialized && mode === 'llm' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💬 Text Generation (LLM)</Text>
            
            {!llmLoaded ? (
              <TouchableOpacity
                style={[styles.button, styles.loadButton]}
                onPress={loadLLMModel}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : 
                  <Text style={styles.buttonText}>📥 Load LLM Model</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.textInput}
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="Enter your prompt..."
                  placeholderTextColor="#666"
                  multiline
                />
                <TouchableOpacity
                  style={[styles.button, styles.runButton]}
                  onPress={generateText}
                  disabled={isLoading}
                >
                  {isLoading ? <ActivityIndicator color="#fff" /> : 
                    <Text style={styles.buttonText}>⚡ Generate</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* STT Mode */}
        {isInitialized && mode === 'stt' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎤 Speech-to-Text (STT)</Text>
            
            {!sttLoaded ? (
              <TouchableOpacity
                style={[styles.button, styles.loadButton]}
                onPress={loadSTTModel}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : 
                  <Text style={styles.buttonText}>📥 Load STT Model</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.runButton]}
                onPress={transcribeAudio}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : 
                  <Text style={styles.buttonText}>🎙️ Transcribe</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TTS Mode */}
        {isInitialized && mode === 'tts' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔊 Text-to-Speech (TTS)</Text>
            
            {!ttsLoaded ? (
              <TouchableOpacity
                style={[styles.button, styles.loadButton]}
                onPress={loadTTSModel}
                disabled={isLoading}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : 
                  <Text style={styles.buttonText}>📥 Load TTS Model</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.textInput}
                  value={ttsText}
                  onChangeText={setTtsText}
                  placeholder="Enter text to speak..."
                  placeholderTextColor="#666"
                  multiline
                />
                <TouchableOpacity
                  style={[styles.button, styles.runButton]}
                  onPress={synthesizeSpeech}
                  disabled={isLoading}
                >
                  {isLoading ? <ActivityIndicator color="#fff" /> : 
                    <Text style={styles.buttonText}>🔊 Synthesize Speech</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Response */}
        {response !== '' && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseLabel}>Response:</Text>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}

        {/* Info for Expo Go users */}
        {!sdkAvailable && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>📱 How to Run</Text>
            <Text style={styles.infoText}>
              This demo requires native modules.{'\n\n'}
              1. Install the dev client APK{'\n'}
              2. Scan the QR code from Expo CLI{'\n'}
              3. The app will run with full SDK access
            </Text>
          </View>
        )}

        {/* Production Mode Info */}
        <View style={styles.productionInfo}>
          <Text style={styles.productionTitle}>🏢 Production Mode (Coming Soon)</Text>
          <Text style={styles.productionText}>
            Add an API key to unlock:{'\n'}
            • ☁️ Cloud observability dashboard{'\n'}
            • 📊 Usage analytics & insights{'\n'}
            • ⚖️ Policy engine (cost/latency/privacy){'\n'}
            • 🔄 Hybrid on-device + cloud routing{'\n'}
            • 💳 Usage tracking & billing
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  modeBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 12,
  },
  modeBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  modeDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statusLabel: {
    color: '#888',
    fontSize: 14,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  providersSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  providersLabel: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  providerItem: {
    color: '#4CAF50',
    fontSize: 12,
    marginLeft: 8,
    marginTop: 2,
  },
  modeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2196F3',
  },
  modeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  errorContainer: {
    backgroundColor: '#2d1b1b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  loadButton: {
    backgroundColor: '#2196F3',
  },
  runButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  responseContainer: {
    backgroundColor: '#1a2a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  responseLabel: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  responseText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  infoContainer: {
    backgroundColor: '#1a1a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoTitle: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 22,
  },
  productionInfo: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  productionTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  productionText: {
    color: '#666',
    fontSize: 13,
    lineHeight: 22,
  },
});
