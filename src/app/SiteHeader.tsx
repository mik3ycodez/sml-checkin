import Link from "next/link";
import type { Profile } from "@/lib/auth/profile";
import { ProfileMenu } from "./ProfileMenu";
import { SmlLogo } from "./SmlLogo";

/**
 * The bar at the top of every page: SML's logo and name, linking home. Plain
 * server-rendered markup. Both theme logos are in the page and the CSS in
 * globals.css shows one. The logos are decorative (alt=""): the text names the
 * home link, once. The printed QR sheet has its own logo, so the header never
 * prints. On the right, the account menu (`profile` is null when signed out).
 */
export function SiteHeader({
  profile,
  returnTo,
}: {
  profile: Profile | null;
  returnTo: string;
}) {
  return (
    <header className="bg-surface border-border border-b print:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-3 py-2 min-[400px]:px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 min-[400px]:gap-3"
        >
          <SmlLogo
            variant="black"
            decorative
            className="logo-for-light h-10 w-auto"
          />
          <SmlLogo
            variant="white"
            decorative
            className="logo-for-dark h-10 w-auto"
          />
          <span className="text-[15px] font-semibold whitespace-nowrap max-[359px]:sr-only min-[400px]:text-lg">
            Seattle Men in Leather
          </span>
        </Link>
        <ProfileMenu profile={profile} returnTo={returnTo} />
      </div>
    </header>
  );
}
