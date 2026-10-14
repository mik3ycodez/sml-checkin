"use client"; // Error boundaries must be Client Components.

// Shown if a check-in page itself fails to load, e.g. TidyHQ is down when the
// member scans the code. Next.js logs the error on the server. "Try again" is
// a plain link that reloads the page, so it works without JavaScript too.

export default function CheckInError() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-foreground/70 text-lg">
        We couldn&apos;t reach TidyHQ just now. Please try again, or ask a
        volunteer at the door for help.
      </p>
      <a
        href=""
        className="bg-foreground text-background rounded-lg px-4 py-3 text-center text-lg font-semibold"
      >
        Try again
      </a>
    </div>
  );
}
