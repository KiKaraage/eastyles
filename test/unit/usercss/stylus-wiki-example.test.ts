import { parseUserCSS } from "@services/usercss/processor";
import { describe, expect, it } from "vitest";

const stylusWikiExample = `/* ==UserStyle==
@name         test
@description  UserCSS example
@namespace    example.com
@author       me
@version      0.1.0
@preprocessor stylus
@var checkbox fontEnable "Font enabled" 1
@var text     fontSize   "Font size"    2.1em
@var color    fontColor  "Font color"   #123456
@var select   fontName   "Font name"    ["Arial", "Consolas*", "Times New Roman"]
@var select   fontBkgd   "Body background color"   {
  "Near Black": "#111111",
  "Near White*": "#eeeeee"
}
@var text     bkgdImg    "Bkgd image"   "'http://example.com/bkgd.jpg'"
@var text     logoImg    "Logo image"   none
@var number   adOpacity  "Ad opacity"       [0.5, 0, 1, 0.1]
@var range    imgHeight  "Max image height" [50, 10, 200, 10, "px"]
==/UserStyle== */

@-moz-document domain("example.com") {
  if fontEnable {
    body {
      font-size: fontSize !important;
      color: fontColor !important;
      font-family: fontName !important;
      background-color: fontBkgd !important;
      background-image: url(bkgdImg) !important;
    }
    #logo {
      background-image: logoImg !important;
    }
    #ad {
      opacity: adOpacity !important;
    }
    img {
      max-height: imgHeight !important;
    }
  }
}`;

describe("Stylus wiki variable example", () => {
  it("parses all variable types from the documented example", () => {
    const result = parseUserCSS(stylusWikiExample);

    expect(result.errors).toHaveLength(0);
    expect(result.meta.variables).toBeDefined();

    const vars = result.meta.variables!;

    expect(vars.fontEnable).toMatchObject({
      type: "checkbox",
      default: "1",
      value: "1",
    });

    expect(vars.fontSize).toMatchObject({
      type: "text",
      default: "2.1em",
      value: "2.1em",
    });

    expect(vars.fontColor).toMatchObject({
      type: "color",
      default: "#123456",
      value: "#123456",
    });

    expect(vars.fontName).toBeDefined();
    expect(vars.fontName.type).toBe("select");
    expect(vars.fontName.options).toEqual([
      { value: "Arial", label: "Arial" },
      { value: "Consolas", label: "Consolas" },
      { value: "Times New Roman", label: "Times New Roman" },
    ]);
    expect(vars.fontName.default).toBe("Consolas");
    expect(vars.fontName.value).toBe("Consolas");

    expect(vars.fontBkgd).toBeDefined();
    expect(vars.fontBkgd.type).toBe("select");
    expect(vars.fontBkgd.options).toEqual([
      { value: "#111111", label: "Near Black" },
      { value: "#eeeeee", label: "Near White" },
    ]);
    expect(vars.fontBkgd.default).toBe("#eeeeee");
    expect(vars.fontBkgd.value).toBe("#eeeeee");

    expect(vars.bkgdImg).toMatchObject({
      type: "text",
      default: "'http://example.com/bkgd.jpg'",
      value: "'http://example.com/bkgd.jpg'",
    });

    expect(vars.logoImg).toMatchObject({
      type: "text",
      default: "none",
      value: "none",
    });

    expect(vars.adOpacity).toBeDefined();
    expect(vars.adOpacity.type).toBe("number");
    expect(vars.adOpacity.default).toBe("0.5");
    expect(vars.adOpacity.value).toBe("0.5");
    expect(vars.adOpacity.min).toBe(0);
    expect(vars.adOpacity.max).toBe(1);
    expect(vars.adOpacity.step).toBe(0.1);

    expect(vars.imgHeight).toBeDefined();
    expect(vars.imgHeight.type).toBe("range");
    expect(vars.imgHeight.default).toBe("50px");
    expect(vars.imgHeight.value).toBe("50px");
    expect(vars.imgHeight.min).toBe(10);
    expect(vars.imgHeight.max).toBe(200);
    expect(vars.imgHeight.step).toBe(10);
    expect(vars.imgHeight.unit).toBe("px");
  });
});
