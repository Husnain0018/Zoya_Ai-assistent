import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Loader2, Sparkles, Globe } from 'lucide-react';
import { AudioStreamer } from '../lib/audio-streamer';
import { LiveSession, SessionState } from '../lib/live-session';

const ZoyaUI: React.FC = () => {
  const [state, setState] = useState<SessionState>('disconnected');
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);

  useEffect(() => {
    // Initialize audio streamer
    audioStreamerRef.current = new AudioStreamer(16000, 24000);
    
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
      }
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stopStreaming();
      }
    };
  }, []);

  const handlePowerToggle = async () => {
    if (isPowerOn) {
      // Turn off
      setIsPowerOn(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.disconnect();
      }
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stopStreaming();
      }
      setState('disconnected');
    } else {
      // Turn on
      setIsPowerOn(true);
      setErrorMessage(null);
      
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("GEMINI_API_KEY is missing. Please add it to your environment.");
        }

        liveSessionRef.current = new LiveSession(
          apiKey,
          async (message) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioStreamerRef.current) {
              await audioStreamerRef.current.playAudioChunk(base64Audio);
            }
            
            // Handle turn complete
            if (message.serverContent?.turnComplete) {
              setState('idle');
            }
          },
          (newState) => {
            setState(newState);
          },
          async (name, args) => {
            if (name === 'openWebsite') {
              window.open(args.url, '_blank');
              return { success: true, message: `Opened ${args.url}` };
            }
            return { error: "Unknown tool" };
          }
        );

        await liveSessionRef.current.connect();
        
        if (audioStreamerRef.current) {
          await audioStreamerRef.current.startStreaming((base64Data) => {
            if (liveSessionRef.current) {
              liveSessionRef.current.sendAudio(base64Data);
            }
          });
        }
      } catch (error: any) {
        console.error("Failed to start Zoya:", error);
        setErrorMessage(error.message || "Something went wrong. Try again?");
        setIsPowerOn(false);
        setState('disconnected');
      }
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'disconnected': return isPowerOn ? 'Waking up...' : 'Zoya is sleeping';
      case 'connecting': return 'Connecting to Zoya...';
      case 'idle': return 'Zoya is listening...';
      case 'listening': return 'Go on, I\'m listening...';
      case 'speaking': return 'Zoya is speaking...';
      default: return 'Zoya is here';
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case 'disconnected': return 'text-gray-500';
      case 'connecting': return 'text-blue-400';
      case 'idle': return 'text-emerald-400';
      case 'listening': return 'text-pink-400';
      case 'speaking': return 'text-purple-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden font-sans text-white select-none">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000 opacity-20 ${
          state === 'speaking' ? 'bg-purple-600 scale-110' : 
          state === 'listening' ? 'bg-pink-600 scale-105' : 
          state === 'idle' ? 'bg-emerald-600' : 
          isPowerOn ? 'bg-blue-600' : 'bg-transparent'
        }`} />
      </div>

      {/* Header */}
      <div className="absolute top-12 left-0 right-0 flex flex-col items-center z-10">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold tracking-tighter italic flex items-center gap-2"
        >
          ZOYA <Sparkles className="w-6 h-6 text-pink-400" />
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={`text-sm uppercase tracking-widest mt-2 font-mono ${getStatusColor()}`}
        >
          {getStatusText()}
        </motion.p>
      </div>

      {/* Central Interface */}
      <div className="relative flex items-center justify-center w-full max-w-md aspect-square">
        {/* Waveform / Visualizer */}
        <AnimatePresence>
          {isPowerOn && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: state === 'speaking' ? [20, 100, 40, 120, 20] : 
                            state === 'listening' ? [10, 40, 20, 60, 10] : 
                            [5, 15, 5],
                    opacity: state === 'idle' ? 0.3 : 0.8
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: "easeInOut"
                  }}
                  className={`w-1 mx-1 rounded-full ${
                    state === 'speaking' ? 'bg-purple-500' : 
                    state === 'listening' ? 'bg-pink-500' : 
                    'bg-emerald-500'
                  }`}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handlePowerToggle}
          className={`relative z-20 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
            isPowerOn 
              ? 'bg-white text-black shadow-[0_0_50px_rgba(255,255,255,0.3)]' 
              : 'bg-zinc-900 text-white border border-zinc-800 hover:border-zinc-600'
          }`}
        >
          {state === 'connecting' ? (
            <Loader2 className="w-12 h-12 animate-spin" />
          ) : isPowerOn ? (
            <Power className="w-12 h-12" />
          ) : (
            <Mic className="w-12 h-12" />
          )}
          
          {/* Pulse Effect */}
          {isPowerOn && (
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-white pointer-events-none"
            />
          )}
        </motion.button>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 bg-red-900/40 border border-red-500/50 px-6 py-3 rounded-2xl text-sm text-red-200 backdrop-blur-md max-w-[80%]"
          >
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="absolute bottom-12 flex flex-col items-center gap-4 opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-tighter mb-1">Live API</span>
            <div className={`w-2 h-2 rounded-full ${state !== 'disconnected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-tighter mb-1">Mic Input</span>
            <div className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] font-mono">
          © 2026 ZOYA PROTOCOL v3.1
        </p>
      </div>

      {/* Corner Accents */}
      <div className="absolute top-8 left-8 w-12 h-12 border-t border-l border-white/10" />
      <div className="absolute top-8 right-8 w-12 h-12 border-t border-r border-white/10" />
      <div className="absolute bottom-8 left-8 w-12 h-12 border-b border-l border-white/10" />
      <div className="absolute bottom-8 right-8 w-12 h-12 border-b border-r border-white/10" />
    </div>
  );
};

export default ZoyaUI;
