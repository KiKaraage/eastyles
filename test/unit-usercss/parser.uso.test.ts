import { parseUserCSS } from "@services/usercss/processor";
import { describe, expect, it } from "vitest";

const usoExample = `/* ==UserStyle==
@name         Example Custom Layout
@namespace    sanitized.example
@version      1.0.0
@description  "Demonstration of USO dropdown variables"
@author       Example Author
@license      CC0-1.0
@preprocessor uso

@advanced	dropdown	bg			"Background" {
	bg-default	"Sky Default*"	<<<EOT https://assets.example.com/backgrounds/sky-default.jpg EOT;
	bg-gradient	"Soft Gradient"	<<<EOT https://assets.example.com/backgrounds/soft-gradient.jpg EOT;
	bg-grid		"Angular Grid"	<<<EOT https://assets.example.com/backgrounds/angular-grid.png EOT;
	bg-custom	"Custom Upload"	<<<EOT /*[[bg-custom]]*\/ EOT;
	icon-custom 	"Custom"		<<<EOT /*[[icon-custom]]*\/ EOT;
}
@advanced	text		bg-custom	"Custom Background"		"https://assets.example.com/backgrounds/custom-placeholder.jpg"
@advanced	color		bg-overlay	"Background Overlay"	#112233aa
@advanced 	dropdown	bg-blur 	"Background Blur" {
	blur-off	"No Blur*"		<<<EOT EOT;
	blur-soft	"Soft"			<<<EOT backdrop-filter: blur(4px); EOT;
	blur-strong	"Strong"		<<<EOT backdrop-filter: blur(10px); EOT;
}
@advanced	color		theme-color	"Theme Accent" 	#5599cc
@advanced	dropdown	icon		"Icon Style" {
	icon-default	"Default*"		<<<EOT https://assets.example.com/icons/default.png EOT;
	icon-outline	"Outline"		<<<EOT https://assets.example.com/icons/outline.png EOT;
	icon-filled 	"Filled"		<<<EOT https://assets.example.com/icons/filled.png EOT;
	icon-custom 	"Custom"		<<<EOT /*[[icon-custom]]*/ EOT;
}
@advanced 	text 		icon-custom	"Custom Icon"		"https://assets.example.com/icons/custom.png"
@advanced	dropdown	top-bar		"Top Bar Display" {
	top-bar-show "Show*"		<<<EOT EOT;
	top-bar-hide "Hide"		<<<EOT
		:root { --demo-top-bar: none; }
		EOT;
}
@advanced 	dropdown	font 		"Font Selection" {
	font-system	"System*"		<<<EOT System Default EOT;
	font-sans 	"Sans Serif"	<<<EOT Example Sans EOT;
	font-mono 	"Monospace"	<<<EOT Example Mono EOT;
}

==/UserStyle== */`;

describe("USO dropdown example", () => {
  it("detects dropdown variables and options", () => {
    const result = parseUserCSS(usoExample);

    expect(result.errors).toHaveLength(0);
    expect(result.meta.variables).toBeDefined();

    const vars = result.meta.variables!;
    expect(Object.keys(vars).length).toBeGreaterThan(0);
    expect(vars.bg?.type).toBe("select");
    expect(vars.bg?.options?.length).toBeGreaterThan(2);
  });
});
