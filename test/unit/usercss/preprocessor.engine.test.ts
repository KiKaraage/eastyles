import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PreprocessorEngine,
  PreprocessorType,
} from "../../../services/usercss/preprocessor";

// Mock modules at the top level
const mockLessRender = vi.fn();
const mockStylusRender = vi.fn();

vi.mock("less", () => ({
  default: {
    render: mockLessRender,
  },
}));

vi.mock("stylus", () => ({
  default: {
    render: mockStylusRender,
  },
}));

describe("PreprocessorEngine", () => {
  let engine: PreprocessorEngine;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    engine = new PreprocessorEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("process method - none engine", () => {
    it("should pass through CSS when engine is none", async () => {
      const inputCss = `
.container {
  color: red;
  background: blue;
}
`;

      const result = await engine.process(inputCss, "none");

      expect(result.css).toBe(inputCss);
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should preserve content", async () => {
      const inputCss = `  .container {
    color: red;
  }
  `;

      const result = await engine.process(inputCss, "none");

      expect(result.css).toBe(inputCss);
    });
  });

  describe("process method - Less engine", () => {
    it("should compile Less variables", async () => {
      const inputCss = `
@primary-color: #333;
@font-size: 16px;

.container {
  color: @primary-color;
  font-size: @font-size;
}
`;

      // Mock successful Less compilation
      mockLessRender.mockResolvedValue({
        css: `.container {
  color: #333;
  font-size: 16px;
}`,
        imports: [],
        map: null,
        references: [],
      });

      const result = await engine.process(inputCss, "less");

      expect(mockLessRender).toHaveBeenCalledWith(inputCss);
      expect(result.css).toContain("color: #333");
      expect(result.css).toContain("font-size: 16px");
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should handle Less compilation warnings", async () => {
      const inputCss = `
.container {
  color: red;
}
`;

      // Mock Less compilation with warnings
      mockLessRender.mockResolvedValue({
        css: `.container {
  color: red;
}`,
        imports: [],
        map: null,
        references: [],
        warnings: [
          {
            type: "Warning",
            message: "Unused variable @unused",
            index: 10,
            line: 2,
            column: 1,
            filename: null,
            callLine: null,
            callExtract: null,
            file: null,
          },
        ],
      });

      const result = await engine.process(inputCss, "less");

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Warning: Unused variable @unused");
    });

    it("should handle Less compilation errors", async () => {
      const inputCss = `
.container {
  color: @undefined-var;
}
`;

      // Mock Less compilation error
      const error = new Error(
        "variable @undefined-var is undefined",
      ) as Error & {
        line: number;
        column: number;
      };
      error.line = 2;
      error.column = 10;
      mockLessRender.mockRejectedValue(error);

      const result = await engine.process(inputCss, "less");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Less compilation failed: variable @undefined-var is undefined",
      );
      expect(result.errors[0]).toContain("Line 2, Column 10");
    });

    it("should handle Less plugin errors", async () => {
      const inputCss = `
.container {
  color: red;
}
`;

      // Mock Less compilation with plugin error
      const error = new Error("Plugin error: custom plugin failed") as Error & {
        line: number;
        column: number;
        filename: string;
      };
      error.line = 1;
      error.column = 1;
      error.filename = "plugin.js";
      mockLessRender.mockRejectedValue(error);

      const result = await engine.process(inputCss, "less");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Less compilation failed: Plugin error: custom plugin failed",
      );
      expect(result.errors[0]).toContain("plugin.js");
    });
  });

  describe("process method - Stylus engine", () => {
    it("should compile Stylus variables", async () => {
      const inputCss = `
primary-color = #333
font-size = 16px

.container
  color primary-color
  font-size font-size
`;

      // Mock successful Stylus compilation
      const stylusPromise = Promise.resolve(`.container {
  color: #333;
  font-size: 16px;
}`);
      mockStylusRender.mockImplementation(
        (text: string, callback: (err: null, css: string) => void) => {
          stylusPromise.then((css) => {
            callback(null, css);
          });
        },
      );

      const result = await engine.process(inputCss, "stylus");

      expect(mockStylusRender).toHaveBeenCalledWith(
        inputCss,
        expect.any(Function),
      );
      expect(result.css).toContain("color: #333");
      expect(result.css).toContain("font-size: 16px");
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should handle Stylus compilation warnings", async () => {
      const inputCss = `
.container
  color red
`;

      // Mock Stylus compilation
      const stylusPromise = Promise.resolve(`.container {
  color: red;
}`);
      mockStylusRender.mockImplementation(
        (text: string, callback: (err: null, css: string) => void) => {
          stylusPromise.then((css) => {
            callback(null, css);
          });
        },
      );

      const result = await engine.process(inputCss, "stylus");

      // Stylus typically doesn't provide warnings in the same way as Less
      expect(result.css).toContain("color: red");
      expect(result.warnings).toEqual([]);
    });

    it("should handle Stylus compilation errors", async () => {
      const inputCss = `
.container
  color undefined-var
`;

      // Mock Stylus compilation error
      const error = new Error(
        'variable "undefined-var" is not defined',
      ) as Error & {
        line: number;
        column: number;
      };
      error.line = 2;
      error.column = 3;
      const stylusPromise = Promise.reject(error);
      mockStylusRender.mockImplementation(
        (text: string, callback: (err: Error) => void) => {
          stylusPromise.catch((err) => {
            callback(err);
          });
        },
      );

      const result = await engine.process(inputCss, "stylus");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        'Stylus compilation failed: variable "undefined-var" is not defined',
      );
      expect(result.errors[0]).toContain("Line 2, Column 3");
    });

    it("should handle Stylus syntax errors", async () => {
      const inputCss = `
.container
  color red
  missing-colon
`;

      // Mock Stylus syntax error
      const error = new Error("SyntaxError: Expected ':'") as Error & {
        line: number;
        column: number;
      };
      error.line = 3;
      error.column = 3;
      const stylusPromise = Promise.reject(error);
      mockStylusRender.mockImplementation(
        (text: string, callback: (err: Error) => void) => {
          stylusPromise.catch((err) => {
            callback(err);
          });
        },
      );

      const result = await engine.process(inputCss, "stylus");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Stylus compilation failed: SyntaxError: Expected ':'",
      );
      expect(result.errors[0]).toContain("Line 3, Column 3");
    });
  });

  describe("LRU cache functionality", () => {
    beforeEach(() => {
      // Reset cache for each cache test with small size
      engine = new PreprocessorEngine(2);
    });

    it("should cache compilation results", async () => {
      const inputCss = "@color: #333;";
      const compiledCss = ".container { color: #333; }";

      // Mock successful compilation
      mockLessRender.mockResolvedValue({
        css: compiledCss,
        imports: [],
        map: null,
        references: [],
      });

      // First call - should compile
      const result1 = await engine.process(inputCss, "less");

      // Second call with same input - should use cache
      const result2 = await engine.process(inputCss, "less");

      // Should only call render once due to caching
      expect(mockLessRender).toHaveBeenCalledTimes(1);

      // Results should be identical
      expect(result1.css).toBe(result2.css);
      expect(result1.warnings).toEqual(result2.warnings);
      expect(result1.errors).toEqual(result2.errors);
    });

    it("should have separate caches for different engines", async () => {
      const lessInput = "@color: #333;";
      const stylusInput = "$color: #333;";

      // Mock both compilers
      mockLessRender.mockResolvedValue({
        css: ".less { color: #333; }",
        imports: [],
        map: null,
        references: [],
      });

      const stylusPromise = Promise.resolve(`.stylus {
  color: #333;
}`);
      mockStylusRender.mockImplementation(
        (text: string, callback: (err: null, css: string) => void) => {
          stylusPromise.then((css) => {
            callback(null, css);
          });
        },
      );

      // Process with different engines
      await engine.process(lessInput, "less");
      await engine.process(stylusInput, "stylus");

      // Both should have been compiled (not cached)
      expect(mockLessRender).toHaveBeenCalledTimes(1);
      expect(mockStylusRender).toHaveBeenCalledTimes(1);
    });

    it("should not cache different content", async () => {
      const input1 = "@color: #333;";
      const input2 = "@color: #666;";

      // Mock successful compilation
      mockLessRender
        .mockResolvedValueOnce({
          css: ".color1 { color: #333; }",
          imports: [],
          map: null,
          references: [],
        })
        .mockResolvedValueOnce({
          css: ".color2 { color: #666; }",
          imports: [],
          map: null,
          references: [],
        });

      // Process different inputs
      await engine.process(input1, "less");
      await engine.process(input2, "less");

      // Should compile both separately
      expect(mockLessRender).toHaveBeenCalledTimes(2);
    });

    it("should evict old entries when cache is full", async () => {
      const input1 = "@color1: #333;";
      const input2 = "@color2: #666;";
      const input3 = "@color3: #999;";

      // Mock successful compilation
      mockLessRender
        .mockResolvedValueOnce({
          css: ".color1 { color: #333; }",
          imports: [],
          map: null,
          references: [],
        })
        .mockResolvedValueOnce({
          css: ".color2 { color: #666; }",
          imports: [],
          map: null,
          references: [],
        })
        .mockResolvedValueOnce({
          css: ".color3 { color: #999; }",
          imports: [],
          map: null,
          references: [],
        })
        .mockResolvedValueOnce({
          css: ".color1 { color: #333; }",
          imports: [],
          map: null,
          references: [],
        });

      // Fill cache
      await engine.process(input1, "less");
      await engine.process(input2, "less");

      // Add third entry - should evict oldest
      await engine.process(input3, "less");

      // Add first entry again - should recompile (was evicted)
      await engine.process(input1, "less");

      // Should have compiled 4 times (input1, input2, input3, input1 again)
      expect(mockLessRender).toHaveBeenCalledTimes(4);
    });
  });

  describe("edge cases", () => {
    it("should handle empty input gracefully", async () => {
      const result = await engine.process("", "less");

      expect(result.css).toBe("");
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should handle whitespace-only input", async () => {
      const result = await engine.process("   \n  \t  ", "less");

      expect(result.css).toBe("   \n  \t  ");
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should handle complex nested Less structures", async () => {
      const inputCss = `
@primary: #333;
@secondary: #666;

.button {
  background: @primary;
  padding: 10px;

  &:hover {
    background: darken(@primary, 10%);
  }

  &-primary {
    background: @primary;
  }

  &-secondary {
    background: @secondary;
  }
}
`;

      // Mock successful compilation
      mockLessRender.mockResolvedValue(`.button {
  background: #333;
  padding: 10px;
}
.button:hover {
  background: #300;
}
.button-primary {
  background: #333;
}
.button-secondary {
  background: #666;
}`);

      const result = await engine.process(inputCss, "less");

      expect(result.css).toContain("background: #333");
      expect(result.css).toContain("background: #666");
      expect(result.errors).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should handle preprocessor module import errors", async () => {
      const inputCss = `
.container {
  color: red;
}
`;

      // Temporarily replace the mock to simulate import failure
      const originalMock = mockLessRender;
      mockLessRender.mockRejectedValue(new Error("Module not found"));

      const result = await engine.process(inputCss, "less");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Failed to process with less: Module not found",
      );

      // Restore original mock
      mockLessRender.mockImplementation(originalMock);
    });

    it("should handle unknown preprocessor types gracefully", async () => {
      const inputCss = `
.container {
  color: red;
}
`;

      const result = await engine.process(
        inputCss,
        "unknown" as PreprocessorType,
      );

      expect(result.css).toBe(inputCss);
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });
});
