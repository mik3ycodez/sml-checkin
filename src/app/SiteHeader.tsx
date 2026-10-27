import Link from "next/link";
import { SmlLogo } from "./SmlLogo";

/**
 * The bar at the top of every page: SML's logo and name, linking home. Plain
 * server-rendered markup. Both theme logos are in the page and the CSS in
 * globals.css shows one. The logos are decorative (alt=""): the text names the
 * home link, once. The printed QR sheet has its own logo, so the header never
 * prints.
 */
export function SiteHeader() {
  return (
    <header className="bg-surface border-border border-b print:hidden">
      <div className="mx-auto flex max-w-lg items-center px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
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
          <span className="text-lg font-semibold max-[400px]:sr-only">
            Seattle Men in Leather
          </span>
        </Link>
      </div>
    </header>
  );
}
