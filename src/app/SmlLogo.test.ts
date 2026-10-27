import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SmlLogo } from "./SmlLogo";

const render = (props: Parameters<typeof SmlLogo>[0]) =>
  renderToStaticMarkup(createElement(SmlLogo, props));

describe("SmlLogo", () => {
  it("picks the file by variant and sets the 2.1:1 size", () => {
    const black = render({ variant: "black" });
    const white = render({ variant: "white" });
    expect(black).toContain('src="/brand/sml-logo-black.png"');
    expect(white).toContain('src="/brand/sml-logo-white.png"');
    for (const html of [black, white]) {
      expect(html).toContain('width="210"');
      expect(html).toContain('height="100"');
    }
  });

  it("is named by default and empty-alt when decorative", () => {
    expect(render({ variant: "black" })).toContain(
      'alt="Seattle Men in Leather"',
    );
    expect(render({ variant: "black", decorative: true })).toContain('alt=""');
  });

  it("passes the class name through", () => {
    expect(render({ variant: "white", className: "h-10 w-auto" })).toContain(
      'class="h-10 w-auto"',
    );
  });
});
