import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyServices } from "@/lib/tidyhq";
import { parseMockAuthorizeRequest } from "@/lib/tidyhq/mock/MockTidyOAuth";
import { createSeed } from "@/lib/tidyhq/mock/seed";

// Fake TidyHQ sign-in page, for mock mode only. Pick a seed member and get
// sent back to the app's callback, like real TidyHQ would after a sign-in.
// The mode is checked per request, not at build time: in production it must
// be set explicitly (see parseTidyMode), and a live server returns 404 here.

export default function MockAuthorizePage({
  searchParams,
}: PageProps<"/mock-tidyhq/oauth/authorize">) {
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
  // Runs per request, never prerendered: it checks the mode, and issues
  // fresh codes with timestamps.
  await connection();
  const query = await searchParams;
  const origin = appOrigin(await headers());
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") notFound();
  const { oauth } = tidy;

  const request = parseMockAuthorizeRequest(query, origin, oauth.clientId);
  if (!request) {
    return <p className="text-lg">This sign-in link is invalid.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {createSeed().contacts.map((contact) => {
        const back = new URL(request.redirectUri);
        back.searchParams.set(
          "code",
          oauth.issueCode(contact.id, request.redirectUri),
        );
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
