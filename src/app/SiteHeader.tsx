import Link from "next/link";

/**
 * The bar at the top of every page: SML's logo and name, linking home. Plain
 * server-rendered markup. Both theme logos are in the page and the CSS in
 * globals.css shows one. The originals are used as they are (a plain <img>,
 * not next/image, which would make resized copies of the locked files). The
 * printed QR sheet has its own logo, so the header never prints.
 */
export function SiteHeader() {
  return (
    <header className="bg-surface border-border border-b print:hidden">
      <div className="mx-auto flex max-w-lg items-center px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable @next/next/no-img-element */}
          <img
            src="/brand/sml-logo-black.png"
            alt="Seattle Men in Leather"
            width={84}
            height={40}
            className="logo-for-light h-10 w-auto"
          />
          <img
            src="/brand/sml-logo-white.png"
            alt="Seattle Men in Leather"
            width={84}
            height={40}
            className="logo-for-dark h-10 w-auto"
          />
          {/* eslint-enable @next/next/no-img-element */}
          <span className="text-lg font-semibold max-[400px]:sr-only">
            Seattle Men in Leather
          </span>
        </Link>
      </div>
    </header>
  );
}
