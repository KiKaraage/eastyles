/**
 * Message bus service for handling communication between extension components.
 * Implements async message handling with timeout and retry mechanisms.
 * Includes offline message queuing for reliable message delivery.
 */

import { browser } from "@wxt-dev/browser";
import { storage } from "@wxt-dev/storage";
import { ReceivedMessages, SentMessages, ErrorDetails } from "./types";
import {
  isValidReceivedMessage,
  createInvalidMessageError,
} from "./validation";
import { messageHandlerService } from "./handlers";

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
  private messageQueue: Array<{ message: ReceivedMessages; tabId?: number }> =
    [];
  private isProcessingQueue = false;
  private isOnline = true;
  private offlineCheckInterval?: number;

  constructor() {
    // Set up listener for incoming messages
    this.setupMessageListener();
    // Initialize online status monitoring
    this.initializeOnlineStatusMonitoring();
    // Process any existing offline messages
    this.processOfflineMessages();
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
    // Use the message handler service to process the message
    return await messageHandlerService.handleMessage(message, tabId);
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
    return Math.random().toString(36).slice(2, 11);
  }

  /**
   * Initialize online status monitoring.
   */
  private initializeOnlineStatusMonitoring(): void {
    // Check online status periodically
    this.offlineCheckInterval = window.setInterval(() => {
      this.checkOnlineStatus();
    }, 5000);

    // Listen for browser events that might indicate connectivity changes
    if (typeof window !== "undefined") {
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
      if (browser.runtime && browser.runtime.id) {
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
      if (processedMessageIds.length > 0) {
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
      window.clearInterval(this.offlineCheckInterval);
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
