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

  it("should process a Less UserCSS with variables", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Less Style with Variables
@namespace test
@version 1.0.0
@description A test style with Less and variables
@preprocessor less
@var color bgColor "Background Color" #ff0000
@var checkbox enableBorder "Enable Border" 1
@var text fontSize "Font Size" "14px"
==/UserStyle== */

body {
  background: @bgColor;
  font-size: @fontSize;
  .border-mixin() when (@enableBorder = 1) {
    border: 1px solid #000;
  }
  .border-mixin();
}`;

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(0);
    expect(result.meta.name).toBe("Test Less Style with Variables");
    expect(result.meta.variables).toBeDefined();
    expect(result.meta.variables!["bgColor"]).toBeDefined();
    expect(result.meta.variables!["enableBorder"]).toBeDefined();
    expect(result.meta.variables!["fontSize"]).toBeDefined();
    expect(result.compiledCss).toContain("background: #ff0000");
    expect(result.compiledCss).toContain("font-size: 14px");
    expect(result.compiledCss).toContain("border: 1px solid #000");
  });

  it("should process a Stylus UserCSS", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Stylus Style
@namespace test
@version 1.0.0
@description A test style with Stylus
@preprocessor stylus
==/UserStyle== */

body
  background: #ff0000`;

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(0);
    expect(result.meta.name).toBe("Test Stylus Style");
    expect(result.compiledCss).toContain("background: #f00");
  });

  it("should process a Stylus UserCSS with variables", async () => {
    const rawCSS = `/* ==UserStyle==
@name Test Stylus Style with Variables
@namespace test
@version 1.0.0
@description A test style with Stylus and variables
@preprocessor stylus
@var color bgColor "Background Color" #ff0000
@var checkbox enableBorder "Enable Border" 1
@var text fontSize "Font Size" "14px"
==/UserStyle== */

body
  background: bgColor
  font-size: fontSize
  if enableBorder
    border: 1px solid #000`;

    const result = await processUserCSS(rawCSS);
    expect(result.errors).toHaveLength(0);
    expect(result.preprocessorErrors).toHaveLength(0);
    expect(result.meta.name).toBe("Test Stylus Style with Variables");
    expect(result.meta.variables).toBeDefined();
    expect(result.meta.variables!["bgColor"]).toBeDefined();
    expect(result.meta.variables!["enableBorder"]).toBeDefined();
    expect(result.meta.variables!["fontSize"]).toBeDefined();
    expect(result.compiledCss).toContain("background: #f00");
    expect(result.compiledCss).toContain("font-size: 14px");
    expect(result.compiledCss).toContain("border: 1px solid #000");
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
