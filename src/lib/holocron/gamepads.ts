import { useEffect, useRef, useState } from "react";

export type PadInfo = {
  index: number;
  id: string;
  mapping: string;
  buttons: number;
  axes: number;
  connectedAt: number;
};

export type PadEvent = {
  at: number;
  kind: "connected" | "disconnected";
  index: number;
  id: string;
  deviceType: string;
  mapping: string;
};

/** Best-effort device-type classification from the HID id string. */
export function classifyPad(id: string, mapping: string): string {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return "Xbox / XInput";
  if (/dualsense|dualshock|playstation|054c/.test(s)) return "PlayStation";
  if (/switch|joy-?con|pro controller|057e/.test(s)) return "Nintendo Switch";
  if (/8bitdo|2dc8/.test(s)) return "8BitDo";
  if (/wheel|racing/.test(s)) return "Racing wheel";
  if (/keyboard/.test(s)) return "Keyboard-emulated";
  return mapping === "standard" ? "Standard gamepad" : "Generic HID";
}

const snapshot = (p: Gamepad): PadInfo => ({
  index: p.index,
  id: p.id,
  mapping: p.mapping || "non-standard",
  buttons: p.buttons.length,
  axes: p.axes.length,
  connectedAt: Date.now(),
});

/**
 * Live hotplug detection for USB/Bluetooth controllers.
 * Listens to gamepadconnected/disconnected and also polls, since some
 * browsers only surface a pad after the first button press.
 */
export function useGamepads(pollMs = 500) {
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [events, setEvents] = useState<PadEvent[]>([]);
  const known = useRef(new Map<number, PadInfo>());

  useEffect(() => {
    const log = (kind: PadEvent["kind"], info: PadInfo) =>
      setEvents((prev) =>
        [
          {
            at: Date.now(),
            kind,
            index: info.index,
            id: info.id,
            deviceType: classifyPad(info.id, info.mapping),
            mapping: info.mapping,
          },
          ...prev,
        ].slice(0, 50),
      );

    const sync = () => {
      const list = (navigator.getGamepads?.() ?? []).filter(Boolean) as Gamepad[];
      const live = new Map<number, PadInfo>();
      for (const p of list) {
        const existing = known.current.get(p.index);
        if (existing && existing.id === p.id) {
          live.set(p.index, existing);
        } else {
          const info = snapshot(p);
          live.set(p.index, info);
          log("connected", info);
        }
      }
      for (const [index, info] of known.current) {
        if (!live.has(index)) log("disconnected", info);
      }
      known.current = live;
      setPads([...live.values()].sort((a, b) => a.index - b.index));
    };

    sync();
    window.addEventListener("gamepadconnected", sync);
    window.addEventListener("gamepaddisconnected", sync);
    const timer = window.setInterval(sync, pollMs);
    return () => {
      window.removeEventListener("gamepadconnected", sync);
      window.removeEventListener("gamepaddisconnected", sync);
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return { pads, events };
}
