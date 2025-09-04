/**
 * Font Selector Component
 *
 * Provides UI for selecting and applying fonts from built-in presets
 * and custom user-installed fonts.
 */

import React, { useState } from "react";
import {
  fontRegistry,
  BuiltInFont,
  CustomFont,
  FontApplication,
} from "../../services/usercss/font-registry";
import { useMessage, SaveMessageType } from "../../hooks/useMessage";
import { useI18n } from "../../hooks/useI18n";

interface FontSelectorProps {
  onFontApplied?: (application: FontApplication) => void;
  onClose?: () => void;
}

export const FontSelector: React.FC<FontSelectorProps> = ({
  onFontApplied,
  onClose,
}) => {
  const { t } = useI18n();
  const { sendMessage } = useMessage();

  const [selectedFont, setSelectedFont] = useState<BuiltInFont | null>(null);
  const [customFontName, setCustomFontName] = useState("");
  const [customFont, setCustomFont] = useState<CustomFont | null>(null);
  const [isCheckingFont, setIsCheckingFont] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [activeTab, setActiveTab] = useState<"builtin" | "custom">("builtin");

  const fontCategories = fontRegistry.getFontCategories();
  const sampleText = fontRegistry.getSampleText();

  // Group fonts by category
  const fontsByCategory = fontCategories.reduce(
    (acc, category) => {
      acc[category] = fontRegistry.getBuiltInFontsByCategory(category);
      return acc;
    },
    {} as Record<string, BuiltInFont[]>,
  );

  const handleBuiltInFontSelect = (font: BuiltInFont) => {
    setSelectedFont(font);
    setCustomFont(null);
    setFontError(null);
  };

  const handleCustomFontCheck = async () => {
    if (!customFontName.trim()) {
      setFontError(t("font.error.emptyName"));
      return;
    }

    setIsCheckingFont(true);
    setFontError(null);

    try {
      const font = await fontRegistry.addCustomFont(customFontName.trim());
      setCustomFont(font);
      setSelectedFont(null);

      if (!font.isAvailable) {
        setFontError(t("font.error.notAvailable", customFontName));
      }
    } catch (error: unknown) {
      setFontError(t("font.error.checkFailed"));
      if (error instanceof Error) {
        console.error("Font check failed:", error.message);
      } else {
        console.error("Font check failed:", error);
      }
    } finally {
      setIsCheckingFont(false);
    }
  };

  const handleApplyFont = async () => {
    const fontToApply = selectedFont || customFont;
    if (!fontToApply) return;

    setIsApplying(true);
    setFontError(null);

    try {
      const application: FontApplication = {
        fontName: fontToApply.name,
        fontType: selectedFont ? "builtin" : "custom",
        targetElements: "body", // Default to body, could be made configurable
        cssRule: "",
      };

      // Generate UserCSS
      const userCSS = fontRegistry.generateFontUserCSS(application);

      // Send to background for parsing and installation
      const result = await sendMessage(SaveMessageType.PARSE_USERCSS, {
        text: userCSS,
        sourceUrl: `eastyles://font/${fontToApply.name}`,
      });

      // Type guard for parseUserCSS result
      if ("success" in result && result.success) {
        // Install the style
        const installResult = await sendMessage(SaveMessageType.INSTALL_STYLE, {
          meta: result.meta!,
          compiledCss: result.css || "",
          variables: [],
        });

        // Type guard for installStyle result
        if ("success" in installResult && installResult.success) {
          onFontApplied?.(application);
          onClose?.();
        } else {
          setFontError(t("font.error.installFailed"));
        }
      } else {
        setFontError(t("font.error.parseFailed"));
      }
    } catch (error: unknown) {
      setFontError(t("font.error.applyFailed"));
      if (error instanceof Error) {
        console.error("Font application failed:", error.message);
      } else {
        console.error("Font application failed:", error);
      }
    } finally {
      setIsApplying(false);
    }
  };

  const canApplyFont = () => {
    if (selectedFont) return true;
    if (customFont && customFont.isAvailable) return true;
    return false;
  };

  return (
    <div className="font-selector p-4 bg-base-100 rounded-lg shadow-lg max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{t("font.selector.title")}</h3>
        <button
          onClick={onClose}
          className="btn btn-sm btn-ghost"
          aria-label={t("closeButton")}
        >
          ✕
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="tabs tabs-boxed mb-4">
        <button
          className={`tab ${activeTab === "builtin" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("builtin")}
        >
          {t("font.tabs.builtin")}
        </button>
        <button
          className={`tab ${activeTab === "custom" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("custom")}
        >
          {t("font.tabs.custom")}
        </button>
      </div>

      {/* Built-in Fonts Tab */}
      {activeTab === "builtin" && (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            {t("font.builtin.description")}
          </p>

          {fontCategories.map((category) => {
            const categoryFonts = fontsByCategory[category];
            if (categoryFonts.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <h4 className="font-medium text-sm capitalize">
                  {t(`font.categories.${category}`)}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {categoryFonts.map((font) => (
                    <div
                      key={font.name}
                      className={`font-sample p-3 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        selectedFont?.name === font.name
                          ? "border-primary bg-primary/10"
                          : "border-base-300 hover:border-primary/50"
                      }`}
                      onClick={() => handleBuiltInFontSelect(font)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleBuiltInFontSelect(font);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title={`${font.name}${font.description ? ` - ${font.description}` : ""}`}
                    >
                      <div
                        className="text-2xl font-bold text-center mb-1"
                        style={{
                          fontFamily: `'${font.name}', ${font.category}`,
                        }}
                      >
                        {sampleText}
                      </div>
                      <div className="text-xs text-center truncate">
                        {font.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Font Tab */}
      {activeTab === "custom" && (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            {t("font.custom.description")}
          </p>

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t("font.custom.inputLabel")}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customFontName}
                onChange={(e) => setCustomFontName(e.target.value)}
                placeholder={t("font.custom.placeholder")}
                className="input input-bordered flex-1"
                onKeyPress={(e) => e.key === "Enter" && handleCustomFontCheck()}
              />
              <button
                onClick={handleCustomFontCheck}
                disabled={isCheckingFont || !customFontName.trim()}
                className="btn btn-primary"
              >
                {isCheckingFont ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  t("font.custom.checkButton")
                )}
              </button>
            </div>
          </div>

          {customFont && (
            <div className="font-preview p-4 border rounded-lg bg-base-50">
              <div className="text-sm mb-2">
                {t("font.custom.previewLabel")}:
              </div>
              <div
                className={`text-xl font-medium ${customFont.isAvailable ? "" : "text-error"}`}
                style={{
                  fontFamily: customFont.isAvailable
                    ? `'${customFont.name}', sans-serif`
                    : "inherit",
                }}
              >
                {customFont.sampleText || customFont.name}
              </div>
              <div className="text-xs mt-2">
                {customFont.isAvailable
                  ? t("font.custom.available")
                  : t("font.custom.notAvailable")}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {fontError && (
        <div className="alert alert-error mt-4">
          <span>{fontError}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onClose}
          className="btn btn-ghost"
          disabled={isApplying}
        >
          {t("cancelButton")}
        </button>
        <button
          onClick={handleApplyFont}
          disabled={!canApplyFont() || isApplying}
          className="btn btn-primary"
        >
          {isApplying ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              {t("font.applying")}
            </>
          ) : (
            t("font.applyButton")
          )}
        </button>
      </div>
    </div>
  );
};
