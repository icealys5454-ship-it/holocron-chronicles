// Thin typed wrapper around the HOLOCRON SNES WASM core ABI (v1).

export interface Framebuffer {
  width: number;
  height: number;
  stride: number;
  format: number;
  pixels: Uint8Array;
}

type CoreExports = Record<string, any>;

export class HolocronCore {
  private e: CoreExports = {};
  private memory!: WebAssembly.Memory;

  async open(url: string): Promise<HolocronCore> {
    const bytes = await (await fetch(url)).arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, {});
    this.e = result.instance.exports as CoreExports;
    this.memory = this.e["memory"] as WebAssembly.Memory;
    if (!this.memory) throw new Error("ABI violation: memory export missing.");
    const version = this.version();
    if (version.major !== 1) throw new Error(`Unsupported ABI major ${version.major}.`);
    return this;
  }

  version() {
    return {
      major: this.e["abi_version_major"]() as number,
      minor: this.e["abi_version_minor"]() as number,
      patch: this.e["abi_version_patch"]() as number,
    };
  }

  reset() {
    this.e["reset"]();
  }

  loadRom(bytes: Uint8Array) {
    const cap = this.e["rom_upload_capacity"]() as number;
    if (!bytes?.byteLength) throw new Error("ROM is empty.");
    if (bytes.byteLength > cap)
      throw new Error(`ROM exceeds ${cap} byte upload capacity.`);
    new Uint8Array(this.memory.buffer, this.e["rom_upload_ptr"](), bytes.byteLength).set(bytes);
    const rc = this.e["load_rom_from_upload"](bytes.byteLength) as number;
    if (rc !== 0) throw new Error(`ROM load failed with status ${rc}.`);
  }

  runFrame() {
    const rc = this.e["run_frame"]() as number;
    if (rc !== 0) throw new Error(`Frame failed with status ${rc}.`);
  }

  setController1(mask: number) {
    this.e["set_controller1"](mask & 0xffff);
  }

  framebuffer(): Framebuffer {
    const width = this.e["framebuffer_width"]() as number;
    const height = this.e["framebuffer_height"]() as number;
    return {
      width,
      height,
      stride: this.e["framebuffer_stride"]() as number,
      format: this.e["framebuffer_format"]() as number,
      pixels: new Uint8Array(this.memory.buffer, this.e["framebuffer_ptr"](), width * height * 4),
    };
  }

  saveState(): Uint8Array {
    const n = this.e["save_state"]() as number;
    if (!n) throw new Error("Save state failed.");
    return new Uint8Array(this.memory.buffer, this.e["state_ptr"](), n).slice();
  }

  loadState(bytes: Uint8Array) {
    if (bytes.byteLength > (this.e["state_size"]() as number))
      throw new Error("State exceeds core buffer.");
    new Uint8Array(this.memory.buffer, this.e["state_ptr"](), bytes.byteLength).set(bytes);
    const rc = this.e["load_state"]() as number;
    if (rc !== 0) throw new Error(`Load state failed with status ${rc}.`);
  }
}
