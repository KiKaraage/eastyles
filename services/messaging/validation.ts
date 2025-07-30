/**
 * Utilities for validating and type checking messages passed between extension components.
 * Ensures message integrity and prevents runtime errors from malformed messages.
 */

import { ReceivedMessages, ErrorDetails } from "./types";

/**
 * Type guard to check if an object is a valid ReceivedMessages type.
 * This function performs runtime type checking to ensure message integrity.
 *
 * @param message - The message object to validate
 * @returns True if the message is a valid ReceivedMessages type
 */
export function isValidReceivedMessage(
  message: unknown,
): message is ReceivedMessages {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    typeof message.type !== "string"
  ) {
    return false;
  }

  const messageType = message.type;

  // Validate PopupMessages
  if (isPopupMessage(messageType)) {
    return validatePopupMessage(message, messageType);
  }

  // Validate ManagerMessages
  if (isManagerMessage(messageType)) {
    return validateManagerMessage(message, messageType);
  }

  return false;
}

/**
 * Type guard to check if a message type belongs to PopupMessages.
 */
function isPopupMessage(type: string): boolean {
  return ["OPEN_MANAGER", "GET_CURRENT_TAB", "TOGGLE_THEME"].includes(type);
}

/**
 * Type guard to check if a message type belongs to ManagerMessages.
 */
function isManagerMessage(type: string): boolean {
  return [
    "REQUEST_EXPORT",
    "REQUEST_IMPORT",
    "RESET_SETTINGS",
    "GET_ALL_STYLES",
  ].includes(type);
}

/**
 * Validates a PopupMessage based on its type and required payload structure.
 */
function validatePopupMessage(message: unknown, type: string): boolean {
  if (type === "OPEN_MANAGER") {
    if (message && typeof message === "object" && "payload" in message) {
      const payload = (message as { payload: unknown }).payload;
      return (
        payload !== null &&
        typeof payload === "object" &&
        "url" in payload &&
        typeof (payload as { url?: unknown }).url === "string" &&
        (payload as { url: string }).url.length > 0
      );
    }
    return false;
  }

  if (type === "GET_CURRENT_TAB" || type === "TOGGLE_THEME") {
    return (
      message === null ||
      message === undefined ||
      (typeof message === "object" && Object.keys(message).length === 0)
    );
  }

  return false;
}

/**
 * Validates a ManagerMessage based on its type and required payload structure.
 */
function validateManagerMessage(message: unknown, type: string): boolean {
  switch (type) {
    case "REQUEST_EXPORT":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "format" in payload &&
          (payload as { format?: unknown }).format === "json"
        );
      }
      return false;
    case "REQUEST_IMPORT":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "data" in payload &&
          typeof (payload as { data?: unknown }).data === "string" &&
          (payload as { data: string }).data.length > 0
        );
      }
      return false;
    case "RESET_SETTINGS":
    case "GET_ALL_STYLES":
      return (
        message === null ||
        message === undefined ||
        (typeof message === "object" && Object.keys(message).length === 0)
      );
    default:
      return false;
  }
}

/**
 * Creates a standardized error message for invalid messages.
 */
export function createInvalidMessageError(
  message: unknown,
  source: string,
): ErrorDetails {
  return {
    message: `Invalid message received from ${source}`,
    stack: JSON.stringify(message),
    source: source as "background" | "popup" | "manager" | "content",
    timestamp: Date.now(),
    severity: "notify",
  };
}

/**
 * Type guard to check if an object is a valid ErrorDetails structure.
 */
export function isValidErrorDetails(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const hasMessage =
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string";
  const hasTimestamp =
    "timestamp" in error &&
    typeof (error as { timestamp?: unknown }).timestamp === "number";
  const hasSource =
    "source" in error &&
    ["background", "popup", "manager", "content"].includes(
      (error as { source?: unknown }).source as string,
    );
  const hasSeverity =
    "severity" in error &&
    ["silent", "notify", "fatal"].includes(
      (error as { severity?: unknown }).severity as string,
    );

  return hasMessage && hasTimestamp && hasSource && hasSeverity;
}
