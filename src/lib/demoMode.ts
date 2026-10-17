/** Whether `DEMO_MODE=on`: mock data on purpose, so every page says so. */
export function isDemoMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.DEMO_MODE?.trim() === "on";
}
