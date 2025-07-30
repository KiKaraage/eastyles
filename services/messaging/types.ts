/**
 * Message types for communication between extension components.
 * Defines the contract for message passing between background script, popup, and manager page.
 */

/**
 * Messages sent from the background script to other components.
 */
export type BackgroundMessages =
  | {
      type: "ERROR_REPORTED";
      payload: {
        error: ErrorDetails;
      };
    }
  | {
      type: "STORAGE_UPDATED";
      payload: {
        key: string;
        newValue: unknown;
        oldValue: unknown;
      };
    };

/**
 * Messages sent from the popup to the background script.
 */
export type PopupMessages =
  | {
      type: "OPEN_MANAGER";
      payload: {
        url: string;
      };
    }
  | {
      type: "GET_CURRENT_TAB";
    }
  | {
      type: "TOGGLE_THEME";
    };

/**
 * Messages sent from the manager page to the background script.
 */
export type ManagerMessages =
  | {
      type: "REQUEST_EXPORT";
      payload: {
        format: "json";
      };
    }
  | {
      type: "REQUEST_IMPORT";
      payload: {
        data: string;
      };
    }
  | {
      type: "RESET_SETTINGS";
    }
  | {
      type: "GET_ALL_STYLES";
    };

/**
 * Union type of all possible message types that can be received by the background script.
 */
export type ReceivedMessages = PopupMessages | ManagerMessages;

/**
 * Union type of all possible message types that can be sent from the background script.
 */
export type SentMessages = BackgroundMessages;

/**
 * Common error details structure for error reporting.
 */
export interface ErrorDetails {
  message: string;
  stack?: string;
  source: "background" | "popup" | "manager" | "content";
  timestamp: number;
  severity: "silent" | "notify" | "fatal";
}
