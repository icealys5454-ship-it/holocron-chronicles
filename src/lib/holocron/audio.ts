// Streams interleaved 16-bit PCM from the core into WebAudio.

export interface AudioChunk {
  frames: number;
  channels: number;
  sampleRate: number;
  samples: Int16Array;
}

export class AudioOutput {
  private ctx: AudioContext | null = null;
  private nextTime = 0;

  resume() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    void this.ctx.resume();
  }

  push(chunk: AudioChunk) {
    const ctx = this.ctx;
    if (!ctx || !chunk.frames || !chunk.channels) return;
    const buffer = ctx.createBuffer(chunk.channels, chunk.frames, chunk.sampleRate || 32000);
    for (let ch = 0; ch < chunk.channels; ch++) {
      const out = buffer.getChannelData(ch);
      for (let i = 0; i < chunk.frames; i++) {
        out[i] = (chunk.samples[i * chunk.channels + ch] ?? 0) / 32768;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
    this.nextTime = 0;
  }
}
