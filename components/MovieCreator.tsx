import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Film, Clapperboard, Sparkles, Wand2, RefreshCw, AlertCircle, Download, Volume2, VolumeX } from 'lucide-react';
import { AspectRatio, VoiceName, GenerationStatus, MovieData } from '../types';
import * as geminiService from '../services/geminiService';
import { audioBufferToWav } from '../services/audioUtils';

export const MovieCreator: React.FC = () => {
  // Input State
  const [idea, setIdea] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Landscape);
  const [voice, setVoice] = useState<VoiceName>(VoiceName.Kore);
  
  // App Logic State
  const [status, setStatus] = useState<GenerationStatus>({ step: 'idle' });
  const [movie, setMovie] = useState<MovieData | null>(null);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initial Check
  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const ready = await geminiService.ensureApiKey();
    setApiKeyReady(ready);
  };

  const handleSelectApiKey = async () => {
    try {
      await geminiService.promptForApiKey();
      // Assume success if no error, but recheck is safer
      setApiKeyReady(true);
    } catch (e) {
      console.error(e);
      setStatus({ step: 'error', error: 'Failed to select API key' });
    }
  };

  const generateMovie = async () => {
    if (!idea.trim()) return;
    
    // Reset previous movie if exists
    if (movie) {
      URL.revokeObjectURL(movie.videoUrl);
      setMovie(null);
    }
    
    setIsPlaying(false);
    stopAudio();

    try {
      // 1. Script
      setStatus({ step: 'script', message: 'Writing the screenplay...' });
      const script = await geminiService.generateScript(idea);
      
      // 2. Video & Audio (Parallel)
      setStatus({ step: 'video', message: 'Filming on location (Veo) & Recording voiceover...' });
      
      // Use Promise.all for concurrency
      const [videoUrl, audioBuffer] = await Promise.all([
        geminiService.generateVideo(idea, aspectRatio),
        geminiService.generateSpeech(script, voice)
      ]);

      setMovie({
        id: Date.now().toString(),
        script,
        videoUrl,
        audioBuffer,
        aspectRatio
      });
      
      setStatus({ step: 'complete', message: 'Movie ready!' });

    } catch (err: any) {
      console.error(err);
      const msg = err.message || 'An unexpected error occurred.';
      if (msg.includes('Requested entity was not found') || msg.includes('403') || msg.includes('401')) {
         setStatus({ step: 'error', error: 'API Key Error. Please re-select your paid API key.' });
         setApiKeyReady(false);
      } else {
         setStatus({ step: 'error', error: msg });
      }
    }
  };

  // Audio Playback Logic
  const playAudio = () => {
    if (!movie?.audioBuffer) return;
    
    const ctx = geminiService.getAudioContext();
    audioContextRef.current = ctx;

    // Stop existing source
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
    }

    const source = ctx.createBufferSource();
    source.buffer = movie.audioBuffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = isMuted ? 0 : 1;
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.start(0);
    
    audioSourceRef.current = source;
    gainNodeRef.current = gainNode;
    
    // Handle audio end
    source.onended = () => {
      // If video is still playing, we let it finish, 
      // but if we wanted to loop audio we would restart here.
      // For now, let's just let the video loop control the state if video is longer.
    };
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || !movie) return;

    if (isPlaying) {
      videoRef.current.pause();
      stopAudio();
      setIsPlaying(false);
    } else {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      playAudio();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = !isMuted ? 0 : 1;
    }
    if (videoRef.current) {
        videoRef.current.muted = !isMuted; // Sync video mute too just in case Veo adds audio later
    }
  };

  // Sync video end
  const handleVideoEnded = () => {
    setIsPlaying(false);
    stopAudio();
  };
  
  const handleVideoPause = () => {
      // If the user manually pauses the native controls
      if(isPlaying) {
          setIsPlaying(false);
          stopAudio();
      }
  }
  
  const handleVideoPlay = () => {
      // If the user manually plays native controls
      if(!isPlaying) {
          setIsPlaying(true);
          playAudio();
      }
  }

  // Clean up
  useEffect(() => {
    return () => {
      stopAudio();
      if (movie?.videoUrl) {
        URL.revokeObjectURL(movie.videoUrl);
      }
    };
  }, []);

  const downloadMovie = () => {
      if(!movie) return;
      // Download Video
      const a = document.createElement('a');
      a.href = movie.videoUrl;
      a.download = `cinegen_video_${movie.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Download Audio (WAV)
      if(movie.audioBuffer) {
          const wavBlob = audioBufferToWav(movie.audioBuffer);
          const url = URL.createObjectURL(wavBlob);
          const b = document.createElement('a');
          b.href = url;
          b.download = `cinegen_audio_${movie.id}.wav`;
          document.body.appendChild(b);
          b.click();
          document.body.removeChild(b);
          URL.revokeObjectURL(url);
      }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-4 tracking-tight">
          CineGen AI
        </h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Turn your ideas into cinematic scenes with AI-generated video and voiceovers. 
          Powered by Gemini Veo and Flash TTS.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        
        {/* Left Column: Input Panel */}
        <div className="space-y-8 bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800 backdrop-blur-xl shadow-xl">
          
          {/* API Key Check */}
          {!apiKeyReady && (
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
              <h3 className="text-amber-200 font-semibold mb-2">Activation Required</h3>
              <p className="text-amber-200/70 text-sm mb-4">
                High-quality video generation requires a paid API key from a Google Cloud Project with billing enabled.
              </p>
              <button 
                onClick={handleSelectApiKey}
                className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Select Paid API Key
              </button>
              <div className="mt-4 text-xs text-amber-500/50">
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline">
                  View billing documentation
                </a>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Describe your scene
              </label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A futuristic city with flying cars in a cyberpunk style, neon lights reflection in rain..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none h-32 text-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                    <Film className="w-4 h-4 text-pink-400" />
                    Format
                </label>
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                    <button
                        onClick={() => setAspectRatio(AspectRatio.Landscape)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                            aspectRatio === AspectRatio.Landscape 
                            ? 'bg-zinc-800 text-white shadow-lg' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Landscape (16:9)
                    </button>
                    <button
                        onClick={() => setAspectRatio(AspectRatio.Portrait)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                            aspectRatio === AspectRatio.Portrait 
                            ? 'bg-zinc-800 text-white shadow-lg' 
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Portrait (9:16)
                    </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-400" />
                    Voice
                </label>
                <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value as VoiceName)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                >
                    {Object.values(VoiceName).map((v) => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>
              </div>
            </div>

            <button
              onClick={generateMovie}
              disabled={!apiKeyReady || !idea || status.step === 'script' || status.step === 'video'}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-95
                ${(!apiKeyReady || !idea) 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-purple-900/20'
                }
              `}
            >
              {status.step === 'script' || status.step === 'video' ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Clapperboard className="w-6 h-6" />
                  Action!
                </>
              )}
            </button>
          </div>

          {/* Status Messages */}
          {status.step !== 'idle' && (
            <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300
               ${status.step === 'error' ? 'bg-red-900/20 text-red-300 border border-red-800' : 'bg-zinc-950/50 text-zinc-300 border border-zinc-800'}
            `}>
              {status.step === 'script' && <Wand2 className="w-4 h-4 text-purple-400 animate-pulse" />}
              {status.step === 'video' && <Film className="w-4 h-4 text-pink-400 animate-pulse" />}
              {status.step === 'complete' && <Sparkles className="w-4 h-4 text-green-400" />}
              {status.step === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
              {status.message || status.error}
            </div>
          )}
        </div>

        {/* Right Column: Preview Panel */}
        <div className="bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800 backdrop-blur-xl shadow-xl min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden group">
          
          {!movie && status.step !== 'video' && status.step !== 'script' && (
             <div className="text-center text-zinc-600 space-y-4">
               <div className="w-24 h-24 rounded-full bg-zinc-800 mx-auto flex items-center justify-center">
                 <Film className="w-10 h-10 opacity-20" />
               </div>
               <p>Your masterpiece will appear here</p>
             </div>
          )}

          {(status.step === 'script' || status.step === 'video') && (
            <div className="text-center space-y-8">
              <div className="relative w-32 h-32 mx-auto">
                 <div className="absolute inset-0 rounded-full border-4 border-zinc-800"></div>
                 <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                   <Wand2 className="w-8 h-8 text-purple-500 animate-pulse" />
                 </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Creating Scene</h3>
                <p className="text-zinc-400 max-w-xs mx-auto text-sm">{status.message}</p>
                <p className="text-xs text-zinc-600 pt-2">This may take 1-2 minutes for Veo video generation.</p>
              </div>
            </div>
          )}

          {movie && (
            <div className="w-full h-full flex flex-col gap-6 animate-in zoom-in duration-500">
               {/* Video Player */}
               <div className={`relative rounded-2xl overflow-hidden shadow-2xl bg-black border border-zinc-800 mx-auto transition-all duration-500
                 ${movie.aspectRatio === AspectRatio.Landscape ? 'w-full aspect-video' : 'h-[600px] aspect-[9/16]'}
               `}>
                 <video
                   ref={videoRef}
                   src={movie.videoUrl}
                   className="w-full h-full object-cover"
                   playsInline
                   onEnded={handleVideoEnded}
                   onPause={handleVideoPause}
                   onPlay={handleVideoPlay}
                   // Note: We handle muted state manually to ensure sync, but video tag needs muted to autoplay often.
                   // However we don't autoplay here.
                 />
                 
                 {/* Custom Controls Overlay */}
                 <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                    <button 
                      onClick={togglePlay}
                      className="w-20 h-20 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transition-all transform hover:scale-110 group-hover:shadow-2xl"
                    >
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-white fill-current" />
                      ) : (
                        <Play className="w-8 h-8 text-white fill-current ml-1" />
                      )}
                    </button>
                 </div>

                 {/* Top Right Controls */}
                 <div className="absolute top-4 right-4 flex gap-2">
                     <button onClick={toggleMute} className="p-2 bg-black/50 hover:bg-black/70 rounded-full backdrop-blur text-white">
                         {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                     </button>
                 </div>
               </div>

               {/* Script & Actions */}
               <div className="bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800/50">
                 <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Script</h3>
                    <button 
                       onClick={downloadMovie}
                       className="text-xs flex items-center gap-1 text-zinc-500 hover:text-white transition-colors"
                    >
                        <Download size={14} /> Download Assets
                    </button>
                 </div>
                 <p className="text-zinc-200 font-medium leading-relaxed italic">"{movie.script}"</p>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
