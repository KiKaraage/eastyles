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
function validatePopupMessage(message: any, type: string): boolean {
  switch (type) {
    case "OPEN_MANAGER":
      return (
        message.payload &&
        typeof message.payload === "object" &&
        "url" in message.payload &&
        typeof message.payload.url === "string" &&
        message.payload.url.length > 0
      );
    case "GET_CURRENT_TAB":
    case "TOGGLE_THEME":
      return !message.payload || Object.keys(message.payload).length === 0;
    default:
      return false;
  }
}

/**
 * Validates a ManagerMessage based on its type and required payload structure.
 */
function validateManagerMessage(message: any, type: string): boolean {
  switch (type) {
    case "REQUEST_EXPORT":
      return (
        message.payload &&
        typeof message.payload === "object" &&
        "format" in message.payload &&
        message.payload.format === "json"
      );
    case "REQUEST_IMPORT":
      return (
        message.payload &&
        typeof message.payload === "object" &&
        "data" in message.payload &&
        typeof message.payload.data === "string" &&
        message.payload.data.length > 0
      );
    case "RESET_SETTINGS":
    case "GET_ALL_STYLES":
      return !message.payload || Object.keys(message.payload).length === 0;
    default:
      return false;
  }
}

/**
 * Creates a standardized error message for invalid messages.
 */
export function createInvalidMessageError(
  message: any,
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
export function isValidErrorDetails(error: any): boolean {
  return (
    error &&
    typeof error.message === "string" &&
    typeof error.timestamp === "number" &&
    ["background", "popup", "manager", "content"].includes(error.source) &&
    ["silent", "notify", "fatal"].includes(error.severity)
  );
}
