import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, isSameSiteRequest } from "@/lib/auth/requestOrigin";
import { clearSession } from "@/lib/auth/session";

/** `POST /auth/signout`: signs the member out. */
export async function POST(request: NextRequest) {
  const origin = appOrigin(request.headers);
  // Another site must not be able to sign members out with a hidden form.
  if (!isSameSiteRequest(request.headers, origin)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await clearSession();
  // 303 so the browser follows with a GET, not a repeat POST.
  return NextResponse.redirect(new URL("/", origin), 303);
}
