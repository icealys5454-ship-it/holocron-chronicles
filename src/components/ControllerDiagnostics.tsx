import { classifyPad, useGamepads } from "@/lib/holocron/gamepads";

const time = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, { hour12: false }) +
  "." +
  String(t % 1000).padStart(3, "0");

export function ControllerDiagnostics() {
  const { pads, events } = useGamepads();

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-card-foreground">
        Controllers{" "}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {pads.length} connected
        </span>
      </h3>

      {pads.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          None detected. Plug in a pad and press any button — browsers hide controllers until first
          input.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {pads.map((p) => (
            <li key={p.index} className="rounded-md bg-muted px-2 py-1 text-xs">
              <span className="font-medium text-card-foreground">
                #{p.index} · {classifyPad(p.id, p.mapping)}
              </span>
              <span className="ml-2 text-muted-foreground">
                {p.buttons}b/{p.axes}a · {p.mapping} · since {time(p.connectedAt)}
              </span>
              <div className="truncate text-muted-foreground">{p.id}</div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-3 text-xs font-semibold text-card-foreground">Hotplug log</h4>
      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
        {events.length === 0
          ? "No connect/disconnect events yet."
          : events
              .map(
                (e) =>
                  `${time(e.at)}  ${e.kind === "connected" ? "+" : "-"} #${e.index}  ${e.deviceType}  (${e.mapping})  ${e.id}`,
              )
              .join("\n")}
      </pre>
    </div>
  );
}
