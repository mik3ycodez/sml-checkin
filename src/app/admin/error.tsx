"use client"; // Error boundaries must be Client Components.

import { MemberError } from "../memberError";

// Shown if an admin page itself fails to load. Next.js logs the error on the
// server. Generic on purpose: it could be TidyHQ or the app's own settings.

export default function AdminError() {
  return (
    <MemberError>
      This page couldn&apos;t load just now. Please try again in a minute. If it
      keeps happening, tell whoever runs this site.
    </MemberError>
  );
}
