import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { findContact, findEvent } from "@/lib/checkin/checkIn";
import { getTidyClient } from "@/lib/tidyhq";
import { checkInAction } from "./actions";
import {
  eventTitle,
  Loading,
  SignedInAs,
  signInPath,
  UnknownEvent,
} from "./screens";

// The page a member's phone opens from the event QR code. Visiting it changes
// nothing: checking in is a POST from the button, so link previews and
// prefetching can't check anyone in.

export default function CheckInPage({
  params,
}: PageProps<"/checkin/[eventId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <CheckIn params={params} />
    </Suspense>
  );
}

async function CheckIn({
  params,
}: Pick<PageProps<"/checkin/[eventId]">, "params">) {
  await connection();
  const { eventId } = await params;
  const client = getTidyClient();

  const session = await getSession();
  const [found, contact] = await Promise.all([
    findEvent(client, eventId),
    session ? findContact(client, session.contactId) : null,
  ]);
  // Before sign-in, so a bad QR code doesn't send anyone through TidyHQ first.
  if (!found) return <UnknownEvent />;
  // No session, or one for a contact TidyHQ no longer has.
  if (!contact) redirect(signInPath(eventId));

  // Plain forms, so checking in works even if JavaScript fails on older phones.
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {eventTitle(found.event.name)}
      </h1>
      <form action={checkInAction.bind(null, eventId)}>
        <button
          type="submit"
          className="w-full rounded-lg bg-foreground px-4 py-5 text-2xl font-semibold text-background"
        >
          Check in
        </button>
      </form>
      <SignedInAs name={contact.display_name} eventId={eventId} />
    </div>
  );
}
