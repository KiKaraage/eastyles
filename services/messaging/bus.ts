/**
 * Message bus service for handling communication between extension components.
 * Implements async message handling with timeout and retry mechanisms.
 */

import { browser } from "@wxt-dev/browser";
import { ReceivedMessages, SentMessages, ErrorDetails } from "./types";
import {
  isValidReceivedMessage,
  createInvalidMessageError,
} from "./validation";

// Default timeout for message responses (5 seconds)
const DEFAULT_TIMEOUT = 5000;

// Maximum number of retry attempts for failed messages
const MAX_RETRIES = 3;

// Interface for message response tracking
interface PendingMessage {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
  retries: number;
}

/**
 * MessageBus class that handles sending and receiving messages between extension components.
 * Provides reliable communication with timeout and retry mechanisms.
 */
export class MessageBus {
  private pendingMessages = new Map<string, PendingMessage>();
  private messageIdCounter = 0;
  private messageQueue: Array<{ message: ReceivedMessages; tabId?: number }> =
    [];
  private isProcessingQueue = false;

  constructor() {
    // Set up listener for incoming messages
    this.setupMessageListener();
  }

  /**
   * Set up the message listener to handle responses from other components.
   */
  private setupMessageListener(): void {
    const listener = (
      message: unknown,
      sender: { tab?: { id?: number } },
      _sendResponse: (response?: unknown) => void,
    ) => {
      this.handleIncomingMessage(message, sender.tab?.id);
      return true; // Keep message channel open for async response
    };

    if (typeof browser !== "undefined" && browser.runtime) {
      browser.runtime.onMessage.addListener(listener);
    }
  }

  /**
   * Handle incoming messages from other extension components.
   */
  private handleIncomingMessage(message: unknown, tabId?: number): boolean {
    // First check if this is a response to a pending message
    const messageObj = message as Record<string, unknown>;
    if (messageObj.replyTo && typeof messageObj.replyTo === "string") {
      const pending = this.pendingMessages.get(messageObj.replyTo);
      if (pending) {
        // Clear the timeout
        window.clearTimeout(pending.timeoutId);
        this.pendingMessages.delete(messageObj.replyTo as string);

        // Resolve or reject the promise based on the response
        if (messageObj.error) {
          pending.reject(messageObj.error);
        } else {
          pending.resolve(messageObj.response);
        }
      }
      return true;
    }

    // Check if this is a valid received message
    if (!isValidReceivedMessage(message)) {
      // Send error response
      this.sendError(message, createInvalidMessageError(message, "unknown"));
      return true;
    }

    // This is a new message that needs to be processed
    // Add to queue for processing
    this.messageQueue.push({ message: message as ReceivedMessages, tabId });

    // Process the queue if not already doing so
    if (!this.isProcessingQueue) {
      this.processMessageQueue();
    }

    return true;
  }

  /**
   * Process messages in the queue sequentially.
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const { message, tabId } = this.messageQueue.shift()!;

      try {
        // Process the message and get a response
        const response = await this.processMessage(message, tabId);

        // Send the response back
        if (browser.tabs && tabId) {
          await browser.tabs.sendMessage(tabId, {
            replyTo: message.type,
            response,
          });
        }
      } catch (error: unknown) {
        // Send error response
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack || "" : "";
        this.sendError(message, {
          message: errorMessage,
          stack: errorStack,
          source: "background",
          timestamp: Date.now(),
          severity: "notify",
        });
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Process a received message and return a response.
   */
  private async processMessage(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<unknown> {
    // This is a placeholder for actual message handling logic
    // In a real implementation, this would route messages to appropriate handlers
    switch (message.type) {
      case "GET_CURRENT_TAB":
        return tabId ? { id: tabId } : null;
      case "TOGGLE_THEME":
        // Placeholder for theme toggling logic
        return { success: true };
      case "REQUEST_EXPORT":
        // Placeholder for export logic
        return { data: "exported-data", format: "json" };
      case "REQUEST_IMPORT":
        // Placeholder for import logic
        return { success: true, importedCount: 1 };
      case "RESET_SETTINGS":
        // Placeholder for reset logic
        return { success: true };
      case "GET_ALL_STYLES":
        // Placeholder for getting all styles
        return { styles: [] };
      case "OPEN_MANAGER":
        // Placeholder for opening manager page
        return { success: true };
      default:
        throw new Error(
          `Unknown message type: ${(message as { type: string }).type}`,
        );
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

      // Set up timeout mechanism
      const timeoutId = window.setTimeout(() => {
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
    window.clearTimeout(pending.timeoutId);

    // Set up a new timeout with exponential backoff
    const delay = DEFAULT_TIMEOUT * Math.pow(2, pending.retries);
    pending.timeoutId = window.setTimeout(() => {
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

    if (tabId !== undefined) {
      // Send to specific tab
      if (browser.tabs) {
        browser.tabs.sendMessage(tabId, messageWithId).catch((error) => {
          const pending = this.pendingMessages.get(messageId);
          if (pending) {
            this.pendingMessages.delete(messageId);
            window.clearTimeout(pending.timeoutId);
            pending.reject(error);
          }
        });
      }
    } else {
      // Send to background script or other context
      if (browser.runtime) {
        browser.runtime.sendMessage(messageWithId).catch((error) => {
          const pending = this.pendingMessages.get(messageId);
          if (pending) {
            this.pendingMessages.delete(messageId);
            window.clearTimeout(pending.timeoutId);
            pending.reject(error);
          }
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
    if (browser.tabs && browser.tabs.query) {
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
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get the number of pending messages.
   */
  getPendingMessageCount(): number {
    return this.pendingMessages.size;
  }
}

// Create a singleton instance of the MessageBus
export const messageBus = new MessageBus();
