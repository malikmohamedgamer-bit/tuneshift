/** PCM WAV encoder (16-bit with TPDF dither, or 24-bit). Pure — runs in workers and tests. */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
  bitDepth: 16 | 24 = 16,
  seed = 1,
): ArrayBuffer {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);

  // xorshift32 for dither noise (deterministic).
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = (channels[c] as Float32Array)[i] as number;
      if (bitDepth === 16) {
        const dither = (rnd() - rnd()) / 32768;
        const y = Math.max(-1, Math.min(1, x + dither));
        v.setInt16(o, Math.round(y < 0 ? y * 32768 : y * 32767), true);
        o += 2;
      } else {
        const y = Math.max(-1, Math.min(1, x));
        const n = Math.round(y < 0 ? y * 8388608 : y * 8388607);
        v.setUint8(o, n & 0xff);
        v.setUint8(o + 1, (n >> 8) & 0xff);
        v.setUint8(o + 2, (n >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return buf;
}

/** Minimal WAV reader (PCM 16/24/32-bit int, 32-bit float) — used by tests and fixtures. */
export function decodeWav(buf: ArrayBuffer): { sampleRate: number; channels: Float32Array[] } {
  const v = new DataView(buf);
  const tag = (o: number) =>
    String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12;
  let fmt = { format: 1, channels: 1, sampleRate: 44100, bits: 16 };
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: v.getUint16(o + 8, true),
        channels: v.getUint16(o + 10, true),
        sampleRate: v.getUint32(o + 12, true),
        bits: v.getUint16(o + 22, true),
      };
    } else if (id === 'data') {
      const bps = fmt.bits / 8;
      const frames = Math.floor(size / (bps * fmt.channels));
      const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.channels; c++) {
          let x: number;
          if (fmt.format === 3) x = v.getFloat32(p, true);
          else if (fmt.bits === 16) x = v.getInt16(p, true) / 32768;
          else if (fmt.bits === 24) {
            let n = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16);
            if (n & 0x800000) n -= 0x1000000;
            x = n / 8388608;
          } else x = v.getInt32(p, true) / 2147483648;
          (channels[c] as Float32Array)[i] = x;
          p += bps;
        }
      }
      return { sampleRate: fmt.sampleRate, channels };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}
