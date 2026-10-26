import { describe, expect, it } from "vitest";
import { screenText } from "./screenText";

describe("screenText", () => {
  it("keeps string literals, template text and JSX text", () => {
    const code = `
      const a = "plain string";
      const b = \`template \${x} tail\`;
      export const C = () => <p>Jsx text</p>;
    `;
    const text = screenText(code);
    expect(text).toContain("plain string");
    expect(text).toContain("template");
    expect(text).toContain("tail");
    expect(text).toContain("Jsx text");
  });

  it("drops line, block and JSX comments", () => {
    const code = `
      // Search again (line comment)
      /* already checked in (block comment) */
      /** Next member (doc comment) */
      export const C = () => <p>{/* Pay on TidyHQ (jsx comment) */}Shown</p>;
    `;
    const text = screenText(code);
    expect(text).toContain("Shown");
    for (const gone of [
      "Search again",
      "already checked in",
      "Next member",
      "Pay on TidyHQ",
    ]) {
      expect(text).not.toContain(gone);
    }
  });

  it("keeps a // inside a string, such as a URL", () => {
    expect(screenText(`const u = "https://example.com/x";`)).toContain(
      "https://example.com/x",
    );
  });
});
