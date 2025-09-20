/**
 * Apply Font Component
 *
 * Simple interface for applying built-in fonts to web pages
 */

import { useState } from "react";
import {
  fontRegistry,
  BuiltInFont,
} from "../../services/usercss/font-registry";
import { useMessage, SaveMessageType } from "../../hooks/useMessage";
import { useI18n } from "../../hooks/useI18n";
import { browser } from "wxt/browser";

interface ApplyFontProps {
  onFontApplied?: (fontName: string) => void;
  onClose?: () => void;
}

const ApplyFont = ({ onFontApplied, onClose }: ApplyFontProps) => {
  const [selectedFont, setSelectedFont] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");

  const { t } = useI18n();
  const { sendMessage } = useMessage();

  const builtInFonts = fontRegistry.getBuiltInFonts();

  // Generate CSS for font injection
  const generateFontCSS = (fontName: string): string => {
    const font = builtInFonts.find((f) => f.name === fontName);
    if (!font) {
      throw new Error(`Font "${fontName}" not found`);
    }

    const fontPath = fontRegistry.getFontFilePath(fontName);
    if (!fontPath) {
      throw new Error(`Font file path not found for "${fontName}"`);
    }

    // Convert relative path to absolute extension URL
    const absoluteFontPath = browser?.runtime?.getURL
      ? browser.runtime.getURL(fontPath as any)
      : fontPath; // Fallback for non-extension environments

    const fontFaceRule = `@font-face {
  font-family: '${fontName}';
  src: url('${absoluteFontPath}') format('woff2');
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: swap;
}`;

    const fontFamilyRule = `html, body, h1, h2, h3, h4, h5, h6, p, span, div, a, button, input, textarea, select, option, label, table, thead, tbody, tfoot, tr, th, td, ul, ol, li, blockquote, pre, code, strong, em, small, sub, sup, mark, del, ins, abbr, acronym, cite, dfn, kbd, samp, var, output, progress, meter, canvas, video, audio, iframe, embed, object, param, source, track, details, summary, menu, menuitem, nav, main, section, article, aside, header, footer, address, figure, figcaption, time, data, datalist, keygen, command, meter, progress, ruby, rt, rp, bdi, bdo, wbr {
  font-family: '${fontName}', sans-serif !important;
}`;

    return `${fontFaceRule}\n\n${fontFamilyRule}`;
  };

  const applyFont = async () => {
    if (!selectedFont) {
      setStatus(t("font_error_selectFont"));
      return;
    }

    setIsLoading(true);
    setStatus(t("font_applying"));

    try {
      // Generate the font CSS directly
      const fontCss = generateFontCSS(selectedFont);

      // Send to background for direct injection
      const result = await sendMessage(SaveMessageType.INJECT_FONT, {
        fontName: selectedFont,
        css: fontCss,
      });

      if ("success" in result && result.success) {
        setStatus(t("font_applied", selectedFont));
        onFontApplied?.(selectedFont);
        // Close after a short delay to show success message
        setTimeout(() => {
          onClose?.();
        }, 1500);
      } else {
        const errorMsg =
          "error" in result && result.error
            ? result.error
            : t("font_error_applyFailed");
        setStatus(`Failed to apply font: ${errorMsg}`);
      }
    } catch (error) {
      console.error("Font application failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setStatus(`Failed to apply font: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="apply-font p-6 bg-base-100 rounded-lg max-w-md mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t("font_applyTitle")}</h2>
        <button
          onClick={onClose}
          className="btn btn-sm btn-ghost"
          aria-label={t("closeButton")}
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t("font_selectLabel")}</span>
          </label>
          <select
            value={selectedFont}
            onChange={(e) => {
              setSelectedFont(e.target.value);
              setStatus(""); // Clear status when selection changes
            }}
            disabled={isLoading}
            className="select select-bordered w-full"
          >
            <option value="">{t("font_selectPlaceholder")}</option>
            {builtInFonts.map((font: BuiltInFont) => (
              <option key={font.name} value={font.name}>
                {font.name} (
                {t(`font_categories_${font.category.replace(/-/g, "_")}`)})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={applyFont}
          disabled={!selectedFont || isLoading}
          className="btn btn-primary w-full"
        >
          {isLoading ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              {t("font_applying")}
            </>
          ) : (
            t("font_applyButton")
          )}
        </button>

        {status && (
          <div
            className={`alert ${status.includes("error") || status.includes("failed") ? "alert-error" : "alert-success"}`}
          >
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApplyFont;
