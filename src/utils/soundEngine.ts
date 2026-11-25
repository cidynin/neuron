import type { CustomSoundPack, SoundId, SoundVolume } from '../types/neuron';

export type KeyStrokeKind = 'char' | 'space' | 'enter' | 'backspace' | 'nav';

export const SOUND_VOLUME_OPTIONS: { id: SoundVolume; label: string; multiplier: number }[] = [
  { id: 'low', label: 'low', multiplier: 0.4 },
  { id: 'default', label: 'default', multiplier: 1.0 },
  { id: 'loud', label: 'loud', multiplier: 2.2 },
];

export function getSoundVolumeMultiplier(volume: SoundVolume = 'default'): number {
  const found = SOUND_VOLUME_OPTIONS.find((opt) => opt.id === volume);
  return found ? found.multiplier : 1.0;
}

export function isSoundRepeatThrottled(
  lastPlayTimeMs: number,
  nowMs: number,
  isRepeat: boolean,
  minIntervalMs = 24,
): boolean {
  if (!isRepeat) return false;
  return nowMs - lastPlayTimeMs < minIntervalMs;
}

export interface OscillatorKeySpec {
  waveform: OscillatorType;
  startFreq: number;
  endFreq: number;
  durationSec: number;
}

/**
 * Pure sound synthesis descriptor used for deterministic verification & WebAudio playback.
 */
export function getEightBitOscillatorSpec(
  kind: KeyStrokeKind,
  step = 0,
): OscillatorKeySpec {
  if (kind === 'enter') {
    return { waveform: 'square', startFreq: 523.25, endFreq: 783.99, durationSec: 0.095 };
  }
  if (kind === 'backspace') {
    return { waveform: 'square', startFreq: 320, endFreq: 190, durationSec: 0.042 };
  }
  if (kind === 'space') {
    // Crisp retro chiptune step pulse matching the 8-bit square soundpack
    return { waveform: 'square', startFreq: 261.63, endFreq: 329.63, durationSec: 0.038 };
  }
  if (kind === 'nav') {
    const navNotes = [392.0, 440.0, 493.88, 523.25];
    const freq = navNotes[step % navNotes.length];
    return { waveform: 'square', startFreq: freq, endFreq: freq * 1.12, durationSec: 0.026 };
  }
  const notes = [440, 523.25, 587.33, 659.25];
  const freq = notes[step % notes.length];
  return { waveform: 'square', startFreq: freq, endFreq: freq * 1.25, durationSec: 0.032 };
}

let sharedAudioCtx: AudioContext | null = null;
let noiseBufferCache: AudioBuffer | null = null;
let eightBitStep = 0;
let marimbaStep = 0;
let lastKeySoundMs = 0;

const customSoundDataUrlMap = new Map<string, string>();
const customSoundSourceUrlMap = new Map<string, string>();
const customSoundBufferCache = new Map<string, AudioBuffer>();
const decodingSoundIds = new Set<string>();
const failedDecodeSoundIds = new Set<string>();
const htmlAudioPoolMap = new Map<string, { elements: HTMLAudioElement[]; cursor: number }>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBufferCache && noiseBufferCache.sampleRate === ctx.sampleRate) {
    return noiseBufferCache;
  }
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBufferCache = buffer;
  return buffer;
}

async function decodeCustomSoundDataUrl(
  ctx: AudioContext,
  id: string,
  dataUrl: string,
): Promise<AudioBuffer | null> {
  if (customSoundBufferCache.has(id)) {
    return customSoundBufferCache.get(id) ?? null;
  }
  if (decodingSoundIds.has(id) || failedDecodeSoundIds.has(id)) return null;
  decodingSoundIds.add(id);
  try {
    const res = await fetch(dataUrl);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    customSoundBufferCache.set(id, audioBuffer);
    return audioBuffer;
  } catch {
    failedDecodeSoundIds.add(id);
    return null;
  } finally {
    decodingSoundIds.delete(id);
  }
}

function playHtmlAudioFallback(
  id: string,
  url: string,
  kind: KeyStrokeKind,
  volume: SoundVolume,
): void {
  if (typeof Audio === 'undefined') return;
  let pool = htmlAudioPoolMap.get(id);
  if (!pool) {
    const elements = Array.from({ length: 4 }, () => {
      const a = new Audio(url);
      a.preload = 'auto';
      return a;
    });
    pool = { elements, cursor: 0 };
    htmlAudioPoolMap.set(id, pool);
  }
  const audio = pool.elements[pool.cursor % pool.elements.length];
  pool.cursor += 1;
  const mult = getSoundVolumeMultiplier(volume);
  const targetVol = Math.max(0.05, Math.min(1, (kind === 'nav' ? 0.34 : 0.42) * mult));
  const rate =
    kind === 'space'
      ? 0.88
      : kind === 'enter'
        ? 1.08
        : kind === 'backspace'
          ? 0.92
          : kind === 'nav'
            ? 1.02 + Math.random() * 0.06
            : 0.96 + Math.random() * 0.08;
  try {
    audio.volume = targetVol;
    audio.playbackRate = rate;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Ignore autoplay or media decode errors
  }
}

export function registerCustomSoundPack(pack: CustomSoundPack): void {
  if (customSoundDataUrlMap.get(pack.id) !== pack.dataUrl) {
    customSoundDataUrlMap.set(pack.id, pack.dataUrl);
    if (pack.sourceUrl) {
      customSoundSourceUrlMap.set(pack.id, pack.sourceUrl);
    } else {
      customSoundSourceUrlMap.delete(pack.id);
    }
    customSoundBufferCache.delete(pack.id);
    failedDecodeSoundIds.delete(pack.id);
    htmlAudioPoolMap.delete(pack.id);
    const ctx = getAudioContext();
    if (ctx) {
      void decodeCustomSoundDataUrl(ctx, pack.id, pack.dataUrl);
    }
  }
}

export function registerCustomSoundPacks(packs: CustomSoundPack[]): void {
  const activeIds = new Set(packs.map((p) => p.id));
  for (const existingId of Array.from(customSoundDataUrlMap.keys())) {
    if (!activeIds.has(existingId)) {
      customSoundDataUrlMap.delete(existingId);
      customSoundSourceUrlMap.delete(existingId);
      customSoundBufferCache.delete(existingId);
      failedDecodeSoundIds.delete(existingId);
      htmlAudioPoolMap.delete(existingId);
    }
  }
  for (const pack of packs) {
    registerCustomSoundPack(pack);
  }
}

export function classifyKey(key: string): KeyStrokeKind | null {
  if (key === 'Enter') return 'enter';
  if (key === ' ') return 'space';
  if (key === 'Backspace' || key === 'Delete') return 'backspace';
  if (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown'
  ) {
    return 'nav';
  }
  if (key.length === 1) return 'char';
  return null;
}

export function classifyKeyEventForSound(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyStrokeKind | null {
  // Always play backspace sound on Ctrl/Cmd/Alt + Backspace/Delete word deletion
  if (e.key === 'Backspace' || e.key === 'Delete') {
    return 'backspace';
  }
  // Always play arrow navigation click (including Ctrl/Alt word-jump & Shift selection)
  if (
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown'
  ) {
    return 'nav';
  }
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return null;
  }
  return classifyKey(e.key);
}

export function playTypingSound(
  sound: SoundId,
  kind: KeyStrokeKind = 'char',
  volume: SoundVolume = 'default',
  options: { isRepeat?: boolean } = {},
): void {
  if (sound === 'off') return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (isSoundRepeatThrottled(lastKeySoundMs, nowMs, Boolean(options.isRepeat))) {
    return;
  }
  lastKeySoundMs = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;

  const mult = getSoundVolumeMultiplier(volume);
  const scaleGain = (base: number) => Math.min(0.85, base * mult);
  const now = ctx.currentTime;
  const jitter = 0.94 + Math.random() * 0.12;

  // Custom user-linked / uploaded audio sample playback
  if (customSoundDataUrlMap.has(sound)) {
    const playBuffer = (buffer: AudioBuffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const rate =
        kind === 'space'
          ? 0.88
          : kind === 'enter'
            ? 1.08
            : kind === 'backspace'
              ? 0.92
              : kind === 'nav'
                ? 1.02 + Math.random() * 0.06
                : 0.96 + Math.random() * 0.08;
      source.playbackRate.setValueAtTime(rate, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.25 : 0.32), now);
      source.connect(gain);
      gain.connect(ctx.destination);
      const maxDuration = Math.min(buffer.duration, 0.35);
      source.start(now, 0, maxDuration);
    };

    const cached = customSoundBufferCache.get(sound);
    if (cached) {
      playBuffer(cached);
    } else {
      const dataUrl = customSoundDataUrlMap.get(sound);
      const fallbackUrl = customSoundSourceUrlMap.get(sound) ?? dataUrl;
      if (failedDecodeSoundIds.has(sound)) {
        if (fallbackUrl) playHtmlAudioFallback(sound, fallbackUrl, kind, volume);
      } else if (dataUrl) {
        void decodeCustomSoundDataUrl(ctx, sound, dataUrl).then((decoded) => {
          if (decoded) {
            playBuffer(decoded);
          } else if (fallbackUrl) {
            playHtmlAudioFallback(sound, fallbackUrl, kind, volume);
          }
        });
      }
    }
    return;
  }

  if (sound === 'thock') {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const baseFreq =
      kind === 'space'
        ? 118
        : kind === 'enter'
          ? 132
          : kind === 'backspace'
            ? 142
            : kind === 'nav'
              ? 188
              : 172;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.052);

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(
      scaleGain(kind === 'space' ? 0.24 : kind === 'nav' ? 0.145 : 0.19),
      now + 0.004,
    );
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.062);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.068);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((kind === 'nav' ? 1120 : 980) * jitter, now);
    filter.Q.setValueAtTime(1.4, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.06 : 0.08), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.03);
    return;
  }

  if (sound === 'creamy') {
    // Smooth lubed linear switch: low-passed warm body + soft bottom-out pop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq =
      kind === 'space'
        ? 195
        : kind === 'enter'
          ? 235
          : kind === 'backspace'
            ? 250
            : kind === 'nav'
              ? 330
              : 305;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.48, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(
      scaleGain(kind === 'space' ? 0.22 : kind === 'nav' ? 0.13 : 0.17),
      now + 0.003,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.058);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1450 * jitter, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.05 : 0.065), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.028);
    return;
  }

  if (sound === 'buckling') {
    // Vintage IBM Model M buckling spring snap: high metallic click + resonant chamber ping
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(
      (kind === 'space' ? 2400 : kind === 'nav' ? 4300 : 4100) * jitter,
      now,
    );
    bp.Q.setValueAtTime(3.2, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.16 : 0.22), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.032);

    const spring = ctx.createOscillator();
    const sGain = ctx.createGain();
    spring.type = 'triangle';
    const basePitch =
      kind === 'enter'
        ? 680
        : kind === 'space'
          ? 520
          : kind === 'backspace'
            ? 610
            : kind === 'nav'
              ? 940
              : 880;
    spring.frequency.setValueAtTime(basePitch * jitter, now);
    spring.frequency.exponentialRampToValueAtTime(basePitch * 0.45, now + 0.032);

    sGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.085 : 0.11), now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    spring.connect(sGain);
    sGain.connect(ctx.destination);
    spring.start(now);
    spring.stop(now + 0.044);
    return;
  }

  if (sound === 'marimba') {
    // Warm pentatonic wooden bar mallet strike
    const notes = [392.0, 440.0, 493.88, 587.33, 659.25];
    const pitch =
      kind === 'enter'
        ? 523.25
        : kind === 'space'
          ? 293.66
          : kind === 'backspace'
            ? 246.94
            : notes[marimbaStep++ % notes.length];

    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(pitch, now);

    bGain.gain.setValueAtTime(0.001, now);
    bGain.gain.linearRampToValueAtTime(scaleGain(kind === 'nav' ? 0.11 : 0.15), now + 0.004);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    body.connect(bGain);
    bGain.connect(ctx.destination);
    body.start(now);
    body.stop(now + 0.15);

    const overtone = ctx.createOscillator();
    const oGain = ctx.createGain();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(pitch * 4, now);
    oGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.035 : 0.045), now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    overtone.connect(oGain);
    oGain.connect(ctx.destination);
    overtone.start(now);
    overtone.stop(now + 0.03);
    return;
  }

  if (sound === 'typewriter') {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(
      (kind === 'space' ? 1850 : kind === 'nav' ? 3500 : 3200) * jitter,
      now,
    );
    hp.Q.setValueAtTime(2.2, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.13 : 0.18), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.035);

    if (kind === 'enter') {
      const bell = ctx.createOscillator();
      const bGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(1960, now);
      bGain.gain.setValueAtTime(scaleGain(0.075), now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      bell.connect(bGain);
      bGain.connect(ctx.destination);
      bell.start(now);
      bell.stop(now + 0.21);
    } else {
      const click = ctx.createOscillator();
      const cGain = ctx.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime((kind === 'nav' ? 1240 : 1120) * jitter, now);
      click.frequency.exponentialRampToValueAtTime(260, now + 0.016);
      cGain.gain.setValueAtTime(scaleGain(kind === 'nav' ? 0.03 : 0.04), now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
      click.connect(cGain);
      cGain.connect(ctx.destination);
      click.start(now);
      click.stop(now + 0.022);
    }
    return;
  }

  if (sound === 'droplet') {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
    const pitch =
      kind === 'enter'
        ? 440.0
        : kind === 'space'
          ? 392.0
          : kind === 'backspace'
            ? 329.63
            : scale[Math.floor(Math.random() * scale.length)];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch * 0.96, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.04, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(scaleGain(kind === 'nav' ? 0.07 : 0.095), now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
    return;
  }

  if (sound === '8bit') {
    const spec = getEightBitOscillatorSpec(kind, eightBitStep);
    if (kind === 'char' || kind === 'nav') {
      eightBitStep += 1;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.waveform;

    if (kind === 'enter') {
      osc.frequency.setValueAtTime(spec.startFreq, now);
      osc.frequency.setValueAtTime(spec.endFreq, now + 0.036);
      gain.gain.setValueAtTime(scaleGain(0.075), now);
      gain.gain.setValueAtTime(scaleGain(0.075), now + 0.068);
      gain.gain.exponentialRampToValueAtTime(0.001, now + spec.durationSec);
    } else if (kind === 'backspace') {
      osc.frequency.setValueAtTime(spec.startFreq, now);
      osc.frequency.setValueAtTime(spec.endFreq, now + 0.018);
      gain.gain.setValueAtTime(scaleGain(0.065), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + spec.durationSec);
    } else if (kind === 'space') {
      osc.frequency.setValueAtTime(spec.startFreq, now);
      osc.frequency.setValueAtTime(spec.endFreq, now + 0.014);
      gain.gain.setValueAtTime(scaleGain(0.065), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + spec.durationSec);
    } else if (kind === 'nav') {
      osc.frequency.setValueAtTime(spec.startFreq, now);
      osc.frequency.setValueAtTime(spec.endFreq, now + 0.01);
      gain.gain.setValueAtTime(scaleGain(0.048), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + spec.durationSec);
    } else {
      osc.frequency.setValueAtTime(spec.startFreq, now);
      osc.frequency.setValueAtTime(spec.endFreq, now + 0.012);
      gain.gain.setValueAtTime(scaleGain(0.06), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + spec.durationSec);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + spec.durationSec + 0.006);
  }
}
