import { useEffect, useRef } from "react";

import {
  SNES_BUTTONS,
  isPadBindingPressed,
  type ControllerConfig,
  type SnesButton,
} from "@/lib/holocron/keymap";

const LEGACY_KEYCODES: Record<string, number> = {
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  Enter: 13,
  Space: 32,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
};

function keyFromCode(code: string): { key: string; keyCode: number } {
  if (code.startsWith("Key")) {
    const letter = code.slice(3);
    return { key: letter.toLowerCase(), keyCode: letter.charCodeAt(0) };
  }
  if (code.startsWith("Digit")) {
    const digit = code.slice(5);
    return { key: digit, keyCode: 48 + Number(digit) };
  }
  if (code.startsWith("Shift")) return { key: "Shift", keyCode: 16 };
  if (code.startsWith("Control")) return { key: "Control", keyCode: 17 };
  if (code.startsWith("Alt")) return { key: "Alt", keyCode: 18 };
  return { key: code === "Space" ? " " : code, keyCode: LEGACY_KEYCODES[code] ?? 0 };
}

function dispatchKey(target: EventTarget, type: "keydown" | "keyup", code: string) {
  const { key, keyCode } = keyFromCode(code);
  const event = new KeyboardEvent(type, {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
  } as KeyboardEventInit);
  target.dispatchEvent(event);
}

/**
 * Bridges connected gamepads to the configured keyboard bindings, so any pad
 * drives the emulator through the exact keys the core listens for.
 */
export function usePadKeyboardBridge(
  config: ControllerConfig,
  enabled: boolean,
  targetRef: { current: HTMLElement | null },
) {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!enabled || !config.padEnabled) return;
    let frame = 0;
    const held = new Set<SnesButton>();

    const release = (button: SnesButton) => {
      const code = configRef.current.keys[button];
      dispatchKey(targetRef.current ?? window, "keyup", code);
      dispatchKey(document, "keyup", code);
    };

    const tick = () => {
      const cfg = configRef.current;
      const pads = (navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[];
      for (const button of SNES_BUTTONS) {
        const binding = cfg.pad[button];
        let pressed = false;
        for (const pad of pads) {
          if (binding && isPadBindingPressed(pad, binding)) pressed = true;
          if (cfg.analogAsDpad && !pressed) {
            const x = pad.axes[0] ?? 0;
            const y = pad.axes[1] ?? 0;
            if (button === "left" && x < -0.5) pressed = true;
            if (button === "right" && x > 0.5) pressed = true;
            if (button === "up" && y < -0.5) pressed = true;
            if (button === "down" && y > 0.5) pressed = true;
          }
        }
        const code = cfg.keys[button];
        if (pressed && !held.has(button)) {
          held.add(button);
          dispatchKey(targetRef.current ?? window, "keydown", code);
          dispatchKey(document, "keydown", code);
        } else if (!pressed && held.has(button)) {
          held.delete(button);
          release(button);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const button of held) release(button);
    };
  }, [enabled, config.padEnabled, targetRef]);
}
