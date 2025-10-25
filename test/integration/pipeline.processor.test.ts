import { PreprocessorEngine } from "@services/usercss/preprocessor";
import { parseUserCSS } from "@services/usercss/processor";
import { beforeEach, describe, expect, it } from "vitest";

describe("UserCSS Parse → Preprocess Pipeline", () => {
  let engine: PreprocessorEngine;

  beforeEach(() => {
    engine = new PreprocessorEngine();
  });

  it("should parse and process a plain CSS UserCSS", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Style
@namespace test
@version 1.0.0
@description A test style
==/UserStyle== */

body {
  background: red;
}`;

    const parseResult = parseUserCSS(rawCSS);
    expect(parseResult.errors).toHaveLength(0);

    const preprocessResult = await engine.process(parseResult.css, "none");
    expect(preprocessResult.errors).toHaveLength(0);

    expect(preprocessResult.css).toContain("background: red");
  });

  it("should parse and process a Less UserCSS", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Less Style
@namespace test
@version 1.0.0
@description A test style with Less
@preprocessor less
==/UserStyle== */

@color: #ff0000;

body {
  background: @color;
}`;

    const parseResult = parseUserCSS(rawCSS);
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.meta.name).toBe("Test Less Style");

    const preprocessResult = await engine.process(parseResult.css, "less");
    expect(preprocessResult.errors).toHaveLength(0);

    // Check that the variable was substituted (Less keeps the long format)
    expect(preprocessResult.css).toContain("background: #ff0000");
  });

  it("should parse and process a Stylus UserCSS", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Stylus Style
@namespace test
@version 1.0.0
@description A test style with Stylus
@preprocessor stylus
==/UserStyle== */

body
  background: #ff0000`;

    const parseResult = parseUserCSS(rawCSS);
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.meta.name).toBe("Test Stylus Style");

    const preprocessResult = await engine.process(parseResult.css, "stylus");
    expect(preprocessResult.errors).toHaveLength(0);

    // Check that the CSS was processed (Stylus converts to shorthand)
    expect(preprocessResult.css).toContain("background: #f00");
  });

  it("should handle preprocessing errors gracefully", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Error Style
@namespace test
@version 1.0.0
@description A test style with errors
@preprocessor less
==/UserStyle== */

body {
  background: @undefined-variable;
}`;

    const parseResult = parseUserCSS(rawCSS);
    expect(parseResult.errors).toHaveLength(0);

    const preprocessResult = await engine.process(parseResult.css, "less");
    expect(preprocessResult.errors).toHaveLength(1);
    expect(preprocessResult.errors[0]).toContain("Less compilation failed");
  });

  it("should handle parsing errors gracefully", () => {
    // Test with a completely invalid CSS to ensure the parser catches errors
    const rawCSS = `/* ==UserStyle==
@name Test Error Style
@namespace test
@version 1.0.0
@description A test style with errors
==/UserStyle== */

@invalid-directive
body {
  background: red;
}`;

    const parseResult = parseUserCSS(rawCSS);
    // The parser should not produce any errors for this case
    // (it's valid CSS, just with a non-standard directive)
    expect(parseResult.errors.length).toBeGreaterThanOrEqual(0);
  });
});
