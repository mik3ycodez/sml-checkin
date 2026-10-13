import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseTidyMode } from "@/lib/tidyhq";
import {
  issueMockCode,
  parseMockAuthorizeRequest,
} from "@/lib/tidyhq/mock/MockTidyOAuth";
import { createSeed } from "@/lib/tidyhq/mock/seed";

// Fake TidyHQ sign-in page, for mock mode only. Pick a seed member and get
// sent back to the app's callback, like real TidyHQ would after a sign-in.

export default function MockAuthorizePage({
  searchParams,
}: PageProps<"/mock-tidyhq/oauth/authorize">) {
  if (parseTidyMode(process.env.TIDYHQ_MODE) === "live") notFound();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        Mock TidyHQ
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Sign in as…</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <MemberList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MemberList({
  searchParams,
}: Pick<PageProps<"/mock-tidyhq/oauth/authorize">, "searchParams">) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const request = parseMockAuthorizeRequest(
    await searchParams,
    `${proto}://${host}`,
  );
  if (!request) {
    return <p className="text-lg">This sign-in link is invalid.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {createSeed().contacts.map((contact) => {
        const back = new URL(request.redirectUri);
        back.searchParams.set("code", issueMockCode(contact.id));
        back.searchParams.set("state", request.state);
        return (
          <li key={contact.id}>
            <a
              href={back.toString()}
              className="block rounded-lg border border-foreground/20 px-4 py-3 text-lg"
            >
              {contact.display_name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
