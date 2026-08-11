// SNES controller bit layout used by the HOLOCRON core.
export const SNES_BITS = {
  B: 0,
  Y: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const;

export type SnesButton = keyof typeof SNES_BITS;

export const gamepadBindings: Record<string, number> = {
  B: 0,
  A: 1,
  Y: 2,
  X: 3,
  L: 4,
  R: 5,
  Select: 8,
  Start: 9,
};

export function pollGamepadMask(index = 0): number {
  const pad = navigator.getGamepads?.()[index];
  if (!pad) return 0;
  const pressed = (name: string) => {
    const i = gamepadBindings[name];
    return Number.isInteger(i) && Boolean(pad.buttons[i as number]?.pressed);
  };
  let m = 0;
  for (const name of ["B", "Y", "Select", "Start", "A", "X", "L", "R"] as SnesButton[]) {
    if (pressed(name)) m |= 1 << SNES_BITS[name];
  }
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  if (ay < -0.5) m |= 1 << SNES_BITS.Up;
  if (ay > 0.5) m |= 1 << SNES_BITS.Down;
  if (ax < -0.5) m |= 1 << SNES_BITS.Left;
  if (ax > 0.5) m |= 1 << SNES_BITS.Right;
  return m;
}

export const keyboardMap: Record<string, SnesButton> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  KeyW: "Up",
  KeyS: "Down",
  KeyA: "Left",
  KeyD: "Right",
  KeyZ: "B",
  KeyX: "A",
  KeyC: "Y",
  KeyV: "X",
  KeyQ: "L",
  KeyE: "R",
  Enter: "Start",
  ShiftRight: "Select",
  ShiftLeft: "Select",
};

export class KeyboardInput {
  private held = new Set<SnesButton>();
  private onDown = (e: KeyboardEvent) => {
    const b = keyboardMap[e.code];
    if (b) {
      this.held.add(b);
      e.preventDefault();
    }
  };
  private onUp = (e: KeyboardEvent) => {
    const b = keyboardMap[e.code];
    if (b) {
      this.held.delete(b);
      e.preventDefault();
    }
  };

  attach() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    return this;
  }

  detach() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    this.held.clear();
  }

  press(button: SnesButton) {
    this.held.add(button);
  }

  release(button: SnesButton) {
    this.held.delete(button);
  }

  mask(): number {
    let m = 0;
    for (const b of this.held) m |= 1 << SNES_BITS[b];
    return m;
  }
}
