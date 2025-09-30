/**
 * Hook for message passing between extension components
 * Provides reactive communication between popup, background, and manager pages
 */

import { browser } from "@wxt-dev/browser";
import { useState, useCallback, useEffect } from "react";
import { errorService } from "../services/errors/service";
import type {
  PopupMessageResponses,
  SaveMessageResponses,
} from "../services/messaging/types";
import type { VariableDescriptor } from "../services/usercss/types";

/**
 * Message types for popup communication
 */
export enum PopupMessageType {
  OPEN_MANAGER = "OPEN_MANAGER",
  ADD_STYLE = "ADD_STYLE",
  OPEN_SETTINGS = "OPEN_SETTINGS",
  GET_STYLES = "GET_STYLES",
  TOGGLE_STYLE = "TOGGLE_STYLE",
  THEME_CHANGED = "THEME_CHANGED",
  QUERY_STYLES_FOR_URL = "QUERY_STYLES_FOR_URL",
  UPDATE_VARIABLES = "UPDATE_VARIABLES",
}

/**
 * Message types for save operations
 */
export enum SaveMessageType {
  PARSE_USERCSS = "PARSE_USERCSS",
  INSTALL_STYLE = "INSTALL_STYLE",
  INJECT_FONT = "INJECT_FONT",
  CREATE_FONT_STYLE = "CREATE_FONT_STYLE",
  UPDATE_FONT_STYLE = "UPDATE_FONT_STYLE",
}

/**
 * Error codes for message operations
 */
export enum ErrorCodes {
  ERR_MESSAGE_INVALID = "ERR_MESSAGE_INVALID",
}

/**
 * Payload interfaces for popup messages
 */
export interface PopupMessagePayloads {
  [PopupMessageType.OPEN_MANAGER]: Record<string, never>;
  [PopupMessageType.ADD_STYLE]: {
    name: string;
    description: string;
    code: string;
    enabled: boolean;
  };
  [PopupMessageType.OPEN_SETTINGS]: Record<string, never>;
  [PopupMessageType.GET_STYLES]: Record<string, never>;
  [PopupMessageType.TOGGLE_STYLE]: {
    id: string;
    enabled: boolean;
    tabId?: number;
  };
  [PopupMessageType.THEME_CHANGED]: {
    theme: "light" | "dark";
  };
  [PopupMessageType.QUERY_STYLES_FOR_URL]: {
    url: string;
  };
  [PopupMessageType.UPDATE_VARIABLES]: {
    styleId: string;
    variables: Record<string, string>;
  };
}

/**
 * Payload interfaces for save messages
 */
export interface SaveMessagePayloads {
  [SaveMessageType.PARSE_USERCSS]: {
    text: string;
    sourceUrl?: string;
  };
  [SaveMessageType.INSTALL_STYLE]: {
    meta: {
      name: string;
      namespace: string;
      version: string;
      description: string;
      author: string;
      sourceUrl: string;
      domains: string[];
    };
    compiledCss: string;
    variables: Array<{
      name: string;
      type: string;
      default: string;
      min?: number;
      max?: number;
      options?: Array<{value: string, label: string}>;
    }>;
  };
  [SaveMessageType.INJECT_FONT]: {
    fontName: string;
    css: string;
  };
  [SaveMessageType.CREATE_FONT_STYLE]: {
    domain?: string;
    fontName: string;
  };
  [SaveMessageType.UPDATE_FONT_STYLE]: {
    styleId: string;
    domain?: string;
    fontName: string;
  };
}

/**
 * Generic message interface
 */
export interface PopupMessage {
  type: string;
  payload: unknown;
  responseId?: string;
}

/**
 * Return type for useMessage hook
 */
export interface UseMessageReturn {
  /** Send a message to background script */
  sendMessage: <T extends MessageType>(
    type: T,
    payload: MessagePayloads[T],
  ) => Promise<MessageResponses[T]>;

  /** Send a message without waiting for response */
  sendNotification: <T extends MessageType>(
    type: T,
    payload: MessagePayloads[T],
  ) => void;

  /** Listen for messages from background script */
  onMessage: <T extends MessageType>(
    type: T,
    callback: (payload: MessagePayloads[T]) => void,
  ) => () => void;

  /** Listen for responses to messages */
  onResponse: <T extends MessageType>(
    responseId: string,
    callback: (response: MessageResponses[T]) => void,
  ) => () => void;

  /** Current connection status */
  isConnected: boolean;

  /** Pending message counts */
  pendingMessages: number;
}

/**
 * Combined message types
 */
export type MessageType = PopupMessageType | SaveMessageType;

/**
 * Union type for all message payloads
 */
export type MessagePayloads = PopupMessagePayloads & SaveMessagePayloads;

/**
 * Union type for all message responses
 */
export type MessageResponses = PopupMessageResponses & SaveMessageResponses;

/**
 * Main message hook
 */
export function useMessage(): UseMessageReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);

  // Track connection status
  useEffect(() => {
    const updateConnectionStatus = () => {
      try {
        // More comprehensive connection check
        const hasRuntime = !!browser?.runtime;
        const hasRuntimeId = !!browser?.runtime?.id;
        const canSendMessages =
          typeof browser?.runtime?.sendMessage === "function";

        const connected = hasRuntime && hasRuntimeId && canSendMessages;

        setIsConnected((prev) => {
          // Only update if the connection status actually changed
          if (prev !== connected) {
            console.log("[useMessage] Connection status changed:", connected, {
              hasRuntime,
              hasRuntimeId,
              canSendMessages,
            });
            return connected;
          }
          return prev;
        });
      } catch (error) {
        console.warn("[useMessage] Error checking connection status:", error);
        setIsConnected(false);
      }
    };

    updateConnectionStatus();

    // Use a more stable connection check
    const connectionCheck = setInterval(updateConnectionStatus, 5000);

    return () => {
      clearInterval(connectionCheck);
    };
  }, []);

  // Send message to background script
  const sendMessage = useCallback(
    <T extends MessageType>(
      type: T,
      payload: MessagePayloads[T],
    ): Promise<MessageResponses[T]> => {
      return new Promise((resolve, reject) => {
        // Always try to send the message, don't rely on cached connection status
        console.log("[useMessage] Attempting to send message:", type);

        setPendingMessages((count) => count + 1);

        const responseId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const message: PopupMessage = { type, payload, responseId };

        console.log("[useMessage] Sending message:", message);

        // Set up timeout
        const timeoutId = setTimeout(() => {
          console.warn("[useMessage] Message timeout for:", type);
          setPendingMessages((count) => count - 1);
          reject(new Error("Message timeout"));
        }, 5000);

        // Send message and handle response through the Promise
        browser?.runtime
          ?.sendMessage(message)
          .then((response: unknown) => {
            clearTimeout(timeoutId);
            setPendingMessages((count) => count - 1);
            resolve(response as MessageResponses[T]);
          })
          .catch((error: unknown) => {
            console.error("[useMessage] Failed to send message:", error);
            clearTimeout(timeoutId);
            setPendingMessages((count) => count - 1);
            reject(error);
          });
      });
    },
    [], // Remove isConnected dependency
  );

  // Send notification without waiting for response
  const sendNotification = useCallback(
    <T extends MessageType>(type: T, payload: MessagePayloads[T]) => {
      if (!isConnected) {
        console.warn("Not connected to background script");
        return;
      }

      const message: PopupMessage = { type, payload };
      browser?.runtime?.sendMessage(message).catch((error: unknown) => {
        console.error("Failed to send notification:", error);
      });
    },
    [isConnected],
  );

  // Listen for messages from background script
  const onMessage = useCallback(
    <T extends MessageType>(
      type: T,
      callback: (payload: MessagePayloads[T]) => void,
    ) => {
      const handler = (message: PopupMessage) => {
        if (message.type === type) {
          callback(message.payload as MessagePayloads[T]);
        }
      };

      browser?.runtime?.onMessage?.addListener(handler);

      return () => {
        browser?.runtime?.onMessage?.removeListener(handler);
      };
    },
    [],
  );

  // Listen for responses to messages
  const onResponse = useCallback(
    <T extends MessageType>(
      responseId: string,
      callback: (response: MessageResponses[T]) => void,
    ) => {
      const handler = (message: PopupMessage) => {
        if (message.responseId === responseId) {
          callback(message.payload as MessageResponses[T]);
        }
      };

      browser?.runtime?.onMessage?.addListener(handler);

      return () => {
        browser?.runtime?.onMessage?.removeListener(handler);
      };
    },
    [],
  );

  return {
    sendMessage,
    sendNotification,
    onMessage,
    onResponse,
    isConnected,
    pendingMessages,
  };
}

/**
 * Hook for message analytics
 */
export function useMessageAnalytics() {
  const [messageStats, setMessageStats] = useState({
    sent: 0,
    received: 0,
    failed: 0,
  });

  const trackMessage = useCallback((type: "sent" | "received" | "failed") => {
    setMessageStats((stats) => ({
      ...stats,
      [type]: stats[type] + 1,
    }));
  }, []);

  return {
    messageStats,
    trackMessage,
  };
}

/**
 * Hook for popup-specific actions
 */
export function usePopupActions() {
  const { sendMessage } = useMessage();
  const { trackMessage } = useMessageAnalytics();
  const [dynamicIsConnected, setDynamicIsConnected] = useState(false);

  // Update connection status
  useEffect(() => {
    const updateConnectionStatus = () => {
      setDynamicIsConnected(!!browser.runtime?.id);
    };

    updateConnectionStatus();
    browser?.runtime?.onConnect?.addListener(updateConnectionStatus);

    return () => {
      browser?.runtime?.onConnect?.removeListener(updateConnectionStatus);
    };
  }, []);

  const openManager = useCallback(async () => {
    try {
      await sendMessage(PopupMessageType.OPEN_MANAGER, {});
      trackMessage("sent");
    } catch (error: unknown) {
      errorService.createMessageError(
        typeof error === "string" ? error : "Unknown error",
      );
      trackMessage("failed");
    }
  }, [sendMessage, trackMessage]);

  const addStyle = useCallback(
    async (
      name: string,
      description: string,
      code: string,
      enabled: boolean,
    ) => {
      try {
        const result = await sendMessage(PopupMessageType.ADD_STYLE, {
          name,
          description,
          code,
          enabled,
        });
        trackMessage("sent");
        return result;
      } catch (error: unknown) {
        errorService.createMessageError(
          typeof error === "string" ? error : "Unknown error",
        );
        trackMessage("failed");
        throw error;
      }
    },
    [sendMessage, trackMessage],
  );

  const getStyles = useCallback(async () => {
    try {
      const result = await sendMessage(PopupMessageType.GET_STYLES, {});
      trackMessage("sent");
      return result;
    } catch (error: unknown) {
      errorService.createMessageError(
        typeof error === "string" ? error : "Unknown error",
      );
      trackMessage("failed");
      throw error;
    }
  }, [sendMessage, trackMessage]);

  const toggleStyle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        const result = await sendMessage(PopupMessageType.TOGGLE_STYLE, {
          id,
          enabled,
        });
        trackMessage("sent");
        return result;
      } catch (error: unknown) {
        errorService.createMessageError(
          typeof error === "string" ? error : "Unknown error",
        );
        trackMessage("failed");
        throw error;
      }
    },
    [sendMessage, trackMessage],
  );

  return {
    openManager,
    addStyle,
    getStyles,
    toggleStyle,
    isConnected: dynamicIsConnected,
  };
}

/**
 * Hook for save-specific actions
 */
export function useSaveActions() {
  const { sendMessage } = useMessage();
  const { trackMessage } = useMessageAnalytics();

  const parseUserCSS = useCallback(
    async (text: string, sourceUrl?: string) => {
      console.log(
        "[useSaveActions] parseUserCSS called, text length:",
        text.length,
      );
      try {
        console.log("[useSaveActions] About to send PARSE_USERCSS message");
        const result = await sendMessage(SaveMessageType.PARSE_USERCSS, {
          text,
          sourceUrl,
        });
        console.log("[useSaveActions] parseUserCSS result:", result);
        console.log("[useSaveActions] result type:", typeof result);
        console.log("[useSaveActions] result success:", result?.success);
        trackMessage("sent");
        return result;
      } catch (error: unknown) {
        console.error("[useSaveActions] parseUserCSS error:", error);
        errorService.createMessageError(
          typeof error === "string" ? error : "Unknown error",
        );
        trackMessage("failed");
        throw error;
      }
    },
    [sendMessage, trackMessage],
  );

  const installStyle = useCallback(
    async (
      meta: {
        name: string;
        namespace: string;
        version: string;
        description: string;
        author: string;
        sourceUrl: string;
        domains: string[];
        variables?: Record<string, VariableDescriptor>;
      },
      compiledCss: string,
      variables: Array<{
        name: string;
        type: string;
        default: string;
        min?: number;
        max?: number;
      options?: Array<{value: string, label: string}>;
      }>,
    ) => {
      console.log("[useSaveActions] installStyle called, style:", meta.name);
      try {
        const result = await sendMessage(SaveMessageType.INSTALL_STYLE, {
          meta,
          compiledCss,
          variables,
        });
        trackMessage("sent");
        return result;
      } catch (error: unknown) {
        errorService.createMessageError(
          typeof error === "string" ? error : "Unknown error",
        );
        trackMessage("failed");
        throw error;
      }
    },
    [sendMessage, trackMessage],
  );

  return {
    parseUserCSS,
    installStyle,
  };
}
