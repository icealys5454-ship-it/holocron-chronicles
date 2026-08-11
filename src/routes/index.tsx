import { createFileRoute } from "@tanstack/react-router";

import logo from "@/assets/holocron-logo.jpg";
import { HolocronEmulator } from "@/components/HolocronEmulator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HOLOCRON SNES Emulator — Play in your browser" },
      {
        name: "description",
        content:
          "Run the HOLOCRON WebAssembly SNES core in your browser: load a ROM you own, play with keyboard or gamepad, and save states instantly.",
      },
      { property: "og:title", content: "HOLOCRON SNES Emulator — Play in your browser" },
      {
        property: "og:description",
        content:
          "WebAssembly SNES core with WebGL output, keyboard and gamepad input, and instant save states.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center gap-4">
          <img
            src={logo}
            alt="HOLOCRON emulator logo"
            className="h-14 w-14 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              HOLOCRON SNES Emulator
            </h1>
            <p className="text-sm text-muted-foreground">
              WebAssembly core · WebGL output · keyboard &amp; gamepad input
            </p>
          </div>
        </header>
        <HolocronEmulator />
        <p className="mt-6 text-xs text-muted-foreground">
          Load only homebrew or ROMs you legally own. No ROMs are bundled or distributed.
        </p>
      </div>
    </main>
  );
}
