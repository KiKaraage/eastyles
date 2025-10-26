/**
 * Variable Persistence Service
 *
 * Handles saving and broadcasting UserCSS variable changes.
 * Integrates with StorageClient for persistence and MessageBus for real-time updates.
 */

import { storageClient } from "../storage/client";
import { VariableDescriptor } from "../usercss/types";
import { type BroadcastService, broadcastService } from "./broadcast-service";
// NOTE: Don't import processUserCSS at module level - it accesses DOM
// We'll import it dynamically when needed

export interface VariableUpdate {
  styleId: string;
  variables: Record<string, string>;
}

export interface VariableChangeCallback {
  (update: VariableUpdate): void;
}

/**
 * Service for managing UserCSS variable persistence and broadcasting
 */
export class VariablePersistenceService {
  private watchers = new Set<VariableChangeCallback>();
  private broadcastService: BroadcastService;

  constructor(broadcastServiceInstance: BroadcastService = broadcastService) {
    this.broadcastService = broadcastServiceInstance;
  }

  /**
   * Update variables for a specific UserCSS style
   */
  async updateVariables(
    styleId: string,
    variables: Record<string, string>,
  ): Promise<void> {
    try {
      console.log("[VariablePersistenceService] Updating variables:", {
        styleId,
        variables,
        timestamp: new Date().toISOString(),
      });

      // Update the style in storage
      console.log(
        "[VariablePersistenceService] Calling storageClient.updateUserCSSStyleVariables",
      );
      const updatedStyle = await storageClient.updateUserCSSStyleVariables(
        styleId,
        variables,
      );
      console.log(
        "[VariablePersistenceService] Style variables updated in storage:",
        {
          styleId,
          styleName: updatedStyle.name,
          updatedVariables: Object.keys(variables),
        },
      );

      // Check if this is a preprocessed style and re-process with new variables
      // Skip reprocessing in background context where DOM is not available
      // In service worker context, we should never reprocess CSS that requires DOM
      const isServiceWorkerContext =
        typeof globalThis !== "undefined" &&
        typeof globalThis.document === "undefined";

      if (
        updatedStyle.source.includes("@preprocessor") &&
        !isServiceWorkerContext
      ) {
        const startTime = performance.now();

        try {
          // Lazy import to avoid DOM access errors in service worker
          const { processUserCSS } = await import("./processor");
          const reprocessed = await processUserCSS(
            updatedStyle.source,
            variables,
          );

          if (reprocessed.preprocessorErrors.length === 0) {
            // Update the compiled CSS in storage
            await storageClient.updateUserCSSStyle(styleId, {
              compiledCss: reprocessed.compiledCss,
            });

            const processingTime = performance.now() - startTime;
            if (processingTime > 3000) {
              console.warn(
                `Variable re-processing took ${processingTime.toFixed(2)}ms for style ${styleId}`,
              );
            }

            // Notify content scripts to reapply the style
            await this.broadcastService.broadcastStyleReapply({
              styleId,
              reason: "variables_updated",
              timestamp: Date.now(),
            });
          } else {
            console.warn(
              "Re-processing failed:",
              reprocessed.preprocessorErrors,
            );
          }
        } catch (processingError) {
          console.error(
            "Failed to re-process style after variable update:",
            processingError,
          );
        }
      }

      // Create the update payload
      const update: VariableUpdate = {
        styleId,
        variables,
      };

      // Broadcast the change to all listeners
      console.log(
        "[VariablePersistenceService] Broadcasting update to local watchers",
      );
      this.broadcastUpdate(update);

      // Send message to content scripts for live updates
      console.log(
        "[VariablePersistenceService] Broadcasting VARIABLES_UPDATED message to content scripts",
      );
      await this.broadcastService.broadcastVariableUpdate({
        styleId,
        variables,
      });

      console.log(
        "[VariablePersistenceService] Variable update completed successfully",
      );
    } catch (error) {
      console.error(
        "[VariablePersistenceService] Failed to update variables:",
        error,
      );
      throw new Error(`Failed to update variables: ${error}`);
    }
  }

  /**
   * Get current variables for a specific style
   */
  async getVariables(
    styleId: string,
  ): Promise<Record<string, VariableDescriptor> | null> {
    try {
      const style = await storageClient.getUserCSSStyle(styleId);
      return style?.variables || null;
    } catch (error) {
      console.error("Failed to get variables:", error);
      return null;
    }
  }

  /**
   * Reset variables to their original install-time default values
   */
  async resetVariables(styleId: string): Promise<void> {
    try {
      const style = await storageClient.getUserCSSStyle(styleId);
      if (!style) {
        throw new Error(`Style with ID ${styleId} not found`);
      }

      // Reset all variables to their original install-time default values
      const resetVariables: Record<string, string> = {};
      for (const [varName, varDescriptor] of Object.entries(style.variables)) {
        // Use originalDefaults if available, otherwise fall back to current default
        resetVariables[varName] =
          style.originalDefaults?.[varName] || varDescriptor.default;
      }

      await this.updateVariables(styleId, resetVariables);
    } catch (error) {
      console.error("Failed to reset variables:", error);
      throw new Error(`Failed to reset variables: ${error}`);
    }
  }

  /**
   * Watch for variable changes
   */
  watchVariableChanges(callback: VariableChangeCallback): () => void {
    this.watchers.add(callback);

    // Return unsubscribe function
    return () => {
      this.watchers.delete(callback);
    };
  }

  /**
   * Broadcast update to all watchers
   */
  private broadcastUpdate(update: VariableUpdate): void {
    this.watchers.forEach((callback) => {
      try {
        callback(update);
      } catch (error) {
        console.error("Error in variable change callback:", error);
      }
    });
  }

  /**
   * Initialize the service by setting up storage watchers
   */
  initialize(): void {
    // Watch for storage changes to broadcast updates
    if (typeof storageClient.watchUserCSSStyles === "function") {
      storageClient.watchUserCSSStyles((newStyles, oldStyles) => {
        if (!oldStyles) return; // Initial load, no need to broadcast

        // Find styles that have variable changes
        for (const newStyle of newStyles) {
          const oldStyle = oldStyles.find((s) => s.id === newStyle.id);
          if (!oldStyle) continue;

          // Check if variables changed
          const variablesChanged =
            JSON.stringify(oldStyle.variables) !==
            JSON.stringify(newStyle.variables);
          if (variablesChanged) {
            const variables: Record<string, string> = {};
            for (const [varName, varDescriptor] of Object.entries(
              newStyle.variables,
            )) {
              variables[varName] = varDescriptor.value;
            }

            const update: VariableUpdate = {
              styleId: newStyle.id,
              variables,
            };

            this.broadcastUpdate(update);
          }
        }
      });
    } else {
      console.warn("watchUserCSSStyles method not available on storage client");
    }
  }
}

// Create and export the default instance
export const variablePersistenceService = new VariablePersistenceService();

// Initialize the service
variablePersistenceService.initialize();
