import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/demoMode";
import { PRIMARY } from "../memberUi";
import { SCENARIOS, targetPath, type Part, type Scenario } from "./scenarios";

// The demo walkthrough: what to try, who to sign in as, and what you should
// see. Demo mode only (a real 404 otherwise). Plain server-rendered markup,
// and each Start is a form post, so it works with JavaScript off. No
// Suspense: the page must render fully without scripts.

export const metadata: Metadata = { title: "Demo walkthrough" };

// Rendered per request, never at build time, so the mode is checked on each
// request even if a later edit stops reading request data here.
export const dynamic = "force-dynamic";

const BOX =
  "bg-surface border-border flex flex-col gap-2 rounded-lg border p-4";

export default function DemoPage() {
  if (!isDemoMode()) notFound();
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Demo walkthrough</h1>
        <p className="text-foreground/70 text-lg">
          Try every feature of SML Check-in with made-up members. Nothing here
          is real TidyHQ data.
        </p>
      </header>

      <section className={BOX}>
        <h2 className="text-xl font-semibold">How to use this page</h2>
        <p>
          Tap a <strong>Start</strong> button. It signs out whoever is signed
          in, opens the page the scenario is about, and shows the sign-in list.
          Tap the member named on the button, then follow the steps.
        </p>
        <p>
          <strong>Tip:</strong> to watch the admin attendee list update
          (scenario 7), use two windows: one browser for the admin, and a second
          browser or a private window for the members checking in. One browser
          holds one signed-in person at a time.
        </p>
      </section>

      <section className={BOX}>
        <h2 className="text-xl font-semibold">Everyone shares one demo</h2>
        <p>
          A scenario someone already ran looks different. For example, Dante may
          already be checked in. Each scenario says what you will see then.
        </p>
        <p>
          To start over, ask the person running the demo to press{" "}
          <strong>Restart</strong> on the web app in the Azure portal. That
          resets every check-in and point. So does a new deploy, and so does the
          demo waking up after an idle sleep on the free tier, which can happen
          without anyone pressing anything. The demo&apos;s data is built at the
          first request after a Restart, deploy or sleep, and Social Night is
          open for check-in for 24 hours from then; after that it says
          &quot;Check-in has closed&quot; and every scenario that uses Social
          Night needs another Restart. If your scenario was undone, one of these
          probably happened.
        </p>
      </section>

      <ol className="flex list-none flex-col gap-6 p-0">
        {SCENARIOS.map((scenario) => (
          <li key={scenario.number}>
            <ScenarioSection scenario={scenario} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScenarioSection({ scenario }: { scenario: Scenario }) {
  const headingId = `scenario-${scenario.number}-title`;
  return (
    <section
      id={`scenario-${scenario.number}`}
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <h2 id={headingId} className="text-2xl font-bold tracking-tight">
        {scenario.number}. {scenario.title}
      </h2>
      {scenario.parts.map((part, index) => (
        <PartBlock key={index} part={part} />
      ))}
      <p className="text-foreground/70">
        <strong>If someone already ran this:</strong> {scenario.alreadyRun}
      </p>
    </section>
  );
}

function PartBlock({ part }: { part: Part }) {
  return (
    <div className={BOX}>
      {part.heading && (
        <h3 className="text-lg font-semibold">{part.heading}</h3>
      )}
      <p>
        Sign in as <strong>{part.memberName}</strong>.
      </p>
      {/* Sign-out is a POST. It returns to the scenario's page, which sends a
          signed-out visitor to sign-in and then back here. */}
      <form method="post" action="/auth/signout">
        <input type="hidden" name="returnTo" value={targetPath(part.target)} />
        <button type="submit" className={`${PRIMARY} w-full`}>
          Start as {part.memberName}
        </button>
      </form>
      <h4 className="font-semibold">Steps</h4>
      <ol className="flex list-decimal flex-col gap-1 pl-6">
        {part.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h4 className="font-semibold">You should see</h4>
      <ul className="flex list-disc flex-col gap-1 pl-6">
        {part.see.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
