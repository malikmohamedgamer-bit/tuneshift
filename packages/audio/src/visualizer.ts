export type VisualizerMode = 'bars' | 'wave' | 'radial' | 'glow';

export const VISUALIZER_MODES: { id: VisualizerMode; label: string }[] = [
  { id: 'bars', label: 'Spectrum bars' },
  { id: 'wave', label: 'Waveform' },
  { id: 'radial', label: 'Radial' },
  { id: 'glow', label: 'Ambient glow' },
];

export interface VisualizerOptions {
  getAnalyser: () => AnalyserNode | null;
  mode: VisualizerMode;
  /** Colours read each frame (theme can change live). */
  colors: () => [string, string];
  /** Element whose `--ambient` (0..1) follows the bass in glow mode. */
  glowTarget?: HTMLElement | null;
  reducedMotion?: () => boolean;
}

/**
 * Canvas visualizer (spec §4.7). 60 fps while visible; pauses when the tab is hidden or the
 * canvas is off-screen; with reduced motion it renders at ~6 fps with heavy smoothing.
 */
export class Visualizer {
  private raf = 0;
  private visible = true;
  private onScreen = true;
  private freq = new Uint8Array(0);
  private time = new Uint8Array(0);
  private lastFrame = 0;
  private smoothBass = 0;
  private readonly io: IntersectionObserver | null;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private opts: VisualizerOptions,
  ) {
    this.io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            this.onScreen = entries.some((e) => e.isIntersecting);
            this.kick();
          })
        : null;
    this.io?.observe(canvas);
    document.addEventListener('visibilitychange', this.onVis);
  }

  private onVis = () => {
    this.visible = document.visibilityState === 'visible';
    this.kick();
  };

  setMode(mode: VisualizerMode): void {
    this.opts = { ...this.opts, mode };
  }

  start(): void {
    this.running = true;
    this.kick();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.opts.glowTarget?.style.setProperty('--ambient', '0');
  }

  private kick(): void {
    if (this.running && this.visible && this.onScreen && !this.raf) {
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (t: number) => {
    this.raf = 0;
    if (!this.running || !this.visible || !this.onScreen) return;
    const reduced = this.opts.reducedMotion?.() ?? false;
    if (!reduced || t - this.lastFrame > 160) {
      this.lastFrame = t;
      this.draw(reduced);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(reduced: boolean): void {
    const an = this.opts.getAnalyser();
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!an) return;
    if (this.freq.length !== an.frequencyBinCount) {
      this.freq = new Uint8Array(an.frequencyBinCount);
      this.time = new Uint8Array(an.fftSize);
    }
    an.getByteFrequencyData(this.freq);
    const [c1, c2] = this.opts.colors();
    const grad = g.createLinearGradient(0, h, w, 0);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    const bassBins = Math.max(
      2,
      Math.floor((150 / (an.context.sampleRate / 2)) * this.freq.length),
    );
    let bass = 0;
    for (let i = 0; i < bassBins; i++) bass += this.freq[i] as number;
    bass = bass / bassBins / 255;
    this.smoothBass += (bass - this.smoothBass) * (reduced ? 0.05 : 0.25);

    switch (this.opts.mode) {
      case 'bars': {
        const bars = Math.min(64, Math.floor(w / (6 * dpr)));
        const gap = 2 * dpr;
        const bw = w / bars - gap;
        g.fillStyle = grad;
        for (let i = 0; i < bars; i++) {
          // Log-spaced bins so bass doesn't take half the bars.
          const lo = Math.floor(Math.pow(this.freq.length, i / bars));
          const hi = Math.max(lo + 1, Math.floor(Math.pow(this.freq.length, (i + 1) / bars)));
          let v = 0;
          for (let k = lo; k < hi; k++) v = Math.max(v, this.freq[k] as number);
          const bh = Math.max(2 * dpr, (v / 255) * h);
          const x = i * (bw + gap);
          g.beginPath();
          g.roundRect(x, h - bh, bw, bh, Math.min(bw / 2, 4 * dpr));
          g.fill();
        }
        break;
      }
      case 'wave': {
        an.getByteTimeDomainData(this.time);
        g.lineWidth = 2.5 * dpr;
        g.strokeStyle = grad;
        g.beginPath();
        for (let i = 0; i < this.time.length; i++) {
          const x = (i / (this.time.length - 1)) * w;
          const y = ((this.time[i] as number) / 255) * h;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        break;
      }
      case 'radial': {
        const cx = w / 2;
        const cy = h / 2;
        const r0 = Math.min(w, h) * (0.28 + this.smoothBass * 0.06);
        const n = 96;
        g.strokeStyle = grad;
        g.lineWidth = Math.max(1.5 * dpr, (Math.PI * 2 * r0) / n / 2.2);
        g.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const k = Math.floor(Math.pow(this.freq.length * 0.7, (i % (n / 2)) / (n / 2)));
          const v = (this.freq[k] as number) / 255;
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const len = r0 * 0.08 + v * Math.min(w, h) * 0.18;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
          g.stroke();
        }
        break;
      }
      case 'glow':
        break;
    }
    this.opts.glowTarget?.style.setProperty('--ambient', this.smoothBass.toFixed(3));
  }

  dispose(): void {
    this.stop();
    this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
