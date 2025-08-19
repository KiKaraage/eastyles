import { describe, it, expect } from "vitest";
import { processUserCSS } from "@services/usercss/processor";

describe("UserCSS Full Pipeline Processor", () => {
  it("should process a plain CSS UserCSS", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Style
@namespace test
@version 1.0.0
@description A test style
==/UserStyle== */

body {
  background: red;
}`;

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(0);
    expect(result.meta.name).toBe("Test Style");
    expect(result.compiledCss).toContain("background: red");
  });

  it("should process a Less UserCSS", async () => {
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

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(0);
    expect(result.meta.name).toBe("Test Less Style");
    expect(result.compiledCss).toContain("background: #ff0000");
  });

  it("should handle parsing errors", async () => {
    const rawCSS = `/* ==UserStyle==
@namespace test
@version 1.0.0
@description A test style with missing name
==/UserStyle== */

body {
  background: red;
}`;

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Missing required @name directive");
    expect(result.compiledCss).toBe("");
  });

  it("should handle preprocessing errors", async () => {
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

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(1);
    expect(result.preprocessorErrors[0]).toContain("Less compilation failed");
  });
});