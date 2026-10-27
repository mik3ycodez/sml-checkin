import { contactName, UNNAMED } from "../tidyhq/contactName";
import type { Contact } from "../tidyhq/types";

/**
 * What the header shows about the signed-in member, kept in the session cookie
 * so no page needs a TidyHQ call for it. Display only: nothing here ever
 * decides access or is written anywhere.
 */
export type Profile = {
  name?: string;
  /** 1 to 3 letters. */
  initials?: string;
  /** An https URL under `MAX_PHOTO_LENGTH`; otherwise there is no photo. */
  photo?: string;
};

const MAX_NAME_LENGTH = 100;
/** A longer URL is dropped, never cut, so the cookie stays far under 4 KB. */
const MAX_PHOTO_LENGTH = 512;

/** First letter of the first and last words of `name` (one letter for one word). */
export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .map((word) => Array.from(word)[0].toUpperCase());
  if (words.length <= 1) return words.join("");
  return words[0] + words[words.length - 1];
}

function cleanPhoto(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length >= MAX_PHOTO_LENGTH) return;
  // The mock's own avatars (public/mock), so e2e can show a photo over http.
  // Mock mode only: public/mock ships in live builds, but live data and cookies
  // must never name it.
  if (
    process.env.TIDYHQ_MODE?.trim() === "mock" &&
    /^\/mock\/[A-Za-z0-9._-]+$/.test(value) &&
    !value.includes("..")
  ) {
    return value;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname !== "") return value;
  } catch {
    // Not a URL: no photo.
  }
}

/** 1 to 3 letters, else undefined. */
export function validInitials(value: unknown): string | undefined {
  if (typeof value === "string" && /^\p{L}{1,3}$/u.test(value)) return value;
}

/**
 * Only well-formed fields survive; anything else is left out, never fixed up.
 * The one exception is a name over `MAX_NAME_LENGTH` characters, which is cut
 * (by code point, so never mid-character).
 */
export function cleanProfile(raw: unknown): Profile {
  if (typeof raw !== "object" || raw === null) return {};
  const { name, initials, photo } = raw as Record<string, unknown>;
  const profile: Profile = {};
  if (typeof name === "string" && name.trim() !== "") {
    profile.name = Array.from(name).slice(0, MAX_NAME_LENGTH).join("");
  }
  const cleanedInitials = validInitials(initials);
  if (cleanedInitials) profile.initials = cleanedInitials;
  const cleanedPhoto = cleanPhoto(photo);
  if (cleanedPhoto) profile.photo = cleanedPhoto;
  return profile;
}

/**
 * The header profile for a contact: `contactName`, TidyHQ's initials if they
 * are 1 to 3 letters (else computed from the name), and its profile image.
 */
export function profileFor(
  contact: Partial<
    Pick<
      Contact,
      "display_name" | "first_name" | "last_name" | "initials" | "profile_image"
    >
  >,
): Profile {
  const name = contactName(contact);
  // No usable name: leave name and initials out, so the menu shows its
  // "Signed in" fallback instead of "Unnamed member" and "UM".
  if (name === UNNAMED) {
    return cleanProfile({ photo: contact.profile_image });
  }
  return cleanProfile({
    name,
    initials: validInitials(contact.initials) ?? initialsOf(name),
    photo: contact.profile_image,
  });
}
