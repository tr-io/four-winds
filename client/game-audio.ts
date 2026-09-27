export type SoundCue = 'tick' | 'draw' | 'discard' | 'claim' | 'win' | 'bonus';

// Synthesized locally: a dry tile click, taiko-like call impact, and a rising victory chord.
export class GameAudio {
  private context: AudioContext | undefined;
  private noise: AudioBuffer | undefined;
  private master: GainNode | undefined;
  private volume = 0.65;
  private enabled = false;
  configure(enabled: boolean, volume = this.volume) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master)
      this.master.gain.setTargetAtTime(
        enabled ? this.volume * 0.3 : 0,
        this.context!.currentTime,
        0.015,
      );
  }
  play(cue: SoundCue) {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    const c = this.context;
    void c.resume();
    if (!this.master) {
      this.master = c.createGain();
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(c.destination);
      this.master.gain.value = this.volume * 0.3;
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const at = c.currentTime;
    const note = (
      hz: number,
      delay: number,
      duration: number,
      gain: number,
      end = hz,
      type: OscillatorType = 'sine',
    ) => {
      const osc = c.createOscillator(),
        envelope = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(hz, at + delay);
      osc.frequency.exponentialRampToValueAtTime(end, at + delay + duration);
      envelope.gain.setValueAtTime(0, at + delay);
      envelope.gain.linearRampToValueAtTime(gain, at + delay + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + delay + duration);
      osc.connect(envelope).connect(this.master!);
      osc.start(at + delay);
      osc.stop(at + delay + duration + 0.03);
      osc.onended = () => {
        osc.disconnect();
        envelope.disconnect();
      };
    };
    const rush = (duration: number, frequency: number, gain: number, delay = 0) => {
      const src = c.createBufferSource(),
        filter = c.createBiquadFilter(),
        envelope = c.createGain();
      src.buffer = this.noise!;
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(frequency, at + delay);
      filter.frequency.exponentialRampToValueAtTime(180, at + delay + duration);
      envelope.gain.setValueAtTime(0, at + delay);
      envelope.gain.linearRampToValueAtTime(gain, at + delay + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + delay + duration);
      src.connect(filter).connect(envelope).connect(this.master!);
      src.start(at + delay);
      src.stop(at + delay + duration);
      src.onended = () => {
        src.disconnect();
        filter.disconnect();
        envelope.disconnect();
      };
    };
    if (cue === 'win') {
      rush(0.7, 2800, 0.7);
      note(150, 0, 0.6, 1, 42);
      [293.66, 440, 587.33, 739.99, 880, 1174.66].forEach((hz, i) => {
        note(hz, 0.12 + i * 0.095, 1.15, 0.32, hz, 'triangle');
        note(hz * 2.003, 0.12 + i * 0.095, 0.7, 0.09);
      });
    } else if (cue === 'claim') {
      rush(0.3, 3400, 0.6);
      note(190, 0.04, 0.4, 0.95, 48);
      [293.66, 440, 587.33].forEach((hz, i) =>
        note(hz, 0.08 + i * 0.045, 0.35, 0.23, hz, 'triangle'),
      );
    } else if (cue === 'bonus') {
      [880, 1174.66, 1760].forEach((hz, i) => note(hz, i * 0.06, 0.35, 0.22));
    } else {
      const discard = cue === 'discard';
      rush(0.05, 2600, discard ? 0.5 : 0.22);
      note(discard ? 1100 : 780, 0, 0.075, 0.35, discard ? 500 : 560);
      note(230, 0.012, 0.09, 0.22, 110);
    }
  }
}
