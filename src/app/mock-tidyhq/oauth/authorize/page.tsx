import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyMode, getTidyServices } from "@/lib/tidyhq";
import { parseMockAuthorizeRequest } from "@/lib/tidyhq/mock/MockTidyOAuth";

// Fake TidyHQ sign-in page, for mock mode only. Pick a seed member and the
// approve route sends you back to the app's callback, like real TidyHQ would
// after a sign-in. The mode is checked per request, not at build time. Outside
// mock mode it shows Next's not-found screen; the status is 200, not 404,
// because the page has already started streaming by then (it's marked
// noindex). A live server never links here anyway.

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
  await connection();
  // Checked before building the services, which throw in live mode.
  if (getTidyMode() !== "mock") notFound();
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") notFound();

  const query = await searchParams;
  const request = parseMockAuthorizeRequest(
    query,
    appOrigin(await headers()),
    tidy.oauth.clientId,
  );
  if (!request) {
    return <p className="text-lg">This sign-in link is invalid.</p>;
  }

  // A plain form, so it works without JavaScript. Each button posts the
  // OAuth request plus the picked member; a code is issued only on click.
  return (
    <form
      method="post"
      action="/mock-tidyhq/oauth/approve"
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="client_id" value={tidy.oauth.clientId} />
      <input type="hidden" name="redirect_uri" value={request.redirectUri} />
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="state" value={request.state} />
      {(await tidy.client.listContacts()).map((contact) => (
        <button
          key={contact.id}
          type="submit"
          name="contact_id"
          value={contact.id}
          className="rounded-lg border border-foreground/20 px-4 py-3 text-left text-lg"
        >
          {contact.display_name}
        </button>
      ))}
    </form>
  );
}
