import { describe, expect, it } from "vitest";
import { encodeAwardNotice, readAwardNotice } from "./awardNotice";

const FOR_DANTE = { eventId: "ev_tonight", contactId: "c_dante" };

describe("award notice", () => {
  it("round-trips the points awarded", () => {
    const value = encodeAwardNotice({ ...FOR_DANTE, points: 1 });
    expect(readAwardNotice(value, FOR_DANTE)).toBe(1);
  });

  it("is ignored for another member on the same phone", () => {
    const value = encodeAwardNotice({ ...FOR_DANTE, points: 1 });
    expect(
      readAwardNotice(value, { eventId: "ev_tonight", contactId: "c_lee" }),
    ).toBeNull();
  });

  it("is ignored for another event", () => {
    const value = encodeAwardNotice({ ...FOR_DANTE, points: 1 });
    expect(
      readAwardNotice(value, { eventId: "ev_pub_night", contactId: "c_dante" }),
    ).toBeNull();
  });

  it("keeps ids with separators intact", () => {
    const ids = { eventId: "a&b=c", contactId: "x&e=ev_tonight" };
    const value = encodeAwardNotice({ ...ids, points: 2 });
    expect(readAwardNotice(value, ids)).toBe(2);
    expect(
      readAwardNotice(value, { eventId: "ev_tonight", contactId: "x" }),
    ).toBeNull();
  });

  it.each([undefined, "", "garbage", "e=ev_tonight&c=c_dante&p=", "e=ev_tonight&c=c_dante&p=-1", "e=ev_tonight&c=c_dante&p=1.5", "e=ev_tonight&c=c_dante&p=0"])(
    "reads %j as no notice",
    (value) => {
      expect(readAwardNotice(value, FOR_DANTE)).toBeNull();
    },
  );
});
