import { Nostalgist } from "nostalgist";

/**
 * HolocronCore — thin wrapper around a proven libretro SNES core (snes9x),
 * self-hosted from /core/. Renders video and streams audio itself onto the
 * canvas it is given, so no external presenter/audio pump is required.
 */
export class HolocronCore {
  private instance: Nostalgist | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private romName = "rom.sfc";

  /** Prepares the core; the canvas is bound at launch time. */
  async open(canvas: HTMLCanvasElement): Promise<HolocronCore> {
    this.canvas = canvas;
    // Fail fast if the core assets are missing.
    const res = await fetch("/core/snes9x_libretro.js", { method: "HEAD" });
    if (!res.ok) throw new Error("SNES core assets missing at /core/.");
    return this;
  }

  version() {
    return { major: 1, minor: 22, patch: 2, name: "snes9x (libretro)" };
  }

  get ready() {
    return this.instance !== null;
  }

  /** Boots (or reboots) the emulator with the given ROM bytes. */
  async loadRom(
    bytes: Uint8Array,
    fileName = "rom.sfc",
    retroarchConfig: Record<string, string> = {},
  ): Promise<void> {
    if (!this.canvas) throw new Error("Core not opened.");
    this.romName = fileName;
    await this.shutdown();
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    this.instance = await Nostalgist.launch({
      core: "snes9x",
      element: this.canvas,
      rom: { fileName, fileContent: new Blob([buffer], { type: "application/octet-stream" }) },
      retroarchConfig,
      resolveCoreJs: () => "/core/snes9x_libretro.js",
      resolveCoreWasm: () => "/core/snes9x_libretro.wasm",
    });
  }


  get currentRomName() {
    return this.romName;
  }

  async reset(): Promise<void> {
    await this.instance?.restart();
  }

  pause() {
    this.instance?.pause();
  }

  resume() {
    this.instance?.resume();
  }

  async saveState(): Promise<Uint8Array> {
    if (!this.instance) throw new Error("Load a ROM first.");
    const { state } = await this.instance.saveState();
    return new Uint8Array(await state.arrayBuffer());
  }

  async loadState(bytes: Uint8Array): Promise<void> {
    if (!this.instance) throw new Error("Load a ROM first.");
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    await this.instance.loadState(new Blob([buffer]));
  }

  async shutdown(): Promise<void> {
    try {
      this.instance?.exit();
    } catch {
      /* ignore */
    }
    this.instance = null;
  }
}
