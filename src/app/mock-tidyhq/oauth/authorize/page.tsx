import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyMode, getTidyServices } from "@/lib/tidyhq";
import { contactName } from "@/lib/tidyhq/contactName";
import { parseMockAuthorizeRequest } from "@/lib/tidyhq/mock/MockTidyOAuth";

// Fake TidyHQ sign-in page, for mock mode only. Pick a seed member and the
// approve route sends you back to the app's callback, like real TidyHQ would
// after a sign-in. Reading `searchParams` makes the page dynamic, so the mode
// is checked per request, not at build time. Outside mock mode it's a real
// 404. A live server never links here anyway. No Suspense: the page must
// render fully without JavaScript.

// Rendered per request, never at build time, even if a later edit stops
// reading request data here.
export const dynamic = "force-dynamic";

export default async function MockAuthorizePage({
  searchParams,
}: PageProps<"/mock-tidyhq/oauth/authorize">) {
  // Checked before building the services, so live mode never builds mock ones.
  if (getTidyMode() !== "mock") notFound();
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") notFound();

  const query = await searchParams;
  const request = parseMockAuthorizeRequest(
    query,
    appOrigin(await headers()),
    tidy.oauth.clientId,
  );
  const heading = (
    <>
      <p className="text-foreground/60 text-sm font-semibold tracking-wide uppercase">
        Mock TidyHQ
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Sign in as…</h1>
    </>
  );
  if (!request) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        {heading}
        <p className="text-lg">This sign-in link is invalid.</p>
      </div>
    );
  }

  // A plain form, so it works without JavaScript. Each button posts the
  // OAuth request plus the picked member; a code is issued only on click.
  return (
    <div className="flex flex-1 flex-col gap-4">
      {heading}
      <form
        method="post"
        action="/mock-tidyhq/oauth/approve"
        className="flex flex-col gap-2"
      >
        <input type="hidden" name="client_id" value={tidy.oauth.clientId} />
        <input type="hidden" name="redirect_uri" value={request.redirectUri} />
        <input type="hidden" name="response_type" value="code" />
        <input type="hidden" name="state" value={request.state} />
        {(await tidy.client.listSignInContacts()).map((contact) => (
          <button
            key={contact.id}
            type="submit"
            name="contact_id"
            value={contact.id}
            className="border-foreground/20 rounded-lg border px-4 py-3 text-left text-lg"
          >
            {contactName(contact)}
          </button>
        ))}
      </form>
    </div>
  );
}
