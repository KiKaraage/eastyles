/**
 * Hook for message passing between extension components
 * Provides reactive communication between popup, background, and manager pages
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { browser } from "wxt/browser";

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
}

export enum ApplyMessageType {
  PARSE_USERCSS = "PARSE_USERCSS",
  INSTALL_STYLE = "INSTALL_STYLE",
}

/**
 * Message payload types
 */
export interface PopupMessagePayloads {
  [PopupMessageType.OPEN_MANAGER]: { url?: string };
  [PopupMessageType.ADD_STYLE]: { template?: string };
  [PopupMessageType.OPEN_SETTINGS]: { section?: string };
  [PopupMessageType.GET_STYLES]: { ids?: string[] };
  [PopupMessageType.TOGGLE_STYLE]: { id: string; enabled: boolean };
  [PopupMessageType.THEME_CHANGED]: { theme: "light" | "dark" | "system" };
}

/**
 * Message response types
 */
export interface PopupMessageResponses {
  [PopupMessageType.OPEN_MANAGER]: { success: boolean; error?: string };
  [PopupMessageType.ADD_STYLE]: {
    success: boolean;
    styleId?: string;
    error?: string;
  };
  [PopupMessageType.OPEN_SETTINGS]: { success: boolean; error?: string };
  [PopupMessageType.GET_STYLES]: { styles: unknown[]; error?: string };
  [PopupMessageType.TOGGLE_STYLE]: { success: boolean; error?: string };
  [PopupMessageType.THEME_CHANGED]: { success: boolean; error?: string };
}

export interface ApplyMessagePayloads {
  [ApplyMessageType.PARSE_USERCSS]: {
    text: string;
    sourceUrl?: string;
  };
  [ApplyMessageType.INSTALL_STYLE]: {
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
      options?: string[];
    }>;
  };
}

export interface ApplyMessageResponses {
  [ApplyMessageType.PARSE_USERCSS]: {
    success: boolean;
    error?: string;
    meta?: {
      name: string;
      namespace: string;
      version: string;
      description: string;
      author: string;
      sourceUrl: string;
      domains: string[];
    };
    css?: string;
    warnings?: string[];
    errors?: string[];
  };
  [ApplyMessageType.INSTALL_STYLE]: {
    success: boolean;
    error?: string;
    styleId?: string;
  };
}

/**
 * Message interface
 */
export interface PopupMessage<T extends PopupMessageType> {
  type: T;
  payload: PopupMessagePayloads[T];
  responseId?: string;
}

/**
 * Hook return interface
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
 * Union type for all message types
 */
export type MessageType = PopupMessageType | ApplyMessageType;

/**
 * Union type for all message payloads
 */
export type MessagePayloads = PopupMessagePayloads & ApplyMessagePayloads;

/**
 * Union type for all message responses
 */
export type MessageResponses = PopupMessageResponses & ApplyMessageResponses;

/**
 * Hook for message passing functionality
 */
export function useMessage(): UseMessageReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);
  const [messageHandlers, setMessageHandlers] = useState<
    Map<MessageType, ((payload: unknown) => void)[]>
  >(new Map());
  const [responseHandlers, setResponseHandlers] = useState<
    Map<string, ((response: unknown) => void)[]>
  >(new Map());

  // Initialize connection
  // Ref to store the latest message handlers
  const messageHandlersRef = useRef(messageHandlers);
  const responseHandlersRef = useRef(responseHandlers);

  // Update refs whenever handlers change
  useEffect(() => {
    messageHandlersRef.current = messageHandlers;
  }, [messageHandlers]);

  useEffect(() => {
    responseHandlersRef.current = responseHandlers;
  }, [responseHandlers]);

  // Check if browser APIs are available to determine connection status
  useEffect(() => {
    const checkConnection = () => {
      console.log("[useMessage] Debug browser object:", browser);
      const hasBrowserApi = typeof browser !== "undefined" && browser.runtime;
      const hasRuntime = browser?.runtime?.id || browser?.runtime?.onMessage;
      const isConnected = !!hasBrowserApi && !!hasRuntime;
      console.log(
        "[useMessage] Connection status:",
        isConnected,
        "browser:",
        typeof browser !== "undefined",
        "runtime:",
        browser?.runtime ? "available" : "missing",
        "runtime.id:",
        browser?.runtime?.id ? "present" : "missing",
        "runtime.onMessage:",
        typeof browser?.runtime?.onMessage,
      );
      setIsConnected(isConnected);
      return isConnected;
    };

    // Initial check
    checkConnection();

    // Listen for browser runtime events that might affect connection
    if (typeof browser !== "undefined" && browser.runtime) {
      const listener = () => {
        console.log("[useMessage] Runtime event detected");
        checkConnection();
      };

      browser.runtime.onConnect.addListener(listener);

      // Cleanup
      return () => {
        browser.runtime.onConnect.removeListener(listener);
      };
    }
  }, []);

  // Dynamic connection check for every message send
  const getIsConnected = useCallback(() => {
    const hasBrowserApi = typeof browser !== "undefined" && browser.runtime;
    const hasRuntime = browser?.runtime?.id || browser?.runtime?.onMessage;
    return !!hasBrowserApi && !!hasRuntime;
  }, []);

  // Send message to background script
  const sendMessage = useCallback(
    async <T extends MessageType>(
      type: T,
      payload: MessagePayloads[T],
    ): Promise<MessageResponses[T]> => {
      const dynamicIsConnected = getIsConnected();
      console.log(
        `[useMessage] Attempting to send message:`,
        type,
        payload,
        "isConnected:",
        dynamicIsConnected,
      );
      setPendingMessages((prev) => prev + 1);

      try {
        const responseId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const message: { type: T; payload: MessagePayloads[T]; responseId?: string } = { type, payload, responseId };

        // Create promise for response
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanupHandlers();
            reject(new Error(`Message timeout after 3 attempts: ${type}`));
          }, 15000); // 15 second timeout (increased for service worker)

          const cleanupHandlers = () => {
            clearTimeout(timeout);
            setResponseHandlers((prev) => {
              const newHandlers = new Map(prev);
              newHandlers.delete(responseId);
              return newHandlers;
            });
          };

          // Store response handler
          setResponseHandlers((prev) => {
            const newHandlers = new Map(prev);
            const handlers = newHandlers.get(responseId) || [];
            handlers.push((response: unknown) => {
              cleanupHandlers();
              console.log(
                `[useMessage] Received response for ${type}:`,
                response,
              );
              resolve(response as MessageResponses[T]);
            });
            newHandlers.set(responseId, handlers);
            return newHandlers;
          });

          // Send message
          if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
            console.log(
              `[useMessage] Sending via browser.runtime.sendMessage:`,
              message,
            );
            browser.runtime.sendMessage(message).catch((error) => {
              console.error(
                `[useMessage] Failed to send message ${type}:`,
                error,
              );
              cleanupHandlers();
              reject(error);
            });
          } else {
            // Mock mode for development/testing
            console.log(
              `[Mock] Sending message:`,
              message.type,
              message.payload,
            );
            setTimeout(() => {
              cleanupHandlers();
              resolve({ success: true } as MessageResponses[T]);
            }, 100);
          }
        });
      } finally {
        setPendingMessages((prev) => Math.max(0, prev - 1));
      }
    },
    [getIsConnected],
  );

  // Send notification without waiting for response
  const sendNotification = useCallback(
    <T extends MessageType>(type: T, payload: MessagePayloads[T]) => {
      const dynamicIsConnected = getIsConnected();
      console.log(
        `[useMessage] Sending notification:`,
        type,
        payload,
        "isConnected:",
        dynamicIsConnected,
      );

      const message: { type: T; payload: MessagePayloads[T] } = { type, payload };

      if (dynamicIsConnected && browser.runtime?.sendMessage) {
        browser.runtime.sendMessage(message).catch((error) => {
          console.warn("Failed to send notification:", error);
        });
      } else {
        // Mock mode
        console.log(`[Mock] Sending notification:`, type, payload);
      }
    },
    [getIsConnected],
  );

  // Listen for messages from background script
  const onMessage = useCallback(
    <T extends MessageType>(
      type: T,
      callback: (payload: MessagePayloads[T]) => void,
    ) => {
      setMessageHandlers((prev) => {
        const newHandlers = new Map(prev);
        const handlers = newHandlers.get(type as MessageType) || [];
        handlers.push(callback as (payload: unknown) => void);
        newHandlers.set(type as MessageType, handlers);
        return newHandlers;
      });

      // Return cleanup function
      return () => {
        setMessageHandlers((prev) => {
          const newHandlers = new Map(prev);
          const handlers = newHandlers.get(type as MessageType) || [];
          const index = handlers.indexOf(
            callback as (payload: unknown) => void,
          );
          if (index > -1) {
            handlers.splice(index, 1);
          }
          newHandlers.set(type as MessageType, handlers);
          return newHandlers;
        });
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
      setResponseHandlers((prev) => {
        const newHandlers = new Map(prev);
        const handlers = newHandlers.get(responseId) || [];
        handlers.push(callback as (response: unknown) => void);
        newHandlers.set(responseId, handlers);
        return newHandlers;
      });

      // Return cleanup function
      return () => {
        setResponseHandlers((prev) => {
          const newHandlers = new Map(prev);
          const handlers = newHandlers.get(responseId) || [];
          const index = handlers.indexOf(
            callback as (response: unknown) => void,
          );
          if (index > -1) {
            handlers.splice(index, 1);
          }
          newHandlers.set(responseId, handlers);
          return newHandlers;
        });
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
 * Hook for message analytics and monitoring
 */
export function useMessageAnalytics() {
  const [messageStats, setMessageStats] = useState({
    sent: 0,
    received: 0,
    failed: 0,
    averageResponseTime: 0,
  });

  const [recentMessages, setRecentMessages] = useState<
    Array<{
      type: string;
      timestamp: number;
      success: boolean;
      responseTime?: number;
    }>
  >([]);

  const trackMessage = useCallback(
    (type: string, success: boolean, responseTime?: number) => {
      setMessageStats((prev) => ({
        ...prev,
        sent: prev.sent + 1,
        received: prev.received + (success ? 1 : 0),
        failed: prev.failed + (success ? 0 : 1),
        averageResponseTime:
          prev.averageResponseTime > 0
            ? (prev.averageResponseTime + (responseTime || 0)) / 2
            : responseTime || 0,
      }));

      setRecentMessages((prev) => [
        {
          type,
          timestamp: Date.now(),
          success,
          responseTime,
        },
        ...prev.slice(0, 19), // Keep last 20 messages
      ]);
    },
    [],
  );

  const getStats = () => messageStats;
  const getRecentMessages = () => recentMessages;

  return {
    trackMessage,
    getStats,
    getRecentMessages,
    messageStats,
    recentMessages,
  };
}

/**
 * Convenience hook for common popup actions
 */
export function usePopupActions() {
  const { sendMessage } = useMessage();

  const openManager = useCallback(async () => {
    console.log("[usePopupActions] openManager called");
    const response = await sendMessage(PopupMessageType.OPEN_MANAGER, {});
    console.log("[usePopupActions] openManager response:", response);
    return response;
  }, [sendMessage]);

  const addNewStyle = useCallback(
    async (template?: string) => {
      console.log("[usePopupActions] addNewStyle called, template:", template);
      return sendMessage(PopupMessageType.ADD_STYLE, { template });
    },
    [sendMessage],
  );

  const openSettings = useCallback(
    async (section?: string) => {
      console.log("[usePopupActions] openSettings called, section:", section);
      const response = await sendMessage(PopupMessageType.OPEN_SETTINGS, {
        section,
      });
      console.log("[usePopupActions] openSettings response:", response);
      return response;
    },
    [sendMessage],
  );

  const getStyles = useCallback(
    async (ids?: string[]) => {
      console.log("[usePopupActions] getStyles called, ids:", ids);
      return sendMessage(PopupMessageType.GET_STYLES, { ids });
    },
    [sendMessage],
  );

  const toggleStyle = useCallback(
    async (id: string, enabled: boolean) => {
      console.log(
        "[usePopupActions] toggleStyle called, id:",
        id,
        "enabled:",
        enabled,
      );
      return sendMessage(PopupMessageType.TOGGLE_STYLE, { id, enabled });
    },
    [sendMessage],
  );

  return {
    openManager,
    addNewStyle,
    openSettings,
    getStyles,
    toggleStyle,
  };
}

/**
 * Hook for Apply Page message passing functionality
 */
export function useApplyActions() {
  const { sendMessage } = useMessage();

  const parseUserCSS = useCallback(
    async (text: string, sourceUrl?: string) => {
      console.log("[useApplyActions] parseUserCSS called, text length:", text.length);
      return sendMessage(ApplyMessageType.PARSE_USERCSS, { text, sourceUrl });
    },
    [sendMessage],
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
      },
      compiledCss: string,
      variables: Array<{
        name: string;
        type: string;
        default: string;
        min?: number;
        max?: number;
        options?: string[];
      }>
    ) => {
      console.log("[useApplyActions] installStyle called, style:", meta.name);
      return sendMessage(ApplyMessageType.INSTALL_STYLE, {
        meta,
        compiledCss,
        variables,
      });
    },
    [sendMessage],
  );

  return {
    parseUserCSS,
    installStyle,
  };
}
