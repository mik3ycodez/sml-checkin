"use client"; // Error boundaries must be Client Components.

import { MemberError } from "../../memberError";

// Shown if a check-in page itself fails to load, e.g. TidyHQ is down when the
// member scans the code. Next.js logs the error on the server.

export default function CheckInError() {
  return (
    <MemberError>
      We couldn&apos;t reach TidyHQ just now. Please try again, or ask a
      volunteer at the door for help.
    </MemberError>
  );
}
