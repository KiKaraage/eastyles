import { describe, expect, it } from "vitest";
import { detectPreprocessor } from "../../../services/usercss/preprocessor";

describe("detectPreprocessor", () => {
  describe("explicit metadata tag", () => {
    it("detects less from explicit @preprocessor less", () => {
      const css = `/* @preprocessor less */
@color: #333;
.container {
  color: @color;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("metadata");
      expect(result.confidence).toBe(1.0);
    });

    it("detects stylus from explicit @preprocessor stylus", () => {
      const css = `/* @preprocessor stylus */
color = #333
.container
  color color`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("metadata");
      expect(result.confidence).toBe(1.0);
    });

    it("returns none for unknown preprocessor", () => {
      const css = `/* @preprocessor unknown */
.container {
  color: red;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("none");
      expect(result.source).toBe("metadata");
      expect(result.confidence).toBe(0.5);
    });
  });

  describe("heuristic detection", () => {
    it("detects less from @import", () => {
      const css = `@import "styles.less";
.container {
  color: @color;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("heuristic");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("detects less from @extend", () => {
      const css = `.button {
  color: blue;
}
.button-extend {
  @extend .button;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("heuristic");
    });

    it("detects less from @mixin", () => {
      const css = `@mixin box-shadow($shadow) {
  box-shadow: $shadow;
}
.button {
  @include box-shadow(0 2px 4px rgba(0,0,0,0.2));
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("heuristic");
    });

    it("detects less from mixin syntax", () => {
      const css = `.btn {
  background: blue;
}
.btn-primary {
  .btn();
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("heuristic");
    });

    it("detects stylus from parent selector (&)", () => {
      const css = `a
  color: blue
  &:hover
    color: red`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("heuristic");
    });

    it("detects stylus from single line comments", () => {
      const css = `// Stylus comment
color = #333
.container
  color color`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("heuristic");
    });

    it("detects stylus from property access", () => {
      const css = `colors = { red: #f00 }
.container
  color colors.red`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("heuristic");
    });

    it("detects stylus from unless", () => {
      const css = `$var = true
.container
  unless $var
    display: none`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("heuristic");
    });

    it("detects stylus from if", () => {
      const css = `$var = true
.container
  if $var
    display: block`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("stylus");
      expect(result.source).toBe("heuristic");
    });
  });

  describe("edge cases and conflicts", () => {
    it("prioritizes explicit metadata over heuristics", () => {
      const css = `/* @preprocessor less */
// Stylus comment that would trigger stylus detection
.container {
  color: @var;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("metadata");
      expect(result.confidence).toBe(1.0);
    });

    it("handles both patterns but prioritizes less when scores are similar", () => {
      const css = `@import "styles.less"; // triggers less
&:hover // triggers stylus
  color: red`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("less");
      expect(result.source).toBe("heuristic");
    });

    it("returns none when no patterns match", () => {
      const css = `.container {
  color: red;
  background: blue;
}`;
      const result = detectPreprocessor(css);
      expect(result.type).toBe("none");
      expect(result.source).toBeUndefined();
      expect(result.confidence).toBe(0);
    });

    it("handles empty string", () => {
      const result = detectPreprocessor("");
      expect(result.type).toBe("none");
      expect(result.source).toBeUndefined();
      expect(result.confidence).toBe(0);
    });

    it("handles whitespace-only string", () => {
      const result = detectPreprocessor("   \n  \t  ");
      expect(result.type).toBe("none");
      expect(result.source).toBeUndefined();
      expect(result.confidence).toBe(0);
    });
  });

  describe("confidence scoring", () => {
    it("returns higher confidence for more less patterns", () => {
      const css1 = `@import "styles.less";
.container {
  color: red;
}`;
      const css2 = `@import "styles.less";
@extend .base;
.container {
  @mixin mixin;
  color: @var;
}`;

      const result1 = detectPreprocessor(css1);
      const result2 = detectPreprocessor(css2);

      expect(result2.confidence).toBeGreaterThan(result1.confidence);
      expect(result1.type).toBe("less");
      expect(result2.type).toBe("less");
    });

    it("caps confidence at 0.9 for heuristics", () => {
      const css = `@import "styles.less";
@extend .base;
@mixin mixin;
.container {
  .mixin();
  color: @var;
}`;
      const result = detectPreprocessor(css);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });
  });
});
