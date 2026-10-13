import { NextResponse, type NextRequest } from "next/server";
import { appOrigin } from "@/lib/auth/requestOrigin";
import { getTidyMode, getTidyServices, isTidyError } from "@/lib/tidyhq";
import { parseMockAuthorizeRequest } from "@/lib/tidyhq/mock/MockTidyOAuth";

/**
 * `POST /mock-tidyhq/oauth/approve`: the fake sign-in page's form. Issues one
 * code for the picked member and sends them back to the app's callback, like
 * real TidyHQ does after a sign-in. Mock mode only.
 */
export async function POST(request: NextRequest) {
  // Checked before building the services, which throw in live mode.
  if (getTidyMode() !== "mock") {
    return new NextResponse("Not found", { status: 404 });
  }
  const tidy = getTidyServices();
  if (tidy.mode !== "mock") {
    return new NextResponse("Not found", { status: 404 });
  }

  const form = Object.fromEntries(
    [...(await request.formData())].map(([key, value]) => [key, String(value)]),
  );
  const authorize = parseMockAuthorizeRequest(
    form,
    appOrigin(request.headers),
    tidy.oauth.clientId,
  );
  const contactId = form.contact_id ?? "";
  try {
    await tidy.client.getContact(contactId);
  } catch (error) {
    if (!isTidyError(error, 404)) throw error;
    return new NextResponse("Unknown member", { status: 400 });
  }
  if (!authorize) {
    return new NextResponse("Invalid sign-in request", { status: 400 });
  }

  const back = new URL(authorize.redirectUri);
  back.searchParams.set(
    "code",
    tidy.oauth.issueCode(contactId, authorize.redirectUri),
  );
  back.searchParams.set("state", authorize.state);
  // 303 so the browser follows with a GET.
  return NextResponse.redirect(back, 303);
}
