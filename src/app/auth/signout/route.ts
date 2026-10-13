import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, isSameSiteRequest } from "@/lib/auth/requestOrigin";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { clearSession } from "@/lib/auth/session";

/**
 * `POST /auth/signout`: signs the member out, then goes to the form's
 * `returnTo` page on this site (home by default). The check-in page uses it
 * so "not you?" leads straight back to sign-in.
 */
export async function POST(request: NextRequest) {
  const origin = appOrigin(request.headers);
  // Another site must not be able to sign members out with a hidden form.
  if (!isSameSiteRequest(request.headers, origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await clearSession();
  const returnTo = safeReturnTo(await formField(request, "returnTo"));
  // 303 so the browser follows with a GET, not a repeat POST.
  return NextResponse.redirect(new URL(returnTo, origin), 303);
}

/** A field from a form post, or null if there's no form body. */
async function formField(request: NextRequest, name: string) {
  try {
    const value = (await request.formData()).get(name);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
