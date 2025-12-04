export enum AspectRatio {
  Landscape = '16:9',
  Portrait = '9:16',
}

export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface GenerationStatus {
  step: 'idle' | 'script' | 'video' | 'audio' | 'complete' | 'error';
  message?: string;
  error?: string;
}

export interface MovieData {
  id: string;
  script: string;
  videoUrl: string;
  audioBuffer: AudioBuffer | null;
  aspectRatio: AspectRatio;
}
