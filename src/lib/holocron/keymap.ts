/**
 * Keyboard / controller binding model for the SNES core.
 *
 * Everything is expressed as keyboard bindings: the emulator core only ever
 * sees keyboard input. Gamepads are bridged to those same keys (see
 * `padToKeyEvents`), which is what makes "configure connected controllers to
 * keyboard" work for any pad the browser exposes.
 */

export const SNES_BUTTONS = [
  "up",
  "down",
  "left",
  "right",
  "a",
  "b",
  "x",
  "y",
  "l",
  "r",
  "start",
  "select",
] as const;

export type SnesButton = (typeof SNES_BUTTONS)[number];

export const BUTTON_LABELS: Record<SnesButton, string> = {
  up: "D-pad Up",
  down: "D-pad Down",
  left: "D-pad Left",
  right: "D-pad Right",
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "L",
  r: "R",
  start: "Start",
  select: "Select",
};

/** KeyboardEvent.code per SNES button. */
export type KeyBindings = Record<SnesButton, string>;

/** Gamepad button/axis index per SNES button. Axes use `axis+N` / `axis-N`. */
export type PadBindings = Record<SnesButton, string | null>;

export const DEFAULT_KEYS: KeyBindings = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "KeyX",
  b: "KeyZ",
  x: "KeyS",
  y: "KeyA",
  l: "KeyQ",
  r: "KeyW",
  start: "Enter",
  select: "ShiftLeft",
};

/** Standard-mapping gamepad layout (Xbox/PS/8BitDo in XInput mode). */
export const DEFAULT_PAD: PadBindings = {
  up: "12",
  down: "13",
  left: "14",
  right: "15",
  a: "1",
  b: "0",
  x: "3",
  y: "2",
  l: "4",
  r: "5",
  start: "9",
  select: "8",
};

export type ControllerConfig = {
  keys: KeyBindings;
  pad: PadBindings;
  padEnabled: boolean;
  /** Analog stick doubles as the D-pad. */
  analogAsDpad: boolean;
};

export const DEFAULT_CONFIG: ControllerConfig = {
  keys: { ...DEFAULT_KEYS },
  pad: { ...DEFAULT_PAD },
  padEnabled: true,
  analogAsDpad: true,
};

const STORAGE_KEY = "holocron.controller.config.v1";

export function loadConfig(): ControllerConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ControllerConfig>;
    return {
      keys: { ...DEFAULT_KEYS, ...(parsed.keys ?? {}) },
      pad: { ...DEFAULT_PAD, ...(parsed.pad ?? {}) },
      padEnabled: parsed.padEnabled ?? true,
      analogAsDpad: parsed.analogAsDpad ?? true,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ControllerConfig) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — keep the in-memory config */
  }
}

/** Human-readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  if (code.startsWith("Arrow")) return code.slice(5) + " arrow";
  const named: Record<string, string> = {
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    Space: "Space",
    Enter: "Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    Escape: "Esc",
  };
  return named[code] ?? code;
}

/** Label for a stored pad binding. */
export function padLabel(binding: string | null): string {
  if (!binding) return "unbound";
  if (binding.startsWith("axis")) {
    const sign = binding[4] === "-" ? "−" : "+";
    return `Axis ${binding.slice(5)}${sign}`;
  }
  return `Button ${binding}`;
}

/** Maps a KeyboardEvent.code to the key name RetroArch expects in its config. */
export function codeToRetroKey(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return `num${code.slice(5)}`;
  if (code.startsWith("Arrow")) return code.slice(5).toLowerCase();
  const named: Record<string, string> = {
    Enter: "enter",
    Space: "space",
    ShiftLeft: "shift",
    ShiftRight: "rshift",
    ControlLeft: "ctrl",
    ControlRight: "rctrl",
    AltLeft: "alt",
    AltRight: "ralt",
    Backspace: "backspace",
    Tab: "tab",
    Escape: "escape",
    Minus: "minus",
    Equal: "equals",
    Comma: "comma",
    Period: "period",
    Slash: "slash",
    Semicolon: "semicolon",
    Quote: "quote",
    BracketLeft: "leftbracket",
    BracketRight: "rightbracket",
    Backslash: "backslash",
    Backquote: "backquote",
  };
  return named[code] ?? null;
}

/** Builds the RetroArch keybind config for player 1 from the bindings. */
export function toRetroarchConfig(keys: KeyBindings): Record<string, string> {
  const config: Record<string, string> = {};
  for (const button of SNES_BUTTONS) {
    const retroKey = codeToRetroKey(keys[button]);
    if (retroKey) config[`input_player1_${button}`] = retroKey;
  }
  return config;
}

/** Reads a single pad binding's pressed state. */
export function isPadBindingPressed(pad: Gamepad, binding: string, deadzone = 0.5): boolean {
  if (binding.startsWith("axis")) {
    const sign = binding[4] === "-" ? -1 : 1;
    const value = pad.axes[Number(binding.slice(5))] ?? 0;
    return sign > 0 ? value > deadzone : value < -deadzone;
  }
  return pad.buttons[Number(binding)]?.pressed ?? false;
}

/** Returns the first pressed button/axis on a pad, for "press to bind" capture. */
export function detectPadInput(pad: Gamepad, deadzone = 0.6): string | null {
  for (let i = 0; i < pad.buttons.length; i++) {
    if (pad.buttons[i]?.pressed) return String(i);
  }
  for (let i = 0; i < pad.axes.length; i++) {
    const value = pad.axes[i] ?? 0;
    if (value > deadzone) return `axis+${i}`;
    if (value < -deadzone) return `axis-${i}`;
  }
  return null;
}
