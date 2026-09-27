import type { Environment } from './local-preferences';
/** Local synthesized rain, water, and bird calls; no streamed audio or assets. */
export class Ambience {
  private context?: AudioContext;
  private gain?: GainNode;
  private filter?: BiquadFilterNode;
  private timer?: ReturnType<typeof setInterval>;
  private environment: Environment = 'garden';
  private enabled = false;
  private volume = 0.3;
  constructor() {
    document.addEventListener('visibilitychange', this.visibility);
    document.addEventListener('pointerdown', this.unlock);
    document.addEventListener('keydown', this.unlock);
  }
  configure(enabled: boolean, environment: Environment, volume: number) {
    this.enabled = enabled;
    this.environment = environment;
    this.volume = volume;
    if (enabled) this.start();
    this.update();
  }
  private unlock = () => {
    if (!this.enabled) return;
    this.start();
    void this.context?.resume();
  };
  private visibility = () => this.update();
  private start() {
    if (this.context) return;
    this.context = new AudioContext();
    const c = this.context;
    this.gain = c.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(c.destination);
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < data.length; i++) {
      prev = (prev + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = prev * 3;
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    source.connect(this.filter).connect(this.gain);
    source.start();
    this.timer = setInterval(() => this.chirp(), 4200);
    this.update();
  }
  private update() {
    if (!this.context) return;
    this.gain!.gain.setTargetAtTime(
      this.enabled && !document.hidden ? this.volume * 0.18 : 0,
      this.context.currentTime,
      0.3,
    );
    this.filter!.frequency.setTargetAtTime(
      this.environment === 'rain' ? 1600 : this.environment === 'pond' ? 650 : 350,
      this.context.currentTime,
      0.3,
    );
  }
  private chirp() {
    if (!this.enabled || document.hidden || !this.context || this.environment === 'rain') return;
    const c = this.context;
    for (let i = 0; i < 2; i++) {
      const osc = c.createOscillator(),
        g = c.createGain(),
        at = c.currentTime + i * 0.16;
      osc.frequency.setValueAtTime(this.environment === 'garden' ? 2100 : 700, at);
      osc.frequency.exponentialRampToValueAtTime(
        this.environment === 'garden' ? 3200 : 250,
        at + 0.12,
      );
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.16, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      osc.connect(g).connect(this.gain!);
      osc.start(at);
      osc.stop(at + 0.2);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    }
  }
}
