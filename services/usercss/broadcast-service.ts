/**
 * Broadcast Service
 *
 * Handles broadcasting UserCSS variable updates to content scripts and other components.
 * Provides a testable abstraction over the message bus for cross-tab communication.
 */

import { messageBus } from "../messaging/bus";

export interface VariableUpdate {
  styleId: string;
  variables: Record<string, string>;
}

export interface StyleReapplyRequest {
  styleId: string;
  reason: string;
  timestamp: number;
}

/**
 * Service for broadcasting UserCSS updates across extension components
 */
export class BroadcastService {
  /**
   * Broadcast variable updates to content scripts
   */
  async broadcastVariableUpdate(update: VariableUpdate): Promise<void> {
    try {
      await messageBus.broadcast({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: update.styleId,
          variables: update.variables,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error(
        "[BroadcastService] Failed to broadcast variable update:",
        error,
      );
      // In test environments or when broadcasting fails, we don't want to break the main flow
      // The core functionality (storage update) should still succeed
    }
  }

  /**
   * Broadcast style reapply request to content scripts
   */
  async broadcastStyleReapply(request: StyleReapplyRequest): Promise<void> {
    try {
      await messageBus.broadcast({
        type: "STYLE_REAPPLY_REQUEST",
        payload: request,
      });
    } catch (error) {
      console.error(
        "[BroadcastService] Failed to broadcast style reapply:",
        error,
      );
      // Similar to variable updates, don't fail the main operation
    }
  }
}

// Create and export the default instance
export const broadcastService = new BroadcastService();
