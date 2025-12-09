import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// =============================================================================
// RunAnywhere - On-Device AI for React Native
// =============================================================================
//
// RunAnywhere enables powerful AI capabilities that run 100% on-device:
// - LLM (Text Generation) via LlamaCpp - GGUF models from Hugging Face
// - STT (Speech Recognition) via ONNX Runtime - Whisper models
// - TTS (Speech Synthesis) via ONNX Runtime - VITS/Piper models
//
// MODES:
//   Development Mode: Full on-device inference, perfect for prototyping
//   Production Mode: Adds observability, policy engine, and hybrid routing
//
// Learn more: https://runanywhere.ai
// npm: https://www.npmjs.com/package/runanywhere-react-native
// =============================================================================

// Lazy load audio modules (requires rebuild with expo-speech/expo-av)
let Speech: any = null;
let Audio: any = null;
let audioModulesAvailable = false;
try {
  Speech = require('expo-speech');
  Audio = require('expo-av').Audio;
  audioModulesAvailable = true;
} catch (e) {
  console.log('[RunAnywhere Demo] Audio modules not available');
}

// Import RunAnywhere SDK
let RunAnywhere: any = null;
let sdkAvailable = false;
try {
  const sdk = require('runanywhere-react-native');
  RunAnywhere = sdk.RunAnywhere;
  sdkAvailable = true;
} catch (e) {
  console.log('[RunAnywhere Demo] SDK not available (expected in Expo Go)');
}

// Types
type TabType = 'llm' | 'stt' | 'tts';
type FrameworkType = 'LlamaCpp' | 'ONNX' | 'SystemTTS';

interface ModelInfo {
  id: string;
  name: string;
  category: string;
  framework: FrameworkType;
  isDownloaded?: boolean;
  localPath?: string;
  downloadSize?: number;
  downloadURL?: string;
}

// Framework colors
const FrameworkColors: Record<FrameworkType, string> = {
  LlamaCpp: '#FF6B35',
  ONNX: '#1E88E5',
  SystemTTS: '#8E8E93',
};

// =============================================================================
// Main Component
// =============================================================================

export default function RunAnywhereDemo() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('llm');
  
  // SDK state
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Models state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // LLM state
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // TTS state
  const [ttsText, setTtsText] = useState('Hello! I am RunAnywhere, your on-device AI assistant.');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingAnim = useRef(new Animated.Value(1)).current;
  
  // STT state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recordingAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<any>(null);
  
  // Custom model URL
  const [showAddModel, setShowAddModel] = useState(false);
  const [customModelURL, setCustomModelURL] = useState('');
  const [customModelName, setCustomModelName] = useState('');

  // ==========================================================================
  // Animations
  // ==========================================================================
  
  useEffect(() => {
    if (isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(speakingAnim, { toValue: 1.2, duration: 300, useNativeDriver: true }),
          Animated.timing(speakingAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    } else {
      speakingAnim.setValue(1);
    }
  }, [isSpeaking]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      recordingAnim.setValue(1);
    }
  }, [isRecording]);

  // ==========================================================================
  // Initialization
  // ==========================================================================

  useEffect(() => {
    initializeSDK();
  }, []);

  // Keep selectedModel in sync with models list (for localPath updates)
  useEffect(() => {
    if (selectedModel && models.length > 0) {
      const updatedModel = models.find(m => m.id === selectedModel.id);
      if (updatedModel && updatedModel.localPath !== selectedModel.localPath) {
        setSelectedModel(updatedModel);
      }
    }
  }, [models]);

  const initializeSDK = async () => {
    if (!sdkAvailable) {
      setError('Development build required. Install the APK from EAS Build.');
      return;
    }

    try {
      await RunAnywhere.initialize({});
      setIsInitialized(true);
      await loadModels();
    } catch (e: any) {
      setError(`Initialization failed: ${e.message}`);
    }
  };

  const loadModels = async () => {
    try {
      const allModels = await RunAnywhere.getAvailableModels();
      const formattedModels: ModelInfo[] = allModels.map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        framework: getFramework(m),
        isDownloaded: m.isDownloaded,
        localPath: m.localPath,
        downloadSize: m.downloadSize,
        downloadURL: m.downloadURL,
      }));
      setModels(formattedModels);
    } catch (e: any) {
      console.log('Failed to load models:', e);
    }
  };

  const getFramework = (model: any): FrameworkType => {
    if (model.id === 'system-tts') return 'SystemTTS';
    if (model.category === 'language') return 'LlamaCpp';
    return 'ONNX';
  };

  const getModelsForTab = (): ModelInfo[] => {
    switch (activeTab) {
      case 'llm':
        return models.filter(m => m.category === 'language');
      case 'stt':
        return models.filter(m => m.category === 'speech-recognition');
      case 'tts':
        return models.filter(m => m.category === 'speech-synthesis');
      default:
        return [];
    }
  };

  // ==========================================================================
  // Model Management
  // ==========================================================================

  const handleSelectModel = (model: ModelInfo) => {
    // Find the full model info from the loaded models (includes localPath)
    const fullModel = models.find(m => m.id === model.id) || model;
    setSelectedModel(fullModel);
    setIsModelLoaded(false);
    setResponse('');
  };

  const handleDownloadModel = async () => {
    if (!selectedModel) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // downloadModel returns the local path
      const downloadedPath = await RunAnywhere.downloadModel(selectedModel.id, (progress: number) => {
        setDownloadProgress(Math.round(progress * 100));
      });
      
      await loadModels();
      // Update selectedModel with the downloaded path
      setSelectedModel(prev => prev ? { 
        ...prev, 
        isDownloaded: true, 
        localPath: downloadedPath 
      } : null);
    } catch (e: any) {
      setError(`Download failed: ${e.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleLoadModel = async () => {
    if (!selectedModel) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const modelPath = selectedModel.localPath || await RunAnywhere.getModelPath(selectedModel.id);
      
      if (!modelPath) {
        setError('Model path not found. Please re-download.');
        return;
      }

      switch (activeTab) {
        case 'llm':
          await RunAnywhere.loadTextModel(modelPath);
          break;
        case 'stt':
          await RunAnywhere.loadSTTModel(modelPath);
          break;
        case 'tts':
          if (selectedModel.id !== 'system-tts') {
            await RunAnywhere.loadTTSModel(modelPath);
          }
          break;
      }
      
      setIsModelLoaded(true);
      setResponse(`✅ ${selectedModel.name} loaded successfully!`);
    } catch (e: any) {
      setError(`Load failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // LLM Actions
  // ==========================================================================

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setResponse('');

    try {
      const result = await RunAnywhere.generate(prompt, {
        maxTokens: 256,
        temperature: 0.7,
      });
      setResponse(result.text || JSON.stringify(result));
    } catch (e: any) {
      setError(`Generation failed: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ==========================================================================
  // STT Actions
  // ==========================================================================

  const handleStartRecording = async () => {
    if (!audioModulesAvailable) {
      Alert.alert('Rebuild Required', 'Audio recording requires expo-av. Rebuild with:\n\neas build --platform android --profile development');
      return;
    }

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setTranscript('');
    } catch (e: any) {
      setError(`Recording failed: ${e.message}`);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingRef.current) return;

    setIsLoading(true);
    setIsRecording(false);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setError('No audio recorded');
        return;
      }

      const result = await RunAnywhere.transcribeFile(uri);
      setTranscript(result.text || result);
    } catch (e: any) {
      setError(`Transcription failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // TTS Actions
  // ==========================================================================

  const handleSpeak = async () => {
    if (!ttsText.trim()) {
      setError('Please enter text to speak');
      return;
    }

    if (selectedModel?.id === 'system-tts') {
      // Use System TTS
      if (!audioModulesAvailable) {
        Alert.alert('Rebuild Required', 'System TTS requires expo-speech. Rebuild with:\n\neas build --platform android --profile development');
        return;
      }
      
      if (isSpeaking) {
        Speech.stop();
        setIsSpeaking(false);
        return;
      }

      setIsSpeaking(true);
      Speech.speak(ttsText, {
        rate: 1.0,
        pitch: 1.0,
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } else {
      // Use Neural TTS - check if model is actually loaded
      if (!isModelLoaded) {
        setError('Please load a TTS model first');
        return;
      }
      
      setIsLoading(true);
      setError(null);
      setIsSpeaking(true);
      
      try {
        const result = await RunAnywhere.synthesize(ttsText, { rate: 1.0, pitch: 1.0 });
        const audioPath = result?.audioPath || result?.filePath || result;
        setResponse(`🔊 Audio generated!\n\nFile: ${audioPath}\n\n💡 To play audio, rebuild with expo-av`);
      } catch (e: any) {
        setError(`Synthesis failed: ${e.message}`);
      } finally {
        setIsLoading(false);
        setIsSpeaking(false);
      }
    }
  };

  // ==========================================================================
  // Custom Model
  // ==========================================================================

  const handleAddCustomModel = () => {
    if (!customModelURL.trim()) {
      Alert.alert('Error', 'Please enter a Hugging Face model URL');
      return;
    }

    Alert.alert(
      'Coming Soon',
      'Custom model import will be available in the next release.\n\nFor now, you can request models at:\nhttps://github.com/RunanywhereAI/sdks/issues',
      [{ text: 'OK' }]
    );
    setShowAddModel(false);
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  const renderTab = (tab: TabType, label: string, icon: string) => (
    <TouchableOpacity
      style={[styles.tab, activeTab === tab && styles.tabActive]}
      onPress={() => {
        setActiveTab(tab);
        setSelectedModel(null);
        setIsModelLoaded(false);
        setResponse('');
        setError(null);
      }}
    >
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderModelCard = (model: ModelInfo) => (
    <TouchableOpacity
      key={model.id}
      style={[
        styles.modelCard,
        selectedModel?.id === model.id && styles.modelCardSelected,
      ]}
      onPress={() => handleSelectModel(model)}
    >
      <View style={styles.modelCardHeader}>
        <Text style={styles.modelName} numberOfLines={1}>{model.name}</Text>
        <View style={[styles.frameworkBadge, { backgroundColor: FrameworkColors[model.framework] }]}>
          <Text style={styles.frameworkText}>{model.framework}</Text>
        </View>
      </View>
      <View style={styles.modelCardFooter}>
        {model.isDownloaded ? (
          <Text style={styles.downloadedBadge}>✓ Downloaded</Text>
        ) : (
          <Text style={styles.sizeText}>
            {model.downloadSize ? `${(model.downloadSize / 1_000_000).toFixed(0)} MB` : 'Remote'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderLLMContent = () => (
    <View style={styles.contentSection}>
      {isModelLoaded && (
        <>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Ask me anything..."
            placeholderTextColor="#666"
            multiline
          />
          <TouchableOpacity
            style={[styles.actionButton, isGenerating && styles.actionButtonDisabled]}
            onPress={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>⚡ Generate</Text>
            )}
          </TouchableOpacity>
        </>
      )}
      
      {response !== '' && (
        <View style={styles.responseBox}>
          <Text style={styles.responseText}>{response}</Text>
        </View>
      )}
    </View>
  );

  const renderSTTContent = () => (
    <View style={styles.contentSection}>
      {isModelLoaded && !audioModulesAvailable && (
        <View style={styles.rebuildRequired}>
          <Text style={styles.rebuildIcon}>🔧</Text>
          <Text style={styles.rebuildTitle}>Rebuild Required for Recording</Text>
          <Text style={styles.rebuildText}>
            Audio recording requires expo-av.{'\n'}
            Run: eas build --platform android --profile development
          </Text>
        </View>
      )}
      
      {isModelLoaded && audioModulesAvailable && (
        <View style={styles.recordingSection}>
          <Animated.View style={[styles.micContainer, { transform: [{ scale: recordingAnim }] }]}>
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonRecording]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isLoading}
            >
              <Text style={styles.micIcon}>{isRecording ? '⏹️' : '🎙️'}</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.recordingHint}>
            {isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
          </Text>
        </View>
      )}
      
      {transcript !== '' && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>📝 Transcript</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}
    </View>
  );

  const renderTTSContent = () => {
    const isSystemTTS = selectedModel?.id === 'system-tts';
    const canUseSystemTTS = isSystemTTS && audioModulesAvailable;
    const canUseNeuralTTS = isModelLoaded && !isSystemTTS;
    
    return (
      <View style={styles.contentSection}>
        {/* System TTS selected but expo-speech not available */}
        {isSystemTTS && !audioModulesAvailable && (
          <View style={styles.rebuildRequired}>
            <Text style={styles.rebuildIcon}>🔧</Text>
            <Text style={styles.rebuildTitle}>Rebuild Required for System TTS</Text>
            <Text style={styles.rebuildText}>
              System TTS requires expo-speech.{'\n'}
              Run: eas build --platform android --profile development
            </Text>
          </View>
        )}
        
        {/* Neural TTS - needs model loaded */}
        {!isSystemTTS && isModelLoaded && (
          <>
            <TextInput
              style={styles.input}
              value={ttsText}
              onChangeText={setTtsText}
              placeholder="Enter text to speak..."
              placeholderTextColor="#666"
              multiline
            />
            
            <View style={styles.speakingSection}>
              <Animated.View style={{ transform: [{ scale: speakingAnim }] }}>
                <Text style={styles.catEmoji}>{isSpeaking ? '🐱' : '😺'}</Text>
              </Animated.View>
              {isSpeaking && <Text style={styles.speakingText}>Synthesizing...</Text>}
            </View>
            
            <TouchableOpacity
              style={[styles.actionButton, isSpeaking && styles.stopButton]}
              onPress={handleSpeak}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>🔊 Synthesize</Text>
              )}
            </TouchableOpacity>
            
            <Text style={styles.ttsHint}>
              💡 Neural TTS generates audio file. Playback requires rebuild with expo-av.
            </Text>
          </>
        )}
        
        {/* System TTS - working */}
        {canUseSystemTTS && (
          <>
            <TextInput
              style={styles.input}
              value={ttsText}
              onChangeText={setTtsText}
              placeholder="Enter text to speak..."
              placeholderTextColor="#666"
              multiline
            />
            
            <View style={styles.speakingSection}>
              <Animated.View style={{ transform: [{ scale: speakingAnim }] }}>
                <Text style={styles.catEmoji}>{isSpeaking ? '🐱' : '😺'}</Text>
              </Animated.View>
              {isSpeaking && <Text style={styles.speakingText}>Speaking...</Text>}
            </View>
            
            <TouchableOpacity
              style={[styles.actionButton, isSpeaking && styles.stopButton]}
              onPress={handleSpeak}
              disabled={isLoading}
            >
              <Text style={styles.actionButtonText}>
                {isSpeaking ? '⏹️ Stop' : '🔊 Speak'}
              </Text>
            </TouchableOpacity>
          </>
        )}
        
        {response !== '' && (
          <View style={styles.responseBox}>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>⚡ RunAnywhere</Text>
          <Text style={styles.tagline}>On-Device AI for React Native</Text>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>🔧 DEV MODE</Text>
          </View>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabBar}>
          {renderTab('llm', 'LLM', '💬')}
          {renderTab('stt', 'STT', '🎤')}
          {renderTab('tts', 'TTS', '🔊')}
        </View>

        {/* Model Selection */}
        {isInitialized && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Select Model</Text>
              <TouchableOpacity onPress={() => setShowAddModel(true)}>
                <Text style={styles.addModelLink}>+ Add Custom</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modelList}>
              {getModelsForTab().map(renderModelCard)}
            </ScrollView>

            {/* Download/Load Buttons */}
            {selectedModel && (
              <View style={styles.modelActions}>
                {!selectedModel.isDownloaded && selectedModel.id !== 'system-tts' ? (
                  <TouchableOpacity
                    style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
                    onPress={handleDownloadModel}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Text style={styles.downloadButtonText}>📥 {downloadProgress}%</Text>
                    ) : (
                      <Text style={styles.downloadButtonText}>📥 Download {selectedModel.name}</Text>
                    )}
                  </TouchableOpacity>
                ) : !isModelLoaded ? (
                  <TouchableOpacity
                    style={[styles.loadButton, isLoading && styles.loadButtonDisabled]}
                    onPress={handleLoadModel}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.loadButtonText}>🚀 Load {selectedModel.name}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.loadedIndicator}>
                    <Text style={styles.loadedText}>✅ {selectedModel.name} Ready</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Tab Content */}
        {isInitialized && (
          <>
            {activeTab === 'llm' && renderLLMContent()}
            {activeTab === 'stt' && renderSTTContent()}
            {activeTab === 'tts' && renderTTSContent()}
          </>
        )}

        {/* SDK Not Available */}
        {!sdkAvailable && (
          <View style={styles.sdkNotAvailable}>
            <Text style={styles.sdkNotAvailableTitle}>📱 Development Build Required</Text>
            <Text style={styles.sdkNotAvailableText}>
              RunAnywhere uses native modules for on-device AI.{'\n\n'}
              1. Download the APK from EAS Build{'\n'}
              2. Install on your Android device{'\n'}
              3. Connect to this Expo server
            </Text>
            <TouchableOpacity
              style={styles.downloadApkButton}
              onPress={() => Linking.openURL('https://expo.dev/accounts/shubham280299/projects/runanywhere-demo/builds')}
            >
              <Text style={styles.downloadApkButtonText}>📥 Get Development Build</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Production Mode Info */}
        <View style={styles.productionInfo}>
          <Text style={styles.productionTitle}>🚀 Production Mode</Text>
          <Text style={styles.productionText}>
            Enable advanced capabilities:{'\n'}
            • 📊 Observability & Analytics Dashboard{'\n'}
            • ⚖️ Policy Engine (cost/latency/privacy routing){'\n'}
            • 🔄 Hybrid on-device + cloud inference{'\n'}
            • 📈 Usage insights & optimization
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://runanywhere.ai')}>
            <Text style={styles.learnMoreLink}>Learn more at runanywhere.ai →</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.npmjs.com/package/runanywhere-react-native')}>
            <Text style={styles.footerLink}>npm: runanywhere-react-native</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://github.com/RunanywhereAI/sdks')}>
            <Text style={styles.footerLink}>GitHub: RunanywhereAI/sdks</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Custom Model Modal */}
      <Modal visible={showAddModel} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Custom Model</Text>
            <Text style={styles.modalSubtitle}>Import from Hugging Face</Text>
            
            <TextInput
              style={styles.modalInput}
              value={customModelName}
              onChangeText={setCustomModelName}
              placeholder="Model name (e.g., My Custom LLM)"
              placeholderTextColor="#666"
            />
            
            <TextInput
              style={styles.modalInput}
              value={customModelURL}
              onChangeText={setCustomModelURL}
              placeholder="https://huggingface.co/..."
              placeholderTextColor="#666"
              autoCapitalize="none"
            />
            
            <Text style={styles.modalHint}>
              💡 Supports GGUF (LLM) and ONNX (STT/TTS) formats
            </Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowAddModel(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAddButton} onPress={handleAddCustomModel}>
                <Text style={styles.modalAddText}>Add Model</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    padding: 20,
  },
  
  // Header
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
  },
  modeBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  modeBadgeText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  
  // Error
  errorBox: {
    backgroundColor: '#3a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
  },
  
  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#2a2a2a',
  },
  tabIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  tabLabel: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
  },
  
  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  addModelLink: {
    color: '#007AFF',
    fontSize: 14,
  },
  
  // Model Cards
  modelList: {
    marginBottom: 12,
  },
  modelCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 180,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modelCardSelected: {
    borderColor: '#007AFF',
  },
  modelCardHeader: {
    marginBottom: 8,
  },
  modelName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  frameworkBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  frameworkText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  modelCardFooter: {
    marginTop: 4,
  },
  downloadedBadge: {
    color: '#4CAF50',
    fontSize: 12,
  },
  sizeText: {
    color: '#888',
    fontSize: 12,
  },
  
  // Model Actions
  modelActions: {
    marginTop: 8,
  },
  downloadButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  downloadButtonDisabled: {
    opacity: 0.7,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  loadButtonDisabled: {
    opacity: 0.7,
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadedIndicator: {
    backgroundColor: '#1a3a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  loadedText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Content Section
  contentSection: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  
  // Response Box
  responseBox: {
    backgroundColor: '#1a2a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  responseText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  
  // Rebuild Required
  rebuildRequired: {
    backgroundColor: '#2a2a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  rebuildIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  rebuildTitle: {
    color: '#FF9800',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  rebuildText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // STT Recording
  recordingSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  micContainer: {
    marginBottom: 16,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#333',
  },
  micButtonRecording: {
    backgroundColor: '#3a1a1a',
    borderColor: '#F44336',
  },
  micIcon: {
    fontSize: 40,
  },
  recordingHint: {
    color: '#888',
    fontSize: 14,
  },
  transcriptBox: {
    backgroundColor: '#1a1a2a',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  transcriptLabel: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  transcriptText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },
  
  // TTS Speaking
  speakingSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  catEmoji: {
    fontSize: 64,
  },
  speakingText: {
    color: '#4CAF50',
    fontSize: 14,
    marginTop: 8,
  },
  ttsHint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  
  // SDK Not Available
  sdkNotAvailable: {
    backgroundColor: '#1a1a2a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  sdkNotAvailableTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sdkNotAvailableText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  downloadApkButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  downloadApkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Production Info
  productionInfo: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  productionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  productionText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 24,
  },
  learnMoreLink: {
    color: '#007AFF',
    fontSize: 14,
    marginTop: 12,
  },
  
  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  footerLink: {
    color: '#666',
    fontSize: 13,
    marginVertical: 4,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalHint: {
    color: '#666',
    fontSize: 12,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 12,
  },
  modalCancelText: {
    color: '#888',
    fontSize: 16,
  },
  modalAddButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  modalAddText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

