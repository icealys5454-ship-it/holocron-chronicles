import { useCallback, useEffect, useRef, useState } from "react";

import { AudioOutput } from "@/lib/holocron/audio";
import { HolocronCore } from "@/lib/holocron/core";
import { KeyboardInput, pollGamepadMask, type SnesButton } from "@/lib/holocron/input";
import { StateStore, type StateRecord } from "@/lib/holocron/storage";
import { WebGLPresenter } from "@/lib/holocron/webgl";

type Status = "idle" | "booting" | "ready" | "running" | "paused" | "error";

const TOUCH_BUTTONS: { label: string; button: SnesButton }[] = [
  { label: "B", button: "B" },
  { label: "A", button: "A" },
  { label: "Y", button: "Y" },
  { label: "X", button: "X" },
];

const SLOTS = ["1", "2", "3"];

export function HolocronEmulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<HolocronCore | null>(null);
  const presenterRef = useRef<WebGLPresenter | null>(null);
  const keyboardRef = useRef<KeyboardInput | null>(null);
  const audioRef = useRef<AudioOutput | null>(null);
  const storeRef = useRef<StateStore | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const romRef = useRef<Uint8Array | null>(null);
  const stateRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [abi, setAbi] = useState<string | null>(null);
  const [romName, setRomName] = useState<string | null>(null);
  const [slots, setSlots] = useState<StateRecord[]>([]);
  const [log, setLog] = useState<string>("Boot the core, then load a ROM you legally own.");

  const refreshSlots = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    setSlots(await store.list());
  }, []);

  useEffect(() => {
    const kb = new KeyboardInput().attach();
    keyboardRef.current = kb;
    audioRef.current = new AudioOutput();
    void new StateStore()
      .open()
      .then(async (store) => {
        storeRef.current = store;
        setSlots(await store.list());
      })
      .catch(() => undefined);
    return () => {
      kb.detach();
      audioRef.current?.close();
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const frameLoop = useCallback(() => {
    if (!runningRef.current) return;
    const core = coreRef.current;
    const presenter = presenterRef.current;
    if (core && presenter && !pausedRef.current) {
      try {
        const mask = (keyboardRef.current?.mask() ?? 0) | pollGamepadMask();
        core.setController1(mask);
        core.runFrame();
        presenter.present(core.framebuffer());
        const audio = core.pullAudio();
        if (audio.frames) audioRef.current?.push(audio);
      } catch (err) {
        runningRef.current = false;
        setStatus("error");
        setLog(String(err));
        return;
      }
    }
    rafRef.current = requestAnimationFrame(frameLoop);
  }, []);


  const boot = useCallback(async () => {
    setStatus("booting");
    setLog("Loading core…");
    try {
      const core = await new HolocronCore().open("/core/holocron-snes-core.wasm");
      coreRef.current = core;
      if (!canvasRef.current) throw new Error("Canvas unavailable.");
      presenterRef.current = new WebGLPresenter(canvasRef.current);
      const v = core.version();
      setAbi(`${v.major}.${v.minor}.${v.patch}`);
      setStatus("ready");
      setLog("Core online. Select a ROM and press Run.");
    } catch (err) {
      setStatus("error");
      setLog(String(err));
    }
  }, []);

  const onRom = useCallback(async (file: File | undefined) => {
    if (!file) {
      romRef.current = null;
      setRomName(null);
      return;
    }
    romRef.current = new Uint8Array(await file.arrayBuffer());
    setRomName(file.name);
    setLog(`ROM selected: ${file.name} (${romRef.current.length} bytes)`);
  }, []);

  const run = useCallback(() => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      if (!romRef.current) throw new Error("Select a homebrew or user-owned ROM first.");
      core.reset();
      core.loadRom(romRef.current);
      audioRef.current?.resume();
      pausedRef.current = false;
      if (!runningRef.current) {
        runningRef.current = true;
        frameLoop();
      }
      setStatus("running");
      setLog("Running.");
    } catch (err) {
      setStatus("error");
      setLog(String(err));
    }
  }, [frameLoop]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    pausedRef.current = !pausedRef.current;
    setStatus(pausedRef.current ? "paused" : "running");
  }, []);

  const saveState = useCallback(() => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      stateRef.current = core.saveState();
      setLog(`Saved state (${stateRef.current.length} bytes).`);
    } catch (err) {
      setLog(String(err));
    }
  }, []);

  const loadState = useCallback(() => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      if (!stateRef.current) throw new Error("No state saved yet.");
      core.loadState(stateRef.current);
      setLog("State restored.");
    } catch (err) {
      setLog(String(err));
    }
  }, []);

  const saveSlot = useCallback(
    async (slot: string) => {
      try {
        const core = coreRef.current;
        const store = storeRef.current;
        if (!core) throw new Error("Boot the core first.");
        if (!store) throw new Error("Persistent storage unavailable.");
        const bytes = core.saveState();
        await store.put({
          id: `slot-${slot}`,
          romName: romName ?? "unknown",
          createdAt: Date.now(),
          bytes,
        });
        await refreshSlots();
        setLog(`Slot ${slot} saved (${bytes.length} bytes).`);
      } catch (err) {
        setLog(String(err));
      }
    },
    [refreshSlots, romName],
  );

  const loadSlot = useCallback(async (slot: string) => {
    try {
      const core = coreRef.current;
      const store = storeRef.current;
      if (!core) throw new Error("Boot the core first.");
      if (!store) throw new Error("Persistent storage unavailable.");
      const record = await store.get(`slot-${slot}`);
      if (!record) throw new Error(`Slot ${slot} is empty.`);
      core.loadState(new Uint8Array(record.bytes));
      setLog(`Slot ${slot} restored (${record.romName}).`);
    } catch (err) {
      setLog(String(err));
    }
  }, []);


  const btnBase =
    "rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-xl border border-border bg-card p-4">
        <canvas
          ref={canvasRef}
          width={256}
          height={224}
          className="block w-full max-w-3xl rounded-lg bg-black"
          style={{ aspectRatio: "8 / 7", imageRendering: "pixelated" }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={boot} className={btnBase} disabled={status === "booting"}>
            {coreRef.current ? "Reboot core" : "Boot core"}
          </button>
          <label className={btnBase + " cursor-pointer"}>
            {romName ?? "Choose ROM"}
            <input
              type="file"
              accept=".sfc,.smc,.bin"
              className="hidden"
              onChange={(e) => void onRom(e.target.files?.[0])}
            />
          </label>
          <button onClick={run} className={btnBase}>
            Run
          </button>
          <button onClick={pause} className={btnBase}>
            {status === "paused" ? "Resume" : "Pause"}
          </button>
          <button onClick={saveState} className={btnBase}>
            Save state
          </button>
          <button onClick={loadState} className={btnBase}>
            Load state
          </button>
        </div>

        <div className="mt-4 flex gap-2 lg:hidden">
          {TOUCH_BUTTONS.map(({ label, button }) => (
            <button
              key={label}
              className={btnBase + " h-12 w-12"}
              onPointerDown={() => keyboardRef.current?.press(button)}
              onPointerUp={() => keyboardRef.current?.release(button)}
              onPointerLeave={() => keyboardRef.current?.release(button)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-card-foreground">
          {status.toUpperCase()}
          {abi ? <span className="ml-2 text-sm text-muted-foreground">ABI {abi}</span> : null}
        </h2>
        <pre className="mt-3 min-h-40 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {log}
        </pre>
        <h3 className="mt-4 text-sm font-semibold text-card-foreground">Keyboard</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Arrows / WASD — D-pad</li>
          <li>Z / X — B / A · C / V — Y / X</li>
          <li>Q / E — L / R · Enter — Start · Shift — Select</li>
          <li>Gamepads are polled automatically.</li>
        </ul>
      </section>
    </div>
  );
}
