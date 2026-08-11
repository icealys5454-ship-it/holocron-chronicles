import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  BUTTON_LABELS,
  DEFAULT_CONFIG,
  SNES_BUTTONS,
  detectPadInput,
  keyLabel,
  padLabel,
  type ControllerConfig,
  type SnesButton,
} from "@/lib/holocron/keymap";

type Capture = { button: SnesButton; kind: "key" | "pad" } | null;

export function ControllerSettings({
  config,
  onChange,
}: {
  config: ControllerConfig;
  onChange: (config: ControllerConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState<Capture>(null);
  const captureRef = useRef<Capture>(null);
  captureRef.current = capture;

  // Capture a keyboard press for the pending binding.
  useEffect(() => {
    if (!capture || capture.kind !== "key") return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") {
        onChange({ ...config, keys: { ...config.keys, [capture.button]: e.code } });
      }
      setCapture(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capture, config, onChange]);

  // Capture a gamepad press for the pending binding.
  useEffect(() => {
    if (!capture || capture.kind !== "pad") return;
    let frame = 0;
    const tick = () => {
      const pads = (navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[];
      for (const pad of pads) {
        const input = detectPadInput(pad);
        if (input) {
          onChange({ ...config, pad: { ...config.pad, [capture.button]: input } });
          setCapture(null);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [capture, config, onChange]);

  const cell =
    "min-w-24 rounded-md border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Controller settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Controller settings</DialogTitle>
          <DialogDescription>
            Every input reaches the core as a keyboard press. Bind a key per SNES button, then map
            each connected pad&apos;s buttons onto those same keys.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={config.padEnabled}
              onCheckedChange={(v) => onChange({ ...config, padEnabled: v })}
            />
            Map gamepads to keyboard
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={config.analogAsDpad}
              onCheckedChange={(v) => onChange({ ...config, analogAsDpad: v })}
            />
            Left stick acts as D-pad
          </label>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold text-muted-foreground">SNES button</span>
          <span className="text-xs font-semibold text-muted-foreground">Keyboard</span>
          <span className="text-xs font-semibold text-muted-foreground">Controller</span>
          {SNES_BUTTONS.map((button) => (
            <Fragmentish key={button}>
              <span className="text-sm text-card-foreground">{BUTTON_LABELS[button]}</span>
              <button
                className={cell}
                onClick={() => setCapture({ button, kind: "key" })}
                aria-label={`Bind keyboard key for ${BUTTON_LABELS[button]}`}
              >
                {capture?.button === button && capture.kind === "key"
                  ? "Press a key…"
                  : keyLabel(config.keys[button])}
              </button>
              <button
                className={cell}
                onClick={() => setCapture({ button, kind: "pad" })}
                aria-label={`Bind controller input for ${BUTTON_LABELS[button]}`}
              >
                {capture?.button === button && capture.kind === "pad"
                  ? "Press a pad button…"
                  : padLabel(config.pad[button])}
              </button>
            </Fragmentish>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            Keyboard changes apply to the core the next time you press Run.
          </p>
          <Button variant="outline" size="sm" onClick={() => onChange({ ...DEFAULT_CONFIG })}>
            Reset defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Grid children need to be flat, so this renders its children without a wrapper. */
function Fragmentish({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
