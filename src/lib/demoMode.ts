/** The demo walkthrough page, which exists only in demo mode. */
export const DEMO_PATH = "/demo";

/** Whether `DEMO_MODE=on`: mock data on purpose, so every page says so. */
export function isDemoMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.DEMO_MODE?.trim() === "on";
}
