import type { Profile } from "@/lib/auth/profile";
import type { Theme } from "@/lib/theme";
import { ME_PATH } from "./memberPaths";

// The header's account menu: a native <details>, so it opens and closes with no
// JavaScript on every phone we support. Tapping the chip again, or following an
// item, closes it; tapping outside doesn't (that would need a script).

const ITEM =
  "flex items-center gap-3 px-4 py-3 text-left text-base hover:bg-foreground/5";
const ICON = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "text-foreground/60 shrink-0",
} as const;

function Chevron() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-foreground/60 shrink-0"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

/**
 * A rounded square: the photo over the initials, so a photo that fails to load
 * (an empty alt draws nothing) leaves the initials showing, with no script. A
 * session from before profiles were saved has neither, so it gets a person icon.
 */
function Avatar({ profile }: { profile: Profile }) {
  return (
    <span className="bg-accent text-on-accent relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-semibold">
      {profile.initials ? (
        <span aria-hidden>{profile.initials}</span>
      ) : (
        <PersonIcon className="size-6" />
      )}
      {profile.photo && (
        // A plain <img>, not next/image, which would proxy TidyHQ's images
        // through this server. No referrer: their host learns nothing about
        // which of our pages the member is on.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.photo}
          alt=""
          referrerPolicy="no-referrer"
          width={36}
          height={36}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

const THEME_CHOICES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * System / Light / Dark as three submit buttons in one plain form post, so it
 * works with JavaScript off. `pagePath` is the exact current page: the switch
 * changes no one, so unlike Sign out it never goes to a check-in's start.
 */
function ThemeRow({ theme, pagePath }: { theme: Theme; pagePath: string }) {
  return (
    <form
      method="post"
      action="/theme"
      className="border-border flex flex-col gap-2 border-t px-4 py-3"
    >
      <input type="hidden" name="returnTo" value={pagePath} />
      <span className="flex items-center gap-3 text-base">
        <svg {...ICON}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
        </svg>
        Theme
      </span>
      <span className="flex gap-1">
        {THEME_CHOICES.map(({ value, label }) => (
          <button
            key={value}
            type="submit"
            name="theme"
            value={value}
            aria-pressed={theme === value}
            className="border-border aria-pressed:bg-accent aria-pressed:text-on-accent aria-pressed:border-accent flex-1 cursor-pointer rounded-lg border px-2 py-2 text-sm font-medium"
          >
            {label}
          </button>
        ))}
      </span>
    </form>
  );
}

const CHIP =
  "flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden";
const PANEL =
  "bg-surface border-border absolute top-full right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg";

/**
 * `profile` is null when signed out. `returnTo` is where Sign out sends the
 * member back to, and `pagePath` where the theme switch does (both already
 * checked with `safeReturnTo`). `theme` marks the current choice.
 */
export function ProfileMenu({
  profile,
  returnTo,
  theme,
  pagePath,
}: {
  profile: Profile | null;
  returnTo: string;
  theme: Theme;
  pagePath: string;
}) {
  if (profile === null) {
    return (
      <details className="relative">
        <summary className={`${CHIP} text-base`}>
          Menu
          <Chevron />
        </summary>
        <div className={PANEL}>
          <a href={ME_PATH} className={ITEM}>
            <PersonIcon {...ICON} />
            Sign in
          </a>
          <ThemeRow theme={theme} pagePath={pagePath} />
        </div>
      </details>
    );
  }

  const name = profile.name;
  return (
    <details className="relative">
      <summary
        aria-label={
          name
            ? `Account menu, signed in as ${name}`
            : "Account menu, signed in"
        }
        className={CHIP}
      >
        <Avatar profile={profile} />
        {/* Phones show only the avatar and chevron; the name is at the top of
            the open menu. */}
        {name && (
          <span className="hidden max-w-[12ch] truncate min-[640px]:block">
            {name}
          </span>
        )}
        <Chevron />
      </summary>
      <div className={PANEL}>
        <p className="border-border truncate border-b px-4 py-3 font-semibold">
          {name ?? "Signed in"}
        </p>
        <a href={ME_PATH} className={`${ITEM} border-border border-b`}>
          <svg {...ICON}>
            <path d="M3 3v18h18" />
            <path d="m7 15 4-4 3 3 5-6" />
          </svg>
          My points and status
        </a>
        <ThemeRow theme={theme} pagePath={pagePath} />
        {/* Sign-out refuses GETs, so this is a plain form post. */}
        <form
          method="post"
          action="/auth/signout"
          className="border-border border-t"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className={`${ITEM} w-full`}>
            <svg {...ICON}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
