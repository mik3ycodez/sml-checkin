import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, isSameSiteRequest } from "./requestOrigin";
import { safeReturnTo } from "./returnTo";

/** Reads a text field of the form post; null when absent or not text. */
export type FormField = (name: string) => string | null;

/**
 * The shared shape of our plain form posts (Sign out, Theme): refuse another
 * site, run `act`, then 303 to the form's `returnTo` on this site (home if it
 * is missing or not a path on this site). One place, so the CSRF check and the
 * redirect rules can't drift apart between routes.
 */
export async function handleFormPost(
  request: NextRequest,
  act: (field: FormField) => Promise<void> | void,
): Promise<NextResponse> {
  const origin = appOrigin(request.headers);
  // Another site must not be able to act with a hidden form.
  if (!isSameSiteRequest(request.headers, origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await readForm(request);
  const field: FormField = (name) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  await act(field);
  // 303 so the browser follows with a GET, not a repeat POST.
  return NextResponse.redirect(
    new URL(safeReturnTo(field("returnTo")), origin),
    303,
  );
}

/** The form post's fields, or null if there's no form body. */
async function readForm(request: NextRequest) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
