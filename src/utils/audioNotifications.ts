import { DailyAlertConfig } from '../types';

export type AlertSoundType = 'license' | 'debt' | 'briefing' | 'test';

/**
 * Pure helper determining whether audio notifications are currently unmuted.
 */
export function shouldPlayAlertSound(config?: Pick<DailyAlertConfig, 'notifySound'> | null): boolean {
  if (!config) return true;
  return config.notifySound !== false;
}

/**
 * Plays a gentle, non-intrusive two-tone Web Audio API chime when alerts appear.
 * Respects mute state and gracefully no-ops in headless or restricted environments.
 */
export function playGentleAlertChime(options?: {
  muted?: boolean;
  type?: AlertSoundType;
}): boolean {
  if (options?.muted) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return false;
    }

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const isDebt = options?.type === 'debt';
    const notes = isDebt ? [523.25, 659.25] : [587.33, 880]; // Soft C5->E5 or D5->A5

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const startTime = now + idx * 0.14;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.11, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });

    setTimeout(() => {
      try {
        ctx.close?.().catch(() => {});
      } catch {}
    }, 1100);

    return true;
  } catch {
    return false;
  }
}
