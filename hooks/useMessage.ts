/**
 * Hook for message passing between extension components
 * Provides reactive communication between popup, background, and manager pages
 */

import { useState, useEffect, useCallback } from "react";
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
  [PopupMessageType.GET_STYLES]: { styles: any[]; error?: string };
  [PopupMessageType.TOGGLE_STYLE]: { success: boolean; error?: string };
  [PopupMessageType.THEME_CHANGED]: { success: boolean; error?: string };
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
  sendMessage: <T extends PopupMessageType>(
    type: T,
    payload: PopupMessagePayloads[T],
  ) => Promise<PopupMessageResponses[T]>;

  /** Send a message without waiting for response */
  sendNotification: <T extends PopupMessageType>(
    type: T,
    payload: PopupMessagePayloads[T],
  ) => void;

  /** Listen for messages from background script */
  onMessage: <T extends PopupMessageType>(
    type: T,
    callback: (payload: PopupMessagePayloads[T]) => void,
  ) => () => void;

  /** Listen for responses to messages */
  onResponse: <T extends PopupMessageType>(
    responseId: string,
    callback: (response: PopupMessageResponses[T]) => void,
  ) => () => void;

  /** Current connection status */
  isConnected: boolean;

  /** Pending message counts */
  pendingMessages: number;
}

/**
 * Hook for message passing functionality
 */
export function useMessage(): UseMessageReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(0);
  const [messageHandlers, setMessageHandlers] = useState<
    Map<PopupMessageType, Function[]>
  >(new Map());
  const [responseHandlers, setResponseHandlers] = useState<
    Map<string, Function[]>
  >(new Map());

  // Initialize connection
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // Check if we can access the browser APIs
        if (typeof browser !== "undefined" && browser.runtime) {
          setIsConnected(true);

          // Listen for messages from background script
          if (browser.runtime.onMessage) {
            browser.runtime.onMessage.addListener(handleMessageFromBackground);
          }
        } else {
          console.warn("Browser APIs not available, using mock mode");
          setIsConnected(false);
        }
      } catch (error) {
        console.warn("Failed to initialize message connection:", error);
        setIsConnected(false);
      }
    };

    initializeConnection();

    return () => {
      // Cleanup message listeners
      if (typeof browser !== "undefined" && browser.runtime?.onMessage) {
        browser.runtime.onMessage.removeListener(handleMessageFromBackground);
      }
    };
  }, []);

  // Handle incoming messages from background script
  const handleMessageFromBackground = useCallback(
    (message: any, sender: any, sendResponse: any) => {
      try {
        // Check if it's a popup message
        if (message && typeof message === "object" && "type" in message) {
          const { type, payload, responseId } = message;

          // Handle response to a previous message
          if (responseId && responseHandlers.has(responseId)) {
            const handlers = responseHandlers.get(responseId) || [];
            handlers.forEach((handler) => handler(payload));
            return true; // Indicate we want to send a response
          }

          // Handle new message
          if (messageHandlers.has(type as PopupMessageType)) {
            const handlers =
              messageHandlers.get(type as PopupMessageType) || [];
            handlers.forEach((handler) => handler(payload));
            return true; // Indicate we want to send a response
          }
        }
      } catch (error) {
        console.error("Error handling message from background:", error);
      }
      return false;
    },
    [messageHandlers, responseHandlers],
  );

  // Send message to background script
  const sendMessage = useCallback(
    async <T extends PopupMessageType>(
      type: T,
      payload: PopupMessagePayloads[T],
    ): Promise<PopupMessageResponses[T]> => {
      if (!isConnected) {
        throw new Error("Message service not connected");
      }

      setPendingMessages((prev) => prev + 1);

      try {
        const responseId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const message: PopupMessage<T> = { type, payload, responseId };

        // Create promise for response
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanupHandlers();
            reject(new Error(`Message timeout: ${type}`));
          }, 10000); // 10 second timeout

          const cleanupHandlers = () => {
            clearTimeout(timeout);
            setResponseHandlers((prev) => {
              const newHandlers = new Map(prev);
              newHandlers.delete(responseId);
              return newHandlers;
            });
          };

          // Store response handler
          setResponseHandlers((prev: Map<string, Function[]>) => {
            const newHandlers = new Map(prev);
            const handlers = newHandlers.get(responseId) || [];
            handlers.push((response: any) => {
              cleanupHandlers();
              resolve(response as PopupMessageResponses[T]);
            });
            newHandlers.set(responseId, handlers);
            return newHandlers;
          });

          // Send message
          if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
            browser.runtime.sendMessage(message).catch((error) => {
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
              resolve({ success: true } as any);
            }, 100);
          }
        });
      } finally {
        setPendingMessages((prev) => Math.max(0, prev - 1));
      }
    },
    [isConnected],
  );

  // Send notification without waiting for response
  const sendNotification = useCallback(
    <T extends PopupMessageType>(type: T, payload: PopupMessagePayloads[T]) => {
      if (!isConnected) {
        console.warn("Message service not connected, notification not sent");
        return;
      }

      const message: PopupMessage<T> = { type, payload };

      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
        browser.runtime.sendMessage(message).catch((error) => {
          console.warn("Failed to send notification:", error);
        });
      } else {
        // Mock mode
        console.log(`[Mock] Sending notification:`, type, payload);
      }
    },
    [isConnected],
  );

  // Listen for messages from background script
  const onMessage = useCallback(
    <T extends PopupMessageType>(
      type: T,
      callback: (payload: PopupMessagePayloads[T]) => void,
    ) => {
      setMessageHandlers((prev: Map<PopupMessageType, Function[]>) => {
        const newHandlers = new Map(prev);
        const handlers = newHandlers.get(type) || [];
        handlers.push(callback);
        newHandlers.set(type, handlers);
        return newHandlers;
      });

      // Return cleanup function
      return () => {
        setMessageHandlers((prev: Map<PopupMessageType, Function[]>) => {
          const newHandlers = new Map(prev);
          const handlers = newHandlers.get(type) || [];
          const index = handlers.indexOf(callback);
          if (index > -1) {
            (handlers as Function[]).splice(index, 1);
          }
          newHandlers.set(type, handlers);
          return newHandlers;
        });
      };
    },
    [],
  );

  // Listen for responses to messages
  const onResponse = useCallback(
    (responseId: string, callback: (response: any) => void) => {
      setResponseHandlers((prev: Map<string, Function[]>) => {
        const newHandlers = new Map(prev);
        const handlers = newHandlers.get(responseId) || [];
        handlers.push(callback);
        newHandlers.set(responseId, handlers);
        return newHandlers;
      });

      // Return cleanup function
      return () => {
        setResponseHandlers((prev: Map<string, Function[]>) => {
          const newHandlers = new Map(prev);
          const handlers = newHandlers.get(responseId) || [];
          const index = handlers.indexOf(callback);
          if (index > -1) {
            (handlers as Function[]).splice(index, 1);
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
    return sendMessage(PopupMessageType.OPEN_MANAGER, {});
  }, [sendMessage]);

  const addNewStyle = useCallback(
    async (template?: string) => {
      return sendMessage(PopupMessageType.ADD_STYLE, { template });
    },
    [sendMessage],
  );

  const openSettings = useCallback(
    async (section?: string) => {
      return sendMessage(PopupMessageType.OPEN_SETTINGS, { section });
    },
    [sendMessage],
  );

  const getStyles = useCallback(
    async (ids?: string[]) => {
      return sendMessage(PopupMessageType.GET_STYLES, { ids });
    },
    [sendMessage],
  );

  const toggleStyle = useCallback(
    async (id: string, enabled: boolean) => {
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
