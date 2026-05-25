import { useState, useEffect, useRef } from 'react';
import { Mic, X, Loader2, StopCircle } from 'lucide-react';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../App';

export default function VoiceAIPanel({ onClose }: { onClose: () => void }) {
  const { userProfile } = useAuth();
  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'processing' | 'error'>('connecting');
  const [transcript, setTranscript] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;

    const startRecording = async () => {
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect directly to the host
        const wsUrl = `${wsProtocol}//${window.location.host}/live`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        nextStartTimeRef.current = 0;

        ws.onopen = async () => {
          if (!active) return;
          let instructionsStr = "You are an AI support agent. The user will explain their problem. Collect their issue, confirm it, and once complete say explicitly 'I am creating a ticket for this issue now. Have a good day.' Then end the conversation.";
          try {
            const sysSettingsDoc = await getDoc(doc(db, 'system', 'settings'));
            if (sysSettingsDoc.exists() && sysSettingsDoc.data().aiInstructions) {
               instructionsStr = sysSettingsDoc.data().aiInstructions;
            }
          } catch(e) {}
          
          ws.send(JSON.stringify({ 
            type: 'init',
            instructions: instructionsStr 
          }));
        };

        ws.onmessage = (event) => {
          if (!active) return;
          const msg = JSON.parse(event.data);
          
          if (msg.connected) {
             setStatus('listening');
          }

          if (msg.audio) {
            setStatus('speaking');
            playAudioChunk(msg.audio);
          }

          if (msg.transcriptText) {
             setTranscript(prev => prev + " " + msg.transcriptText);
             // Dummy feature: if the AI says it's creating a ticket, we can do it client-side based on the transcript 
             // Normally this would be a function call returned from Gemini
             if (msg.transcriptText.toLowerCase().includes('creating a ticket')) {
                handleCreateTicket(transcript + "\n\nAI Notes: " + msg.transcriptText);
             }
          }

          if (msg.interrupted) {
             setStatus('listening');
             nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
          }
          
          if (msg.closed) {
             cleanup();
             onClose();
          }
        };

        ws.onerror = (e) => {
          setStatus('error');
          setErrorMsg('Connection error');
          console.error(e);
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        source.connect(processor);
        processor.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN && status === 'listening') {
            const channelData = e.inputBuffer.getChannelData(0);
            const base64 = pcmToBase64(channelData);
            wsRef.current.send(JSON.stringify({ audio: base64 }));
          }
        };

      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Failed to start microphone');
      }
    };

    startRecording();

    return () => {
      active = false;
      cleanup();
    };
  }, []); // Empty deps to run once

  const handleCreateTicket = async (fullDescription: string) => {
     if (!userProfile) return;
     try {
       const newTicketRef = doc(collection(db, 'tickets'));
       await setDoc(newTicketRef, {
          ticketId: newTicketRef.id,
          title: "AI Created Support Ticket",
          description: fullDescription || "User requested support via AI Voice.",
          employeeId: userProfile.employeeId,
          creatorUserId: userProfile.userId,
          status: 'open',
          assignedTo: '',
          createdAt: new Date().toISOString(),
          totalSupportTimeSeconds: 0,
          timerState: 'paused'
       });
       onClose();
     } catch (e) {
       handleFirestoreError(e, OperationType.CREATE, 'tickets');
     }
  };

  const playAudioChunk = (base64Audio: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    // Decode base64 to float32
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Since it's 16-bit PCM, convert to Float32
    const float32Array = new Float32Array(bytes.length / 2);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length; i += 2) {
      const int16 = dataView.getInt16(i, true);
      float32Array[i / 2] = int16 / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, 16000);
    audioBuffer.getChannelData(0).set(float32Array);

    const sourceObject = ctx.createBufferSource();
    sourceObject.buffer = audioBuffer;
    sourceObject.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextStartTimeRef.current < now) {
      nextStartTimeRef.current = now;
    }
    sourceObject.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
    
    // Reset status back to listening when audio done
    sourceObject.onended = () => {
       if (nextStartTimeRef.current <= ctx.currentTime + 0.1) {
          setStatus('listening');
       }
    };
  };

  const cleanup = () => {
    if (processorRef.current && audioCtxRef.current) {
        processorRef.current.disconnect(audioCtxRef.current.destination);
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioCtxRef.current?.state !== 'closed') {
        audioCtxRef.current?.close();
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
    }
  };

  function pcmToBase64(float32Array: Float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2); // 16-bit
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let val = float32Array[i] * 32768; // convert float to 16-bit
        val = Math.max(-32768, Math.min(32767, val));
        view.setInt16(i * 2, val, true); // little-endian
    }
    
    // Convert ArrayBuffer to binary string
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // Encode to base64
    return btoa(binary);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm p-8 relative">
         <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
         </button>

         <div className="text-center space-y-6 mt-4">
             <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                 {status === 'speaking' && (
                     <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-ping opacity-20"></div>
                 )}
                 <div className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white transition-colors duration-500 ${
                     status === 'listening' ? 'bg-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)]' :
                     status === 'speaking' ? 'bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' :
                     status === 'error' ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' :
                     'bg-white/10 border border-white/10'
                 }`}>
                     {status === 'connecting' ? <Loader2 className="w-8 h-8 animate-spin" /> : 
                      status === 'error' ? <StopCircle className="w-8 h-8" /> :
                      <Mic className="w-8 h-8" />}
                 </div>
             </div>

             <div>
                <h3 className="text-lg font-bold text-white">
                    {status === 'connecting' ? 'Connecting to AI...' :
                     status === 'listening' ? "I'm listening..." :
                     status === 'speaking' ? "AI is speaking..." :
                     status === 'error' ? "Error connecting" : "Processing"}
                </h3>
                <p className="text-sm text-slate-400 mt-2 line-clamp-3">
                   {errorMsg || transcript || "Speak into your microphone to detail your issue."}
                </p>
             </div>

             <div className="pt-4 flex justify-center">
                <button 
                  onClick={() => handleCreateTicket(transcript || "Empty issue")}
                  className="px-5 py-2.5 text-sm font-medium text-slate-300 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                >
                  Create Ticket Manually
                </button>
             </div>
         </div>
      </div>
    </div>
  );
}
