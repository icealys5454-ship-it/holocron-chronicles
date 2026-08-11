import { useCallback, useEffect, useRef, useState } from "react";

import { ControllerDiagnostics } from "@/components/ControllerDiagnostics";
import { ControllerSettings } from "@/components/ControllerSettings";
import { HolocronCore } from "@/lib/holocron/core";
import {
  BUTTON_LABELS,
  SNES_BUTTONS,
  keyLabel,
  loadConfig,
  saveConfig,
  toRetroarchConfig,
  type ControllerConfig,
  DEFAULT_CONFIG,
} from "@/lib/holocron/keymap";
import { usePadKeyboardBridge } from "@/lib/holocron/padBridge";
import { StateStore, type StateRecord } from "@/lib/holocron/storage";

type Status = "idle" | "booting" | "ready" | "running" | "paused" | "error";

const SLOTS = ["1", "2", "3"];

export function HolocronEmulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [displayOff, setDisplayOff] = useState(false);
  const coreRef = useRef<HolocronCore | null>(null);
  const storeRef = useRef<StateStore | null>(null);
  const pausedRef = useRef(false);
  const romRef = useRef<Uint8Array | null>(null);
  const stateRef = useRef<Uint8Array | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [abi, setAbi] = useState<string | null>(null);
  const [romName, setRomName] = useState<string | null>(null);
  const [slots, setSlots] = useState<StateRecord[]>([]);
  const [config, setConfig] = useState<ControllerConfig>(DEFAULT_CONFIG);
  const [log, setLog] = useState<string>("Boot the core, then load a ROM you legally own.");

  useEffect(() => setConfig(loadConfig()), []);

  const updateConfig = useCallback((next: ControllerConfig) => {
    setConfig(next);
    saveConfig(next);
  }, []);

  usePadKeyboardBridge(config, status === "running", canvasRef);


  const refreshSlots = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    setSlots(await store.list());
  }, []);

  useEffect(() => {
    void new StateStore()
      .open()
      .then(async (store) => {
        storeRef.current = store;
        setSlots(await store.list());
      })
      .catch(() => undefined);
    return () => {
      void coreRef.current?.shutdown();
    };
  }, []);

  const boot = useCallback(async () => {
    setStatus("booting");
    setLog("Loading core…");
    try {
      if (!canvasRef.current) throw new Error("Canvas unavailable.");
      await coreRef.current?.shutdown();
      const core = await new HolocronCore().open(canvasRef.current);
      coreRef.current = core;
      const v = core.version();
      setAbi(`${v.name} ${v.major}.${v.minor}.${v.patch}`);
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

  const run = useCallback(async () => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      if (!romRef.current) throw new Error("Select a homebrew or user-owned ROM first.");
      setLog("Starting emulation…");
      await core.loadRom(romRef.current, romName ?? "rom.sfc", toRetroarchConfig(config.keys));
      pausedRef.current = false;
      setStatus("running");
      setLog("Running. Click the screen so keyboard input is captured.");
      canvasRef.current?.focus();
    } catch (err) {
      setStatus("error");
      setLog(String(err));
    }
  }, [romName, config.keys]);


  const pause = useCallback(() => {
    const core = coreRef.current;
    if (!core?.ready) return;
    pausedRef.current = !pausedRef.current;
    if (pausedRef.current) core.pause();
    else core.resume();
    setStatus(pausedRef.current ? "paused" : "running");
  }, []);

  const togglePower = useCallback(async () => {
    if (!displayOff) {
      // Power off: stop emulation and tear the core down.
      try {
        await coreRef.current?.shutdown();
      } catch {
        /* ignore */
      }
      coreRef.current = null;
      pausedRef.current = false;
      setAbi(null);
      setStatus("idle");
      setDisplayOff(true);
      setLog("Emulator powered off.");
      return;
    }
    // Power on: boot the core again and resume the loaded ROM if there is one.
    setDisplayOff(false);
    await boot();
    if (romRef.current) await run();
  }, [displayOff, boot, run]);


  const saveState = useCallback(async () => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      const bytes = await core.saveState();
      stateRef.current = bytes;
      setLog(`Saved state (${bytes.length} bytes).`);
    } catch (err) {
      setLog(String(err));
    }
  }, []);

  const loadState = useCallback(async () => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      if (!stateRef.current) throw new Error("No state saved yet.");
      await core.loadState(stateRef.current);
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
        const bytes = await core.saveState();
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
      await core.loadState(new Uint8Array(record.bytes));
      setLog(`Slot ${slot} restored (${record.romName}).`);
    } catch (err) {
      setLog(String(err));
    }
  }, []);

  const downloadBytes = useCallback((bytes: Uint8Array, fileName: string) => {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const stateFileName = useCallback(
    (suffix: string) => {
      const base = (romName ?? "state").replace(/\.[^.]+$/, "");
      return `${base}.${suffix}.state`;
    },
    [romName],
  );

  /** Download the live emulator snapshot as a .state file. */
  const downloadState = useCallback(async () => {
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      const bytes = await core.saveState();
      stateRef.current = bytes;
      downloadBytes(bytes, stateFileName(String(Date.now())));
      setLog(`Downloaded snapshot (${bytes.length} bytes).`);
    } catch (err) {
      setLog(String(err));
    }
  }, [downloadBytes, stateFileName]);

  /** Upload a .state file and restore it into the running core. */
  const uploadState = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const core = coreRef.current;
      if (!core) throw new Error("Boot the core first.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      await core.loadState(bytes);
      stateRef.current = bytes;
      setLog(`Restored snapshot from ${file.name} (${bytes.length} bytes).`);
    } catch (err) {
      setLog(String(err));
    }
  }, []);

  /** Download a persistent slot's stored blob. */
  const downloadSlot = useCallback(
    async (slot: string) => {
      try {
        const store = storeRef.current;
        if (!store) throw new Error("Persistent storage unavailable.");
        const record = await store.get(`slot-${slot}`);
        if (!record) throw new Error(`Slot ${slot} is empty.`);
        const bytes = new Uint8Array(record.bytes);
        const base = record.romName.replace(/\.[^.]+$/, "");
        downloadBytes(bytes, `${base}.slot${slot}.state`);
        setLog(`Slot ${slot} downloaded (${bytes.length} bytes).`);
      } catch (err) {
        setLog(String(err));
      }
    },
    [downloadBytes],
  );

  /** Upload a .state file into a persistent slot (stored in IndexedDB). */
  const uploadSlot = useCallback(
    async (slot: string, file: File | undefined) => {
      if (!file) return;
      try {
        const store = storeRef.current;
        if (!store) throw new Error("Persistent storage unavailable.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        await store.put({
          id: `slot-${slot}`,
          romName: romName ?? file.name,
          createdAt: Date.now(),
          bytes,
        });
        await refreshSlots();
        setLog(`Slot ${slot} imported from ${file.name} (${bytes.length} bytes).`);
      } catch (err) {
        setLog(String(err));
      }
    },
    [refreshSlots, romName],
  );

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen().then(() => canvasRef.current?.focus());
  }, []);

  const btnBase =
    "rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40";


  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-xl border border-border bg-card p-4">
        <div
          ref={stageRef}
          className="relative flex h-[min(70dvh,calc(100vw*0.6))] w-full items-center justify-center overflow-hidden rounded-lg bg-black"
        >
          <canvas
            ref={canvasRef}
            width={256}
            height={224}
            tabIndex={0}
            className={
              "h-full w-full object-contain outline-none" + (displayOff ? " invisible" : "")
            }
            style={{ imageRendering: "pixelated" }}
          />
          {displayOff && (
            <span className="pointer-events-none absolute text-xs uppercase tracking-widest text-muted-foreground">
              Emulator off
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void togglePower()}
            className={btnBase}
            disabled={status === "booting"}
            aria-pressed={!displayOff}
          >
            {displayOff ? "Turn emulator on" : "Turn emulator off"}
          </button>

          <button onClick={toggleFullscreen} className={btnBase}>
            Fullscreen
          </button>

          <button onClick={() => void boot()} className={btnBase} disabled={status === "booting"}>
            {coreRef.current ? "Reboot core" : "Boot core"}
          </button>
          <label className={btnBase + " cursor-pointer"}>
            {romName ?? "Choose ROM"}
            <input
              type="file"
              accept=".sfc,.smc,.bin,.zip"
              className="hidden"
              onChange={(e) => void onRom(e.target.files?.[0])}
            />
          </label>
          <button onClick={() => void run()} className={btnBase}>
            Run
          </button>
          <button onClick={pause} className={btnBase}>
            {status === "paused" ? "Resume" : "Pause"}
          </button>
          <button onClick={() => void saveState()} className={btnBase}>
            Save state
          </button>
          <button onClick={() => void loadState()} className={btnBase}>
            Load state
          </button>
          <ControllerSettings config={config} onChange={updateConfig} />
        </div>

      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-card-foreground">
          {status.toUpperCase()}
          {abi ? <span className="ml-2 text-sm text-muted-foreground">{abi}</span> : null}
        </h2>
        <pre className="mt-3 min-h-40 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {log}
        </pre>
        <h3 className="mt-4 text-sm font-semibold text-card-foreground">Persistent slots</h3>
        <div className="mt-2 space-y-2">
          {SLOTS.map((slot) => {
            const record = slots.find((s) => s.id === `slot-${slot}`);
            return (
              <div key={slot} className="flex items-center gap-2">
                <span className="w-14 text-sm text-muted-foreground">Slot {slot}</span>
                <button className={btnBase + " px-3 py-1"} onClick={() => void saveSlot(slot)}>
                  Save
                </button>
                <button
                  className={btnBase + " px-3 py-1"}
                  onClick={() => void loadSlot(slot)}
                  disabled={!record}
                >
                  Load
                </button>
                <span className="truncate text-xs text-muted-foreground">
                  {record
                    ? `${record.romName} · ${new Date(record.createdAt).toLocaleString()}`
                    : "empty"}
                </span>
              </div>
            );
          })}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-card-foreground">Current bindings</h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SNES_BUTTONS.map((button) => (
            <li key={button} className="flex justify-between gap-2">
              <span>{BUTTON_LABELS[button]}</span>
              <span className="text-card-foreground">{keyLabel(config.keys[button])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {config.padEnabled
            ? "Connected gamepads are mapped onto these keys."
            : "Gamepad-to-keyboard mapping is off."}
        </p>


        <ControllerDiagnostics />
      </section>
    </div>
  );
}
