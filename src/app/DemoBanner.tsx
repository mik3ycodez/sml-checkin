/**
 * Shown on every page of a demo site (`DEMO_MODE=on`), so nobody mistakes mock
 * members and points for real ones. Plain server-rendered markup: no script,
 * so it shows with JavaScript off too.
 */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="bg-foreground text-background px-4 py-1.5 text-center text-sm font-semibold"
    >
      Demo data
    </div>
  );
}
