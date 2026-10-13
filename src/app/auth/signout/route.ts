import { NextResponse, type NextRequest } from "next/server";
import { clearSession } from "@/lib/auth/session";

/** `POST /auth/signout`: signs the member out. */
export async function POST(request: NextRequest) {
  await clearSession();
  // 303 so the browser follows with a GET, not a repeat POST.
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}
