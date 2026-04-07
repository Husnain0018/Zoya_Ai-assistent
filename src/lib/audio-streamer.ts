/**
 * AudioStreamer handles microphone input and audio playback for the Gemini Live API.
 * It converts microphone input to PCM16 16kHz and plays back PCM16 24kHz audio.
 */
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;

  constructor(private sampleRateIn: number = 16000, private sampleRateOut: number = 24000) {}

  async startStreaming(onAudioData: (base64Data: string) => void) {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRateIn,
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Using ScriptProcessorNode for simplicity in this environment, 
      // though AudioWorklet is preferred in modern apps.
      // Reduced buffer size for lower latency on mobile.
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16Data = this.floatToPcm16(inputData);
        const base64Data = this.arrayBufferToBase64(pcm16Data.buffer);
        onAudioData(base64Data);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      
      this.nextStartTime = this.audioContext.currentTime;
    } catch (error) {
      console.error("Error starting audio streaming:", error);
      throw error;
    }
  }

  stopStreaming() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  async playAudioChunk(base64Data: string) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRateOut,
      });
      this.nextStartTime = this.audioContext.currentTime;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const arrayBuffer = this.base64ToArrayBuffer(base64Data);
    const pcm16Data = new Int16Array(arrayBuffer);
    const floatData = this.pcm16ToFloat(pcm16Data);

    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, this.sampleRateOut);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Gain node for volume control if needed
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    
    // Safety check: ensure gainNode belongs to the same context
    if (this.gainNode.context !== this.audioContext) {
      this.gainNode.disconnect();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }

    source.connect(this.gainNode);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
    this.isPlaying = true;

    source.onended = () => {
      if (this.audioContext && this.audioContext.currentTime >= this.nextStartTime - 0.1) {
        this.isPlaying = false;
      }
    };
  }

  private floatToPcm16(floatData: Float32Array): Int16Array {
    const pcm16Data = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i]));
      pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16Data;
  }

  private pcm16ToFloat(pcm16Data: Int16Array): Float32Array {
    const floatData = new Float32Array(pcm16Data.length);
    for (let i = 0; i < pcm16Data.length; i++) {
      floatData[i] = pcm16Data[i] / 0x8000;
    }
    return floatData;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
