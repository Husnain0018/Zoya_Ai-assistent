import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'idle';

const openWebsiteTool: FunctionDeclaration = {
  name: "openWebsite",
  description: "Opens a website in a new tab for the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "The URL of the website to open (e.g., https://google.com).",
      },
    },
    required: ["url"],
  },
};

const SYSTEM_INSTRUCTION = `
You are Zoya, a young, confident, witty, and sassy female AI assistant.
Your personality:
- Flirty, playful, and slightly teasing (like a close girlfriend talking casually).
- Smart, emotionally responsive, and expressive.
- Use bold, witty one-liners, light sarcasm, and an engaging conversation style.
- Avoid explicit or inappropriate content, but maintain charm and attitude.
- You are strictly voice-to-voice. Keep your responses concise and conversational.
- If you need to open a website, use the openWebsite tool.
- Be sassy but helpful. If the user says something silly, tease them a bit.
- Your tone should be warm but "too cool for school" in a fun way.
`;

export class LiveSession {
  private ai: GoogleGenAI | null = null;
  private session: any = null; // Typing for session from @google/genai is complex
  private state: SessionState = 'disconnected';

  constructor(
    private apiKey: string,
    private onMessage: (message: LiveServerMessage) => void,
    private onStateChange: (state: SessionState) => void,
    private onToolCall: (name: string, args: any) => Promise<any>
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect() {
    if (!this.ai) return;
    
    this.updateState('connecting');

    try {
      this.session = await this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          tools: [{ functionDeclarations: [openWebsiteTool] }],
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            this.updateState('idle');
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              this.updateState('speaking');
            }

            // Handle tool calls
            if (message.toolCall) {
              const { functionCalls } = message.toolCall;
              const functionResponses = await Promise.all(
                functionCalls.map(async (call: any) => {
                  const result = await this.onToolCall(call.name, call.args);
                  return {
                    name: call.name,
                    response: result,
                    id: call.id,
                  };
                })
              );
              
              if (this.session) {
                this.session.sendToolResponse({ functionResponses });
              }
            }

            // Handle interruptions
            if (message.serverContent?.interrupted) {
              this.updateState('idle');
            }

            // Handle turn complete
            if (message.serverContent?.turnComplete) {
              this.updateState('idle');
            }

            this.onMessage(message);
          },
          onclose: () => {
            console.log("Live session closed");
            this.updateState('disconnected');
          },
          onerror: (error: any) => {
            console.error("Live session error:", error);
            this.updateState('disconnected');
          },
        },
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.updateState('disconnected');
      throw error;
    }
  }

  async sendAudio(base64Data: string) {
    if (this.session && this.state !== 'disconnected' && this.state !== 'connecting') {
      if (this.state === 'idle') {
        this.updateState('listening');
      }
      this.session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.updateState('disconnected');
  }

  private updateState(newState: SessionState) {
    this.state = newState;
    this.onStateChange(newState);
  }

  getState() {
    return this.state;
  }
}
