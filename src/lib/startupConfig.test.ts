import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkStartupConfig, isDemoMode, liveConfig } from "./startupConfig";

// Real-looking values, none of them a placeholder. The checks must never print
// any of them, so each is distinctive enough to grep for.
const GOOD = {
  TIDYHQ_MODE: "live",
  NODE_ENV: "production",
  APP_ORIGIN: "https://checkin.sml-test.invalid",
  TIDYHQ_CLIENT_ID: "cid_9f2c41d7aa",
  TIDYHQ_CLIENT_SECRET: "cs_live_2b7e90aa11",
  TIDYHQ_ADMIN_TOKEN: "at_live_77c0ffee12",
  SESSION_SECRET: "k3Jv9Qe2mXz0Lw8RtYb5Nc1Hd7Fa4GuS6pIoVxZ",
} as const;

type Env = Record<string, string | undefined>;
const REQUIRED = [
  "APP_ORIGIN",
  "TIDYHQ_CLIENT_ID",
  "TIDYHQ_CLIENT_SECRET",
  "TIDYHQ_ADMIN_TOKEN",
  "SESSION_SECRET",
] as const;

function message(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected it to refuse");
}

/** The KEY=value lines of .env.example, which hold only placeholders. */
function exampleValues(): Record<string, string> {
  const lines = readFileSync(".env.example", "utf8").split("\n");
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe("liveConfig", () => {
  it("accepts a complete configuration and returns what the live services need", () => {
    expect(liveConfig(GOOD)).toMatchObject({
      clientId: GOOD.TIDYHQ_CLIENT_ID,
      clientSecret: GOOD.TIDYHQ_CLIENT_SECRET,
      adminToken: GOOD.TIDYHQ_ADMIN_TOKEN,
      domainPrefix: "sml",
    });
  });

  describe.each(REQUIRED)("%s", (name) => {
    it("is refused when missing, naming it", () => {
      const env: Env = { ...GOOD };
      delete env[name];
      expect(message(() => liveConfig(env))).toContain(name);
    });

    it.each(["", "   "])("is refused when blank (%j)", (blank) => {
      expect(message(() => liveConfig({ ...GOOD, [name]: blank }))).toContain(
        name,
      );
    });

    it("is refused while it is still the .env.example placeholder", () => {
      const placeholder = exampleValues()[name];
      expect(placeholder, `${name} is in .env.example`).toBeTruthy();
      const text = message(() => liveConfig({ ...GOOD, [name]: placeholder }));
      expect(text).toContain(name);
      expect(text).toMatch(/placeholder/i);
      expect(text).not.toContain(placeholder);
    });
  });

  it("names every bad setting at once, not one per restart", () => {
    const text = message(() =>
      liveConfig({ ...GOOD, TIDYHQ_CLIENT_SECRET: "", TIDYHQ_ADMIN_TOKEN: "" }),
    );
    expect(text).toContain("TIDYHQ_CLIENT_SECRET");
    expect(text).toContain("TIDYHQ_ADMIN_TOKEN");
  });

  it("never prints a value, whatever is wrong with it", () => {
    const bad: Env = {
      ...GOOD,
      SESSION_SECRET: "short-secret-xyz",
      TIDYHQ_CLIENT_SECRET: "your-client-secret",
      APP_ORIGIN: "http://insecure-origin.sml-test.invalid",
    };
    const text = message(() => liveConfig(bad));
    for (const name of REQUIRED) {
      expect(text).not.toContain(bad[name] as string);
    }
    expect(text).toContain("SESSION_SECRET");
    expect(text).toContain("APP_ORIGIN");
  });

  it("holds the session secret to 32 characters", () => {
    expect(
      message(() => liveConfig({ ...GOOD, SESSION_SECRET: "a".repeat(31) })),
    ).toContain("SESSION_SECRET");
    expect(() =>
      liveConfig({ ...GOOD, SESSION_SECRET: "a1".repeat(16) }),
    ).not.toThrow();
  });

  describe("APP_ORIGIN", () => {
    it.each([
      "http://checkin.sml-test.invalid",
      "https://checkin.sml-test.invalid/path",
      "https://checkin.sml-test.invalid/?q=1",
      "checkin.sml-test.invalid",
      "ftp://checkin.sml-test.invalid",
    ])("must be a bare https origin: %s", (value) => {
      expect(
        message(() => liveConfig({ ...GOOD, APP_ORIGIN: value })),
      ).toContain("APP_ORIGIN");
    });

    it("must be https even outside production", () => {
      expect(
        message(() =>
          liveConfig({
            ...GOOD,
            NODE_ENV: "development",
            APP_ORIGIN: "http://checkin.sml-test.invalid",
          }),
        ),
      ).toContain("APP_ORIGIN");
    });

    it.each(["http://localhost:3100", "http://127.0.0.1:3100"])(
      "may be plain http for %s",
      (value) => {
        expect(() => liveConfig({ ...GOOD, APP_ORIGIN: value })).not.toThrow();
      },
    );
  });

  describe("optional settings never block startup", () => {
    it.each(["ADMIN_GROUP_ID", "HELPER_GROUP_ID", "COLORS_GROUP_ID"])(
      "%s may be missing, blank or invalid",
      (name) => {
        const missing: Env = { ...GOOD };
        expect(() => liveConfig(missing)).not.toThrow();
        expect(() => liveConfig({ ...GOOD, [name]: "" })).not.toThrow();
        expect(() => liveConfig({ ...GOOD, [name]: "  " })).not.toThrow();
        expect(() => liveConfig({ ...GOOD, [name]: "12/34" })).not.toThrow();
        expect(() =>
          liveConfig({ ...GOOD, [name]: exampleValues()[name] }),
        ).not.toThrow();
      },
    );
  });

  describe("TIDYHQ_DOMAIN_PREFIX", () => {
    it("defaults to sml", () => {
      expect(liveConfig(GOOD).domainPrefix).toBe("sml");
      expect(
        liveConfig({ ...GOOD, TIDYHQ_DOMAIN_PREFIX: " " }).domainPrefix,
      ).toBe("sml");
    });

    it("must be a plain subdomain when set", () => {
      expect(
        message(() =>
          liveConfig({ ...GOOD, TIDYHQ_DOMAIN_PREFIX: "sml.tidyhq.com" }),
        ),
      ).toContain("TIDYHQ_DOMAIN_PREFIX");
    });
  });
});

describe("checkStartupConfig", () => {
  it("checks the live settings only in live mode", () => {
    expect(() =>
      checkStartupConfig({ TIDYHQ_MODE: "mock", NODE_ENV: "development" }),
    ).not.toThrow();
    expect(
      message(() => checkStartupConfig({ ...GOOD, SESSION_SECRET: "" })),
    ).toContain("SESSION_SECRET");
    expect(() => checkStartupConfig(GOOD)).not.toThrow();
  });

  it("still requires TIDYHQ_MODE in production", () => {
    expect(
      message(() => checkStartupConfig({ ...GOOD, TIDYHQ_MODE: "" })),
    ).toContain("TIDYHQ_MODE");
  });

  describe("mock mode in production", () => {
    const mock = {
      TIDYHQ_MODE: "mock",
      NODE_ENV: "production",
      APP_ORIGIN: "https://checkin.sml-test.invalid",
    };

    it("is refused without DEMO_MODE=on, naming both settings", () => {
      const text = message(() => checkStartupConfig(mock));
      expect(text).toContain("TIDYHQ_MODE");
      expect(text).toContain("DEMO_MODE");
    });

    it.each(["", "off", "true", "1"])(
      "is refused with DEMO_MODE=%j",
      (value) => {
        expect(() => checkStartupConfig({ ...mock, DEMO_MODE: value })).toThrow(
          /DEMO_MODE/,
        );
      },
    );

    it("is allowed as a demo with DEMO_MODE=on", () => {
      expect(() =>
        checkStartupConfig({ ...mock, DEMO_MODE: "on" }),
      ).not.toThrow();
    });
  });

  describe("outside production", () => {
    it.each(["development", "test", undefined])(
      "mock mode needs no DEMO_MODE (NODE_ENV=%s)",
      (nodeEnv) => {
        expect(() =>
          checkStartupConfig({ TIDYHQ_MODE: "mock", NODE_ENV: nodeEnv }),
        ).not.toThrow();
      },
    );
  });

  it("refuses a DEMO_MODE it doesn't understand", () => {
    expect(
      message(() =>
        checkStartupConfig({
          TIDYHQ_MODE: "mock",
          NODE_ENV: "development",
          DEMO_MODE: "maybe",
        }),
      ),
    ).toContain("DEMO_MODE");
  });

  it("refuses demo mode with live data: a Demo data banner on real members would lie", () => {
    expect(
      message(() => checkStartupConfig({ ...GOOD, DEMO_MODE: "on" })),
    ).toContain("DEMO_MODE");
  });
});

describe("isDemoMode", () => {
  it("is true only for DEMO_MODE=on", () => {
    expect(isDemoMode({ DEMO_MODE: "on" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "off" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });
});

describe(".env.example", () => {
  const values = exampleValues();

  it.each([
    "TIDYHQ_MODE",
    "APP_ORIGIN",
    "TIDYHQ_CLIENT_ID",
    "TIDYHQ_CLIENT_SECRET",
    "TIDYHQ_DOMAIN_PREFIX",
    "TIDYHQ_ADMIN_TOKEN",
    "SESSION_SECRET",
    "ADMIN_GROUP_ID",
    "HELPER_GROUP_ID",
    "COLORS_GROUP_ID",
    "DEMO_MODE",
  ])("documents %s", (name) => {
    expect(values, name).toHaveProperty(name);
  });

  it("holds no real group ids or secrets: the group ids stay blank", () => {
    for (const name of [
      "ADMIN_GROUP_ID",
      "HELPER_GROUP_ID",
      "COLORS_GROUP_ID",
    ]) {
      expect(values[name], name).toBe("");
    }
    expect(values.DEMO_MODE).toBe("");
  });

  it("as copied, is rejected in live mode", () => {
    const text = message(() =>
      liveConfig({ ...values, TIDYHQ_MODE: "live", NODE_ENV: "production" }),
    );
    for (const name of REQUIRED) expect(text).toContain(name);
  });
});
