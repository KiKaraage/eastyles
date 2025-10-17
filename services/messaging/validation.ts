/**
 * Utilities for validating and type checking messages passed between extension components.
 * Ensures message integrity and prevents runtime errors from malformed messages.
 */

import { ErrorDetails, ReceivedMessages } from "./types";

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

  // Validate ApplyMessages
  if (isApplyMessage(messageType)) {
    return validateApplyMessage(message, messageType);
  }

  // Validate ContentMessages
  if (isContentMessage(messageType)) {
    return validateContentMessage(message, messageType);
  }

  return false;
}

/**
 * Type guard to check if a message type belongs to PopupMessages.
 */
function isPopupMessage(type: string): boolean {
  return [
    "OPEN_MANAGER",
    "ADD_STYLE",
    "OPEN_SETTINGS",
    "GET_STYLES",
    "TOGGLE_STYLE",
    "THEME_CHANGED",
    "GET_CURRENT_TAB",
    "TOGGLE_THEME",
    "UPDATE_VARIABLES",
  ].includes(type);
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
 * Type guard to check if a message type belongs to ApplyMessages.
 */
function isApplyMessage(type: string): boolean {
  return [
    "PARSE_USERCSS",
    "INSTALL_STYLE",
    "INJECT_FONT",
    "CREATE_FONT_STYLE",
    "UPDATE_FONT_STYLE",
  ].includes(type);
}

/**
 * Type guard to check if a message type belongs to ContentMessages.
 */
function isContentMessage(type: string): boolean {
  return ["QUERY_STYLES_FOR_URL", "FETCH_ASSETS"].includes(type);
}

/**
 * Validates a PopupMessage based on its type and required payload structure.
 */
function validatePopupMessage(message: unknown, type: string): boolean {
  if (
    type === "OPEN_MANAGER" ||
    type === "ADD_STYLE" ||
    type === "OPEN_SETTINGS" ||
    type === "GET_STYLES" ||
    type === "TOGGLE_STYLE" ||
    type === "THEME_CHANGED" ||
    type === "UPDATE_VARIABLES"
  ) {
    // These messages can have optional payload
    if (message && typeof message === "object") {
      const keys = Object.keys(message);
      // Must have 'type' property, can optionally have 'payload' and 'responseId'
      const hasType = keys.includes("type");
      const hasPayload = keys.includes("payload");
      const hasResponseId = keys.includes("responseId");

      if (!hasType) return false;

      if (hasPayload) {
        const payload = (message as { payload?: unknown }).payload;
        if (typeof payload !== "object" || payload === null) return false;

        // For OPEN_MANAGER, url must be a non-empty string if present
        if (type === "OPEN_MANAGER") {
          const url = (payload as { url?: unknown }).url;
          if (
            url !== undefined &&
            (typeof url !== "string" || url.length === 0)
          ) {
            return false;
          }
          // If payload exists but url is not present, it's invalid for OPEN_MANAGER
          if (url === undefined) {
            return false;
          }
        }

        // For UPDATE_VARIABLES, validate styleId and variables
        if (type === "UPDATE_VARIABLES") {
          const styleId = (payload as { styleId?: unknown }).styleId;
          const variables = (payload as { variables?: unknown }).variables;
          if (typeof styleId !== "string" || styleId.length === 0) {
            return false;
          }
          if (typeof variables !== "object" || variables === null) {
            return false;
          }
        }
      }

      return (
        !hasResponseId ||
        typeof (message as { responseId?: unknown }).responseId === "string"
      );
    }
    return false;
  }

  if (type === "GET_CURRENT_TAB" || type === "TOGGLE_THEME") {
    // These messages should only have the 'type' property
    if (message && typeof message === "object") {
      const keys = Object.keys(message);
      return keys.length === 1 && keys[0] === "type";
    }
    return false;
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
      // These messages should only have the 'type' property
      if (message && typeof message === "object") {
        const keys = Object.keys(message);
        return keys.length === 1 && keys[0] === "type";
      }
      return false;
    default:
      return false;
  }
}

/**
 * Validates an ApplyMessage based on its type and required payload structure.
 */
function validateApplyMessage(message: unknown, type: string): boolean {
  switch (type) {
    case "PARSE_USERCSS":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "text" in payload &&
          typeof (payload as { text?: unknown }).text === "string" &&
          (payload as { text: string }).text.length > 0
        );
      }
      return false;
    case "INSTALL_STYLE":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "meta" in payload &&
          "compiledCss" in payload &&
          "variables" in payload
        );
      }
      return false;
    case "INJECT_FONT":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "fontName" in payload &&
          "css" in payload &&
          typeof (payload as { fontName?: unknown }).fontName === "string" &&
          typeof (payload as { css?: unknown }).css === "string"
        );
      }
      return false;
    case "CREATE_FONT_STYLE":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "fontName" in payload &&
          typeof (payload as { fontName?: unknown }).fontName === "string" &&
          (payload as { fontName: string }).fontName.length > 0 &&
          (!("domain" in payload) ||
            typeof (payload as { domain?: unknown }).domain === "string")
        );
      }
      return false;
    case "UPDATE_FONT_STYLE":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "styleId" in payload &&
          typeof (payload as { styleId?: unknown }).styleId === "string" &&
          (payload as { styleId: string }).styleId.length > 0 &&
          "fontName" in payload &&
          typeof (payload as { fontName?: unknown }).fontName === "string" &&
          (payload as { fontName: string }).fontName.length > 0 &&
          (!("domain" in payload) ||
            typeof (payload as { domain?: unknown }).domain === "string")
        );
      }
      return false;
    default:
      return false;
  }
}

/**
 * Validates a ContentMessage based on its type and required payload structure.
 */
function validateContentMessage(message: unknown, type: string): boolean {
  switch (type) {
    case "QUERY_STYLES_FOR_URL":
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
    case "FETCH_ASSETS":
      if (message && typeof message === "object" && "payload" in message) {
        const payload = (message as { payload: unknown }).payload;
        return (
          payload !== null &&
          typeof payload === "object" &&
          "assets" in payload &&
          Array.isArray((payload as { assets?: unknown }).assets)
        );
      }
      return false;
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
