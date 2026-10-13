import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { findEvent } from "@/lib/checkin/checkIn";
import { getTidyClient } from "@/lib/tidyhq";
import { checkInAction } from "./actions";
import { checkinPath, Loading, signInPath, UnknownEvent } from "./screens";

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

  // Before sign-in, so a bad QR code doesn't send anyone through TidyHQ first.
  const found = await findEvent(client, eventId);
  if (!found) return <UnknownEvent />;

  const session = await getSession();
  if (!session) redirect(signInPath(eventId));
  const contact = await client.getContact(session.contactId);

  // Plain forms, so checking in works even if JavaScript fails on older phones.
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {found.event.name ?? "SML event"}
      </h1>
      <form action={checkInAction.bind(null, eventId)}>
        <button
          type="submit"
          className="w-full rounded-lg bg-foreground px-4 py-5 text-2xl font-semibold text-background"
        >
          Check in
        </button>
      </form>
      <form
        method="post"
        action="/auth/signout"
        className="text-foreground/70"
      >
        <input type="hidden" name="returnTo" value={checkinPath(eventId)} />
        Signed in as {contact.display_name}{" "}
        <span className="whitespace-nowrap">
          (not you?{" "}
          <button type="submit" className="underline">
            sign out
          </button>
          )
        </span>
      </form>
    </div>
  );
}
