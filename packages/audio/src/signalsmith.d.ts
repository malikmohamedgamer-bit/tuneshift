// Types for signalsmith-stretch 1.3.2 (the package ships JS only). Shapes taken from its README
// and SignalsmithStretch.mjs (verified at install time).
declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  export interface StretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(change: StretchSchedule): Promise<unknown>;
    start(when?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    latency(): Promise<number>;
    configure(config: {
      blockMs?: number | null;
      intervalMs?: number;
      splitComputation?: boolean;
      preset?: 'default' | 'cheaper';
    }): Promise<unknown>;
    setUpdateInterval(seconds: number, callback?: (t: number) => void): Promise<unknown>;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<unknown>;
  }
  const SignalsmithStretch: {
    (ctx: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
    /** Optional URL of SignalsmithStretch.mjs itself, used instead of a generated blob: URL. */
    moduleUrl?: string;
  };
  export default SignalsmithStretch;
}
