/**
 * Message bus service for handling communication between extension components.
 * Implements async message handling with timeout and retry mechanisms.
 * Includes offline message queuing for reliable message delivery.
 */

import { browser } from "@wxt-dev/browser";
import { storage } from "@wxt-dev/storage";
import type { ReceivedMessages, SentMessages, ErrorDetails } from "./types";
import {
  isValidReceivedMessage,
  createInvalidMessageError,
} from "./validation";
import { messageHandlerService } from "./handlers";

// Note: Storage functionality removed to avoid initialization issues

// Default timeout for message responses (5 seconds)
export const DEFAULT_TIMEOUT = 5000;

// Maximum number of retry attempts for failed messages
const MAX_RETRIES = 3;

// Maximum number
interface PendingMessage {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
  retries: number;
}

// Interface for offline message queue items
interface OfflineMessage {
  id: string;
  message: ReceivedMessages;
  tabId?: number;
  timestamp: number;
  retries: number;
}

// Maximum age for offline messages (24 hours)
const MAX_OFFLINE_MESSAGE_AGE = 24 * 60 * 60 * 1000;

// Maximum number of offline messages to store
const MAX_OFFLINE_MESSAGES = 100;

/**
 * MessageBus class that handles sending and receiving messages between extension components.
 * Provides reliable communication with timeout and retry mechanisms.
 */
export class MessageBus {
  private pendingMessages = new Map<string, PendingMessage>();
  private messageIdCounter = 0;
  private isOnline = true;
  private offlineCheckInterval?: number;

  constructor() {
    // Set up listener for incoming messages
    this.setupMessageListener();
    // Initialize online status monitoring
    this.initializeOnlineStatusMonitoring();
  }

  /**
   * Set up the message listener to handle responses from other components.
   */
  private setupMessageListener(): void {
    const listener = (
      message: unknown,
      sender: { tab?: { id?: number } },
      sendResponse: (response?: unknown) => void,
    ) => {
      console.log(
        "[MessageBus] Raw message received:",
        message,
        "from sender:",
        sender,
      );

      // Handle async processing
      this.handleIncomingMessage(message, sender.tab?.id)
        .then((result) => {
          console.log("[MessageBus] Sending response:", result);
          sendResponse(result);
        })
        .catch((error) => {
          console.error("[MessageBus] Error in message listener:", error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        });

      // Return true to indicate we will send response asynchronously
      return true;
    };

    if (browser?.runtime) {
      console.log("[MessageBus] Setting up message listener");
      browser.runtime.onMessage.addListener(listener);
    } else {
      console.error("[MessageBus] Browser runtime not available");
    }
  }

  /**
   * Handle incoming messages from other extension components.
   */
  public async handleIncomingMessage(
    message: unknown,
    tabId?: number,
  ): Promise<unknown> {
    console.log("[MessageBus] Received message:", message, "from tab:", tabId);

    // First check if this is a response to a pending message
    const messageObj = message as Record<string, unknown>;
    if (messageObj.replyTo && typeof messageObj.replyTo === "string") {
      console.log("[MessageBus] Handling response for:", messageObj.replyTo);
      const pending = this.pendingMessages.get(messageObj.replyTo);
      if (pending) {
        // Clear the timeout
        self.clearTimeout(pending.timeoutId);
        this.pendingMessages.delete(messageObj.replyTo as string);

        // Resolve or reject the promise based on the response
        if (messageObj.error) {
          console.log("[MessageBus] Rejecting with error:", messageObj.error);
          pending.reject(messageObj.error);
        } else {
          console.log(
            "[MessageBus] Resolving with response:",
            messageObj.response,
          );
          pending.resolve(messageObj.response);
        }
      }
      return true;
    }

    // Check if this is a valid received message
    if (!isValidReceivedMessage(message)) {
      console.log("[MessageBus] Invalid message received:", message);
      // Send error response
      this.sendError(message, createInvalidMessageError(message, "unknown"));
      return true;
    }

    console.log(
      "[MessageBus] Processing valid message:",
      (message as ReceivedMessages).type,
    );
    try {
      // Process the message synchronously and return the response
      const response = await this.processMessage(
        message as ReceivedMessages,
        tabId,
      );
      console.log("[MessageBus] Returning synchronous response:", response);

      // Include the messageId or responseId in the response if it was present in the original message
      const originalMessage = message as {
        messageId?: string;
        responseId?: string;
      };
      if (originalMessage.messageId) {
        return {
          ...(typeof response === "object" && response !== null
            ? response
            : {}),
          messageId: originalMessage.messageId,
        };
      }
      if (originalMessage.responseId) {
        return {
          ...(typeof response === "object" && response !== null
            ? response
            : {}),
          responseId: originalMessage.responseId,
        };
      }

      return response;
    } catch (error: unknown) {
      console.error("[MessageBus] Error processing message:", error);
      // Return error response
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack || "" : "";
      return {
        success: false,
        error: errorMessage,
        stack: errorStack,
      };
    }
  }

  /**
   * Process a received message and return a response.
   */
  private async processMessage(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<unknown> {
    console.log(
      "[MessageBus] Processing message:",
      message.type,
      "with data:",
      message,
    );
    try {
      // Use the message handler service to process the message
      const result = await messageHandlerService.handleMessage(message, tabId);
      return result;
    } catch (error) {
      console.error("[MessageBus] Message handler threw error:", error);
      throw error;
    }
  }

  /**
   * Send a message to another extension component.
   */
  async send<T = unknown>(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Generate a unique ID for this message
      const messageId = `message-${this.messageIdCounter++}`;

      // Set up timeout mechanism with increased timeout for service worker
      const timeoutId = self.setTimeout(() => {
        const pending = this.pendingMessages.get(messageId);
        if (pending) {
          // If we've reached max retries, reject
          if (pending.retries >= MAX_RETRIES) {
            this.pendingMessages.delete(messageId);
            reject(
              new Error(
                `Message timeout after ${MAX_RETRIES} attempts: ${message.type}`,
              ),
            );
          } else {
            // Increment retry count and try again
            pending.retries++;
            console.log(
              `[MessageBus] Retrying message ${message.type}, attempt ${pending.retries}`,
            );
            this.resendMessage(message, tabId, pending, messageId);
          }
        }
      }, DEFAULT_TIMEOUT);

      // Store the promise callbacks for when the response arrives
      this.pendingMessages.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject: reject as (reason?: unknown) => void,
        timeoutId,
        retries: 0,
      });

      // Send the message
      // Add a check for tabId
      if (tabId) {
        this.sendMessage(message, tabId, messageId);
      } else {
        // Send to background context if tabId is undefined
        this.sendMessage(message, undefined, messageId);
      }
    });
  }

  /**
   * Resend a message that timed out.
   */
  private async resendMessage(
    message: ReceivedMessages,
    tabId: number | undefined,
    pending: PendingMessage,
    messageId: string,
  ): Promise<void> {
    // Clear the existing timeout
    self.clearTimeout(pending.timeoutId);

    // Set up a new timeout with exponential backoff
    const delay = DEFAULT_TIMEOUT * Math.pow(2, pending.retries);
    pending.timeoutId = self.setTimeout(() => {
      if (pending.retries >= MAX_RETRIES) {
        this.pendingMessages.delete(messageId);
        pending.reject(
          new Error(
            `Message timeout after ${MAX_RETRIES} attempts: ${message.type}`,
          ),
        );
      } else {
        pending.retries++;
        this.resendMessage(message, tabId, pending, messageId);
      }
    }, delay);

    // Resend the message
    this.sendMessage(message, tabId, messageId);
  }

  /**
   * Send a message through the appropriate browser API.
   */
  private sendMessage(
    message: ReceivedMessages,
    tabId: number | undefined,
    messageId: string,
  ): void {
    // Add the message ID for response tracking
    const messageWithId = { ...message, messageId };

    // Send the message without handling the Promise result
    if (tabId !== undefined) {
      // Send to specific tab
      if (browser.tabs) {
        browser.tabs.sendMessage(tabId, messageWithId).catch(() => {
          // Error will be handled by timeout/retry mechanism
        });
      }
    } else {
      // Send to background script or other context
      if (browser.runtime) {
        browser.runtime.sendMessage(messageWithId).catch(() => {
          // Error will be handled by timeout/retry mechanism
        });
      }
    }
  }

  /**
   * Send an error message to the appropriate component.
   */
  private sendError(message: unknown, error: ErrorDetails): void {
    const messageType = (message as { type?: string })?.type || "unknown";
    const errorResponse = {
      replyTo: messageType,
      error: error,
    };

    // Try to send to active tab first, otherwise send globally
    if (browser.tabs?.query) {
      browser.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          if (tabs[0]?.id !== undefined) {
            browser.tabs.sendMessage(tabs[0].id, errorResponse).catch(() => {
              // If tab messaging fails, send globally
              browser.runtime.sendMessage(errorResponse).catch(() => {
                // Silent fallback - don't log console errors in production
              });
            });
          } else {
            browser.runtime.sendMessage(errorResponse).catch(() => {
              // Silent fallback - don't log console errors in production
            });
          }
        })
        .catch(() => {
          browser.runtime.sendMessage(errorResponse).catch(() => {
            // Silent fallback - don't log console errors in production
          });
        });
    }
  }

  /**
   * Broadcast a message to all listening components.
   */
  async broadcast(message: SentMessages): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (browser.runtime) {
        browser.runtime.sendMessage(message).then(resolve).catch(reject);
      } else {
        reject(new Error("No browser runtime found"));
      }
    });
  }

  /**
   * Generate a unique ID for message tracking.
   */
  private generateId(): string {
    return Math.random().toString(36).slice(2, 11);
  }

  /**
   * Initialize online status monitoring.
   */
  private initializeOnlineStatusMonitoring(): void {
    // Check online status periodically
    this.offlineCheckInterval = self.setInterval(() => {
      this.checkOnlineStatus();
    }, 5000);

    // Listen for browser events that might indicate connectivity changes
    // In service worker context, window is not available, so we skip online/offline event listeners
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener !== "undefined"
    ) {
      window.addEventListener("online", () => {
        this.isOnline = true;
        this.processOfflineMessages();
      });

      window.addEventListener("offline", () => {
        this.isOnline = false;
      });
    }
  }

  /**
   * Check if the extension context is online and functional.
   */
  private async checkOnlineStatus(): Promise<void> {
    try {
      // Try to access browser APIs to check if context is alive
      if (browser.runtime?.id) {
        const wasOffline = !this.isOnline;
        this.isOnline = true;

        // If we just came back online, process offline messages
        if (wasOffline) {
          this.processOfflineMessages();
        }
      }
    } catch {
      this.isOnline = false;
    }
  }

  /**
   * Store a message in the offline queue.
   */
  private async storeOfflineMessage(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<void> {
    // If storage is not available, silently fail
    if (!storage) {
      return;
    }

    try {
      const offlineMessage: OfflineMessage = {
        id: this.generateId(),
        message,
        tabId,
        timestamp: Date.now(),
        retries: 0,
      };

      // Get existing offline messages
      const existingMessages = await this.getOfflineMessages();

      // Add new message
      existingMessages.push(offlineMessage);

      // Keep only the most recent messages
      const sortedMessages = existingMessages
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_OFFLINE_MESSAGES);

      // Store back to storage
      await storage.setItem("local:offlineMessages", sortedMessages);
    } catch {
      // Silent failure - can't do much if we can't store offline messages
    }
  }

  /**
   * Get offline messages from storage.
   */
  private async getOfflineMessages(): Promise<OfflineMessage[]> {
    // If storage is not available, return empty array
    if (!storage) {
      return [];
    }

    try {
      const messages = await storage.getItem("local:offlineMessages", {
        fallback: [] as OfflineMessage[],
      });

      // Filter out old messages
      const cutoffTime = Date.now() - MAX_OFFLINE_MESSAGE_AGE;
      return messages.filter((msg) => msg.timestamp > cutoffTime);
    } catch {
      return [];
    }
  }

  /**
   * Process offline messages when connection is restored.
   */
  private async processOfflineMessages(): Promise<void> {
    if (!this.isOnline) return;

    try {
      const offlineMessages = await this.getOfflineMessages();

      if (offlineMessages.length === 0) return;

      // Process messages one by one
      const processedMessageIds: string[] = [];

      for (const offlineMessage of offlineMessages) {
        try {
          // Try to send the message
          await this.send(offlineMessage.message, offlineMessage.tabId);
          processedMessageIds.push(offlineMessage.id);
        } catch {
          // Increment retry count
          offlineMessage.retries++;

          // If max retries reached, mark for removal
          if (offlineMessage.retries >= MAX_RETRIES) {
            processedMessageIds.push(offlineMessage.id);
          }
        }
      }

      // Remove processed messages from storage
      if (processedMessageIds.length > 0 && storage) {
        const remainingMessages = offlineMessages.filter(
          (msg) => !processedMessageIds.includes(msg.id),
        );
        await storage.setItem("local:offlineMessages", remainingMessages);
      }
    } catch {
      // Silent failure - will retry on next check
    }
  }

  /**
   * Enhanced send method with offline queue support.
   */
  async sendWithOfflineSupport<T = unknown>(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<T> {
    // If we're offline, store the message for later
    if (!this.isOnline) {
      await this.storeOfflineMessage(message, tabId);
      throw new Error(
        "Extension is offline - message queued for later delivery",
      );
    }

    try {
      return await this.send<T>(message, tabId);
    } catch (error: unknown) {
      // If send fails, might be due to connectivity issues
      // Store for offline processing
      await this.storeOfflineMessage(message, tabId);
      throw error;
    }
  }

  /**
   * Get the number of pending messages.
   */
  getPendingMessageCount(): number {
    return this.pendingMessages.size;
  }

  /**
   * Get the number of offline messages.
   */
  async getOfflineMessageCount(): Promise<number> {
    const offlineMessages = await this.getOfflineMessages();
    return offlineMessages.length;
  }

  /**
   * Clear all offline messages.
   */
  async clearOfflineMessages(): Promise<void> {
    // If storage is not available, silently fail
    if (!storage) {
      return;
    }

    try {
      await storage.setItem("local:offlineMessages", []);
    } catch {
      // Silent failure
    }
  }

  /**
   * Get online status.
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Cleanup resources when the MessageBus is no longer needed.
   */
  cleanup(): void {
    if (this.offlineCheckInterval) {
      self.clearInterval(this.offlineCheckInterval);
      this.offlineCheckInterval = undefined;
    }
  }

  /**
   * Get message handler service for advanced handler management.
   */
  getHandlerService() {
    return messageHandlerService;
  }

  /**
   * Validate that all required message handlers are registered.
   */
  validateHandlers(): { isValid: boolean; missingHandlers: string[] } {
    return messageHandlerService.validateHandlers();
  }
}

// Create a singleton instance of the MessageBus
export const messageBus = new MessageBus();
