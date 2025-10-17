/**
 * Font UserCSS Manager
 *
 * Manages the integration of font-based UserCSS with the existing UserCSS pipeline.
 * Handles creation, installation, and management of font styles through the standard UserCSS system.
 */

import { FontApplication } from "./font-registry";
import {
  FontUserCSSGenerator,
  GeneratedFontUserCSS,
} from "./font-usercss-generator";

export interface FontStyleInstallation {
  fontApplication: FontApplication;
  generatedUserCSS: GeneratedFontUserCSS;
  installationId: string;
  installedAt: Date;
  isActive: boolean;
}

export class FontUserCSSManager {
  private generator: FontUserCSSGenerator;
  private installedFonts: Map<string, FontStyleInstallation> = new Map();

  constructor() {
    this.generator = new FontUserCSSGenerator();
  }

  /**
   * Create and install a font-based UserCSS style
   */
  async installFontStyle(
    fontApplication: FontApplication,
  ): Promise<FontStyleInstallation> {
    try {
      // Generate UserCSS from font application
      const generatedUserCSS = this.generator.generateFontUserCSS({
        fontApplication,
        targetSelector: "body",
        includeFallbacks: true,
        addComments: true,
      });

      // Create installation record
      const installation: FontStyleInstallation = {
        fontApplication,
        generatedUserCSS,
        installationId: generatedUserCSS.meta.id,
        installedAt: new Date(),
        isActive: true,
      };

      // Store the installation
      this.installedFonts.set(installation.installationId, installation);

      // Here we would typically send this to the background script for actual installation
      // For now, we'll just return the installation record
      console.log("[ea] Font style generated and ready for installation:", {
        id: installation.installationId,
        fontName: fontApplication.fontName,
        userCSS: generatedUserCSS.userCSS,
      });

      return installation;
    } catch (error) {
      console.error("Failed to install font style:", error);
      throw new Error(
        `Failed to install font style for ${fontApplication.fontName}: ${error}`,
      );
    }
  }

  /**
   * Remove a font-based UserCSS style
   */
  async removeFontStyle(installationId: string): Promise<boolean> {
    try {
      const installation = this.installedFonts.get(installationId);
      if (!installation) {
        return false;
      }

      // Here we would typically send a removal request to the background script
      console.log("[ea] Font style removal requested:", {
        id: installationId,
        fontName: installation.fontApplication.fontName,
      });

      // Remove from local storage
      this.installedFonts.delete(installationId);

      return true;
    } catch (error) {
      console.error("Failed to remove font style:", error);
      return false;
    }
  }

  /**
   * Get all installed font styles
   */
  getInstalledFontStyles(): FontStyleInstallation[] {
    return Array.from(this.installedFonts.values());
  }

  /**
   * Get a specific font style installation
   */
  getFontStyleInstallation(
    installationId: string,
  ): FontStyleInstallation | undefined {
    return this.installedFonts.get(installationId);
  }

  /**
   * Check if a font is already installed
   */
  isFontInstalled(fontName: string, fontType: "builtin" | "custom"): boolean {
    return Array.from(this.installedFonts.values()).some(
      (installation) =>
        installation.fontApplication.fontName === fontName &&
        installation.fontApplication.fontType === fontType,
    );
  }

  /**
   * Get installation for a specific font
   */
  getFontInstallation(
    fontName: string,
    fontType: "builtin" | "custom",
  ): FontStyleInstallation | undefined {
    return Array.from(this.installedFonts.values()).find(
      (installation) =>
        installation.fontApplication.fontName === fontName &&
        installation.fontApplication.fontType === fontType,
    );
  }

  /**
   * Update an existing font style
   */
  async updateFontStyle(
    installationId: string,
    updates: Partial<FontApplication>,
  ): Promise<FontStyleInstallation | null> {
    try {
      const existingInstallation = this.installedFonts.get(installationId);
      if (!existingInstallation) {
        return null;
      }

      // Create updated font application
      const updatedApplication: FontApplication = {
        ...existingInstallation.fontApplication,
        ...updates,
      };

      // Generate new UserCSS
      const updatedUserCSS = this.generator.generateFontUserCSS({
        fontApplication: updatedApplication,
        targetSelector: "body",
        includeFallbacks: true,
        addComments: true,
      });

      // Update installation
      const updatedInstallation: FontStyleInstallation = {
        ...existingInstallation,
        fontApplication: updatedApplication,
        generatedUserCSS: updatedUserCSS,
        installedAt: new Date(), // Update timestamp
      };

      this.installedFonts.set(installationId, updatedInstallation);

      console.log("[ea] Font style updated:", {
        id: installationId,
        fontName: updatedApplication.fontName,
        updates,
      });

      return updatedInstallation;
    } catch (error) {
      console.error("Failed to update font style:", error);
      return null;
    }
  }

  /**
   * Parse existing UserCSS to extract font information
   */
  parseFontFromUserCSS(userCSS: string): FontApplication | null {
    return this.generator.parseFontUserCSS(userCSS);
  }

  /**
   * Generate UserCSS for a font application (without installing)
   */
  generateFontUserCSS(fontApplication: FontApplication): GeneratedFontUserCSS {
    return this.generator.generateFontUserCSS({
      fontApplication,
      targetSelector: "body",
      includeFallbacks: true,
      addComments: true,
    });
  }

  /**
   * Get statistics about installed font styles
   */
  getFontStyleStats(): {
    total: number;
    active: number;
    builtin: number;
    custom: number;
  } {
    const installations = Array.from(this.installedFonts.values());

    return {
      total: installations.length,
      active: installations.filter((inst) => inst.isActive).length,
      builtin: installations.filter(
        (inst) => inst.fontApplication.fontType === "builtin",
      ).length,
      custom: installations.filter(
        (inst) => inst.fontApplication.fontType === "custom",
      ).length,
    };
  }

  /**
   * Export font styles for backup/restore
   */
  exportFontStyles(): Array<{
    installationId: string;
    fontApplication: FontApplication;
    installedAt: string;
    isActive: boolean;
  }> {
    return Array.from(this.installedFonts.values()).map((installation) => ({
      installationId: installation.installationId,
      fontApplication: installation.fontApplication,
      installedAt: installation.installedAt.toISOString(),
      isActive: installation.isActive,
    }));
  }

  /**
   * Import font styles from backup
   */
  async importFontStyles(
    fontStyles: Array<{
      installationId: string;
      fontApplication: FontApplication;
      installedAt: string;
      isActive: boolean;
    }>,
  ): Promise<void> {
    for (const fontStyle of fontStyles) {
      try {
        // Generate UserCSS for the imported font
        const generatedUserCSS = this.generator.generateFontUserCSS({
          fontApplication: fontStyle.fontApplication,
          targetSelector: "body",
          includeFallbacks: true,
          addComments: true,
        });

        // Create installation record
        const installation: FontStyleInstallation = {
          fontApplication: fontStyle.fontApplication,
          generatedUserCSS,
          installationId: fontStyle.installationId,
          installedAt: new Date(fontStyle.installedAt),
          isActive: fontStyle.isActive,
        };

        this.installedFonts.set(installation.installationId, installation);
      } catch (error) {
        console.error(
          `Failed to import font style ${fontStyle.installationId}:`,
          error,
        );
      }
    }
  }
}

// Export singleton instance
export const fontUserCSSManager = new FontUserCSSManager();
