import type { NextRequest } from "next/server";
import { handleFormPost } from "@/lib/auth/formPost";
import { clearSession } from "@/lib/auth/session";

/**
 * `POST /auth/signout`: signs the member out, then goes to the form's
 * `returnTo` page on this site (home by default). The check-in page uses it
 * so "not you?" leads straight back to sign-in.
 */
export function POST(request: NextRequest) {
  return handleFormPost(request, () => clearSession());
}
