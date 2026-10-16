import { ME_PATH } from "./memberPaths";
import { PRIMARY } from "./memberUi";

// The splash page. Its one action is the member's status page: a signed-out
// visitor is sent through TidyHQ sign-in by /me itself and lands back there.

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
    </div>
  );
}
