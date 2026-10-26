import { DEMO_PATH } from "@/lib/demoMode";

/**
 * Shown on every page of a demo site (`DEMO_MODE=on`), so nobody mistakes mock
 * members and points for real ones, with a link to the demo walkthrough. Plain
 * server-rendered markup: no script, so it shows with JavaScript off too.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="bg-foreground text-background px-4 py-1.5 text-center text-sm"
    >
      <span className="font-semibold">Demo data</span>
      {" · "}
      <a href={DEMO_PATH} className="underline">
        Demo walkthrough
      </a>
    </div>
  );
}
