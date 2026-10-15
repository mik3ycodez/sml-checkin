"use client"; // Error boundaries must be Client Components.

import { MemberError } from "../memberError";

// Shown if an admin page itself fails to load, e.g. TidyHQ is down. Next.js
// logs the error on the server.

export default function AdminError() {
  return (
    <MemberError>
      We couldn&apos;t reach TidyHQ just now. Please try again in a minute.
    </MemberError>
  );
}
