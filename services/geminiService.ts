import { GoogleGenAI, Modality } from "@google/genai";
import { AspectRatio, VoiceName } from "../types";
import { decodeAudioData } from "./audioUtils";

// Define a type for the window object to include aistudio
declare global {
  interface Window {
    // Helper to cache the audio context to reuse it
    _audioContext?: AudioContext;
  }
}

// Function to ensure we have a paid API key selected
export const ensureApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    return hasKey;
  }
  return false;
};

export const promptForApiKey = async (): Promise<void> => {
  const win = window as any;
  if (win.aistudio) {
    await win.aistudio.openSelectKey();
  }
};

// 1. Generate Script
export const generateScript = async (idea: string): Promise<string> => {
  // Always create a fresh instance to pick up the latest env var
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    You are a professional movie script writer. 
    Write a short, engaging voiceover script (maximum 2-3 sentences) for a video based on this idea: "${idea}".
    The script should be suitable for a 5-10 second video clip.
    Output ONLY the raw text of the script, no labels like "Voiceover:" or "Narrator:".
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return response.text?.trim() || "Enjoy this scene.";
};

// 2. Generate Video (Veo)
export const generateVideo = async (idea: string, aspectRatio: AspectRatio): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Veo 3.1 Fast
  const model = 'veo-3.1-fast-generate-preview';

  let operation = await ai.models.generateVideos({
    model: model,
    prompt: idea,
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: aspectRatio,
    }
  });

  // Poll for completion
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  
  if (!videoUri) {
    throw new Error("Failed to generate video URI.");
  }

  // Fetch the actual video blob
  // "You must append an API key when fetching from the download link."
  const fetchUrl = `${videoUri}&key=${process.env.API_KEY}`;
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Failed to download video: ${res.statusText}`);
  }
  
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

// 3. Generate Speech (TTS)
export const generateSpeech = async (text: string, voice: VoiceName): Promise<AudioBuffer> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.5-flash-preview-tts';

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned from TTS model.");
  }

  // Use a shared audio context if possible, or create new
  const ctx = getAudioContext();
  return await decodeAudioData(base64Audio, ctx, 24000, 1);
};

// Helper to get AudioContext
export const getAudioContext = (): AudioContext => {
  if (!window._audioContext) {
    window._audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  // Resume if suspended (browser policy)
  if (window._audioContext.state === 'suspended') {
     window._audioContext.resume();
  }
  return window._audioContext;
};