import { useEffect } from "react";
import {
  fontRegistry,
  BuiltInFont,
} from "../../services/usercss/font-registry";

interface NewFontStyleProps {
  domain: string;
  selectedFont: string;
  onDomainChange: (domain: string) => void;
  onFontChange: (fontName: string) => void;
  onClose: () => void;
}

const NewFontStyle: React.FC<NewFontStyleProps> = ({
  domain,
  selectedFont,
  onDomainChange,
  onFontChange,
  onClose: _onClose,
}) => {
  // Load font CSS for preview
  useEffect(() => {
    const builtInFonts = fontRegistry.getBuiltInFonts();
    const styleId = "font-preview-styles";

    // Remove existing style if any
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create CSS for all built-in fonts
    const cssRules = builtInFonts
      .map((font: BuiltInFont) => {
        const fontPath = fontRegistry.getFontFilePath(font.name);
        if (!fontPath) return "";

        return `
        @font-face {
          font-family: '${font.name}';
          src: url('${fontPath}') format('woff2');
          font-weight: ${font.weight};
          font-style: ${font.style};
          font-display: swap;
        }
      `;
      })
      .join("\n");

    // Add style to head
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = cssRules;
    document.head.appendChild(style);

    // Cleanup on unmount
    return () => {
      const styleToRemove = document.getElementById(styleId);
      if (styleToRemove) {
        styleToRemove.remove();
      }
    };
  }, []);

  const builtInFonts = fontRegistry.getBuiltInFonts();

  return (
    <div className="space-y-4">
      <div className="form-control pt-2">
        <input
          id="domain-input"
          type="text"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          placeholder="e.g., example.com (leave empty for all sites)"
          className="input input-bordered w-full focus:outline-none"
        />
      </div>

      <div className="form-control">
        <div className="grid grid-cols-4 gap-3">
          {builtInFonts.map((font: BuiltInFont) => (
            <button
              key={font.name}
              type="button"
              onClick={() => onFontChange(font.name)}
               className={`card bg-base-100 border-0 transition-colors ${
                 selectedFont === font.name ? "bg-secondary" : "hover:bg-base-200"
               }`}
            >
              <div className="card-body pt-3 pb-2 px-2 text-center">
                <div
                  className={`text-2xl font-medium ${selectedFont === font.name ? "text-secondary-content" : ""}`}
                  style={{ fontFamily: `'${font.name}', ${font.category}` }}
                  title={font.name}
                >
                  Abc
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NewFontStyle;
