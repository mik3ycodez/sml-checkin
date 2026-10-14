import { safeReturnTo } from "@/lib/auth/returnTo";

// Plain page, no Suspense: it must render fully without JavaScript.

export default async function SignInErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const { returnTo } = await searchParams;
  const target = safeReturnTo(typeof returnTo === "string" ? returnTo : null);
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Sign-in failed</h1>
      <p className="text-foreground/70 text-lg">
        Something went wrong signing you in with TidyHQ. Please try again.
      </p>
      <a
        href={`/auth/signin?returnTo=${encodeURIComponent(target)}`}
        className="bg-foreground text-background rounded-lg px-4 py-3 text-center text-lg font-semibold"
      >
        Try again
      </a>
    </div>
  );
}
