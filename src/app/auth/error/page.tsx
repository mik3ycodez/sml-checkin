import { Suspense } from "react";
import { safeReturnTo } from "@/lib/auth/returnTo";

export default function SignInErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Sign-in failed</h1>
      <p className="text-foreground/70 text-lg">
        Something went wrong signing you in with TidyHQ. Please try again.
      </p>
      <Suspense fallback={<TryAgain returnTo="/" />}>
        <TryAgainFromQuery searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TryAgainFromQuery({
  searchParams,
}: Pick<PageProps<"/auth/error">, "searchParams">) {
  const { returnTo } = await searchParams;
  return (
    <TryAgain
      returnTo={safeReturnTo(typeof returnTo === "string" ? returnTo : null)}
    />
  );
}

function TryAgain({ returnTo }: { returnTo: string }) {
  return (
    <a
      href={`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`}
      className="bg-foreground text-background rounded-lg px-4 py-3 text-center text-lg font-semibold"
    >
      Try again
    </a>
  );
}
