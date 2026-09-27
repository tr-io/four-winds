import { DEAL, dealSequence, type DealSequence } from './deal-sequence';
export type SoundCue = 'tick' | 'draw' | 'discard' | 'claim' | 'win' | 'bonus' | 'start';

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
  play(cue: SoundCue, sequence: DealSequence = dealSequence()) {
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
    if (cue === 'start') {
      // Shuffle chatter, recorded dice throws, then the actual number of dealing packets.
      for (let i = 0; i < 22; i++) {
        const delay = (i * DEAL.intro) / 22 / 1000;
        rush(0.038, 1900 + ((i * 173) % 1700), 0.24, delay);
        note(820 + ((i * 137) % 660), delay, 0.045, 0.17, 420);
      }
      for (let roll = 0; roll < sequence.rolls; roll++)
        for (let bounce = 0; bounce < 3; bounce++) {
          const delay = (DEAL.intro + roll * DEAL.roll + bounce * 140) / 1000;
          rush(0.04, 2400, 0.18, delay);
          note(950, delay, 0.04, 0.12, 600);
        }
      rush(0.22, 1600, 0.32, sequence.assembleAt / 1000);
      note(125, sequence.assembleAt / 1000, 0.24, 0.5, 60);
      for (let packet = 0; packet < sequence.packets; packet++) {
        const delay = (sequence.tilesAt + packet * DEAL.packet) / 1000;
        for (let tile = 0; tile < 3; tile++) {
          const landing = delay + DEAL.flight / 1000 + tile * 0.014;
          rush(0.025, 3000, 0.12, landing);
          note(1100 + (packet % 4) * 160, landing, 0.045, 0.2, 680);
        }
      }
      note(587.33, (sequence.duration - 300) / 1000, 0.25, 0.15, 587.33, 'triangle');
      note(880, (sequence.duration - 250) / 1000, 0.25, 0.12);
    } else if (cue === 'win') {
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
