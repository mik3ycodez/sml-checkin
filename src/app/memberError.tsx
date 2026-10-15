import type { ReactNode } from "react";

/**
 * The screen for a member page that failed to load, e.g. TidyHQ is down.
 * Each page's `error.tsx` renders it with its own explanation. "Try again" is
 * a plain link that reloads the page, so it works without JavaScript too.
 * Kept free of server-only imports because error boundaries are Client
 * Components.
 */
export function MemberError({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-foreground/70 text-lg">{children}</p>
      <a
        href=""
        className="bg-foreground text-background rounded-lg px-4 py-3 text-center text-lg font-semibold"
      >
        Try again
      </a>
    </div>
  );
}
