import { useEffect, useId, useRef, useState } from "react";
import type { BuiltInFont } from "../../services/usercss/font-registry";
import { fontRegistry } from "../../services/usercss/font-registry";

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
  const domainInputId = useId();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const allBuiltInFonts = fontRegistry.getBuiltInFonts();
  const isCustomFont =
    selectedFont && !allBuiltInFonts.some((font) => font.name === selectedFont);
  // Calculate customFontName during rendering instead of using useEffect
  const customFontName = isCustomFont ? selectedFont : "";
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load font CSS for preview
  useEffect(() => {
    const allBuiltInFonts = fontRegistry.getBuiltInFonts();
    const builtInFonts = selectedCategory
      ? allBuiltInFonts.filter((font) => font.category === selectedCategory)
      : allBuiltInFonts;
    const styleId = "font-preview-styles";

    // Remove existing style if any
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = builtInFonts
      .map((font) => {
        const fontPath = `/fonts/${font.file}`;
        return `
        @font-face {
          font-family: '${font.name}';
          src: url('${fontPath}') format('woff2');
          font-weight: ${font.weight};
          font-style: ${font.style};
          font-display: swap;
        }
        .font-preview-${font.name.replace(/\s+/g, "-").toLowerCase()} {
          font-family: '${font.name}', sans-serif;
        }`;
      })
      .join("\n");

    document.head.appendChild(style);

    // Cleanup on unmount
    return () => {
      const styleToRemove = document.getElementById(styleId);
      if (styleToRemove) {
        styleToRemove.remove();
      }
    };
  }, [selectedCategory]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // Add scrollbar hiding styles
      const style = document.createElement("style");
      style.textContent = `
        .font-filter-scroll::-webkit-scrollbar {
          display: none;
        }
      `;
      document.head.appendChild(style);

      // Add horizontal scrolling with mouse wheel
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      };

      container.addEventListener("wheel", handleWheel, { passive: false });

      return () => {
        document.head.removeChild(style);
        container.removeEventListener("wheel", handleWheel);
      };
    }
  }, []);

  const builtInFonts = selectedCategory
    ? allBuiltInFonts.filter((font) => font.category === selectedCategory)
    : allBuiltInFonts;

  return (
    <div className="space-y-4 pt-2">
      <div className="form-control">
        <input
          id={domainInputId}
          type="text"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          placeholder="e.g., example.com (leave empty for all sites)"
          className="input input-bordered w-full focus:outline-none"
        />
      </div>

      <div className="form-control">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto font-filter-scroll"
          style={{
            scrollbarWidth: "none", // Firefox
            msOverflowStyle: "none", // IE/Edge
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`btn btn-sm ${selectedCategory === null ? "btn-primary" : "btn-outline"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedCategory(selectedCategory === "sans" ? null : "sans")
            }
            className={`btn btn-sm ${selectedCategory === "sans" ? "btn-primary" : "btn-outline"}`}
          >
            Sans
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedCategory(selectedCategory === "serif" ? null : "serif")
            }
            className={`btn btn-sm ${selectedCategory === "serif" ? "btn-primary" : "btn-outline"}`}
          >
            Serif
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedCategory(
                selectedCategory === "techno" ? null : "techno",
              )
            }
            className={`btn btn-sm ${selectedCategory === "techno" ? "btn-primary" : "btn-outline"}`}
          >
            Techno
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedCategory(
                selectedCategory === "playful" ? null : "playful",
              )
            }
            className={`btn btn-sm ${selectedCategory === "playful" ? "btn-primary" : "btn-outline"}`}
          >
            Playful
          </button>
          <button
            type="button"
            onClick={() =>
              setSelectedCategory(
                selectedCategory === "custom" ? null : "custom",
              )
            }
            className={`btn btn-sm ${selectedCategory === "custom" ? "btn-primary" : "btn-outline"}`}
          >
            Custom
          </button>
        </div>
      </div>

      {selectedCategory === "custom" ? (
        <div className="space-y-4 pt-2">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Type font name to apply</legend>
            <input
              type="text"
              value={customFontName}
              onChange={(e) => {
                const value = e.target.value;
                setCustomFontName(value);
                if (value.trim()) {
                  onFontChange(value.trim());
                }
              }}
              placeholder="e.g., Arial, Times New Roman"
              className="input w-full focus:outline-none"
            />
          </fieldset>
          <div className="text-center p-4 border rounded-lg">
            <div
              className="text-2xl font-medium"
              style={{
                fontFamily: `'${customFontName || selectedFont}', sans-serif`,
              }}
            >
              The quick brown fox jumps over the lazy dog 0123456789 !@#$%^&*()
            </div>
          </div>
        </div>
      ) : (
        <div className="form-control">
          <div className="grid grid-cols-4 gap-3">
            {builtInFonts.map((font: BuiltInFont) => (
              <button
                key={font.name}
                type="button"
                onClick={() => onFontChange(font.name)}
                className={`card bg-base-100 border-0 transition-colors ${
                  selectedFont === font.name
                    ? "bg-secondary"
                    : "hover:bg-base-200"
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
      )}
    </div>
  );
};

export default NewFontStyle;
