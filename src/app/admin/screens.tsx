import { SignedInAs } from "../memberUi";
import { ADMIN_PATH } from "./paths";

// Plain server-rendered markup, like the member pages: no client JavaScript.

export function AdminHomeScreen({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <SignedInAs name={name} returnTo={ADMIN_PATH} />
    </div>
  );
}

/**
 * Why a signed-in person can't use the admin pages. `unavailable` is
 * deliberately different from `not_admin`, so the Board knows to look at the
 * app's settings and TidyHQ rather than at who's in the group.
 */
export function AdminDeniedScreen({
  reason,
  name,
}: {
  reason: "not_admin" | "unavailable";
  /** Null if TidyHQ couldn't say who this is. */
  name: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      {reason === "not_admin" ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            You don&apos;t have access
          </h1>
          <p className="text-foreground/70 text-lg">
            You don&apos;t have access to the admin pages. If you should, ask a
            Board member to add you to the App Admin group in TidyHQ.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">
            Admin access unavailable
          </h1>
          <p className="text-foreground/70 text-lg">
            We couldn&apos;t check admin access just now, so nobody can use the
            admin pages. Please try again in a minute. If it keeps happening,
            tell whoever runs this site.
          </p>
        </>
      )}
      {name ? (
        <SignedInAs name={name} returnTo={ADMIN_PATH} />
      ) : (
        <form method="post" action="/auth/signout">
          <input type="hidden" name="returnTo" value={ADMIN_PATH} />
          <button type="submit" className="text-foreground/70 underline">
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}
