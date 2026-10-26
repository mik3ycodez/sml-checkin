import { DEMO_PATH, isDemoMode } from "@/lib/demoMode";
import { ME_PATH } from "./memberPaths";
import { PRIMARY, SECONDARY } from "./memberUi";

// The splash page. Its one action is the member's status page: a signed-out
// visitor is sent through TidyHQ sign-in by /me itself and lands back there.
// A demo site adds a link to its walkthrough (the layout reads the request, so
// this is decided per request, not at build time).

export default function Home() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        SML Check-in
      </h1>
      <p className="text-foreground/70 text-lg">
        Scan an event QR code to check in.
      </p>
      <a href={ME_PATH} className={PRIMARY}>
        My points and status
      </a>
      {isDemoMode() && (
        <a href={DEMO_PATH} className={SECONDARY}>
          Demo walkthrough
        </a>
      )}
    </div>
  );
}
