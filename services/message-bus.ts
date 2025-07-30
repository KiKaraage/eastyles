/**
 * Message Bus Service Interface
 *
 * This interface defines the contract for the message bus service,
 * which handles communication between different components or modules
 * within the system.
 */

export interface MessageBus {
  /**
   * Sends a message to the message bus.
   *
   * @param topic The topic or channel to send the message to.
   * @param message The message to send.
   */
  send(topic: string, message: unknown): void;

  /**
   * Subscribes to a topic or channel.
   *
   * @param topic The topic or channel to subscribe to.
   * @param callback The callback function to call when a message is received.
   */
  subscribe(topic: string, callback: (message: unknown) => void): void;

  /**
   * Unsubscribes from a topic or channel.
   *
   * @param topic The topic or channel to unsubscribe from.
   * @param callback The callback function to remove.
   */
  unsubscribe(topic: string, callback: (message: unknown) => void): void;
}

/**
 * Message Bus Service Implementation
 *
 * This class implements the message bus service interface.
 */
export class MessageBusImpl implements MessageBus {
  private topics: { [topic: string]: ((message: unknown) => void)[] };

  constructor() {
    this.topics = {};
  }

  send(topic: string, message: unknown): void {
    if (this.topics[topic]) {
      this.topics[topic].forEach((callback) => callback(message));
    }
  }

  subscribe(topic: string, callback: (message: unknown) => void): void {
    if (!this.topics[topic]) {
      this.topics[topic] = [];
    }
    this.topics[topic].push(callback);
  }

  unsubscribe(topic: string, callback: (message: unknown) => void): void {
    if (this.topics[topic]) {
      this.topics[topic] = this.topics[topic].filter((cb) => cb !== callback);
    }
  }
}

export default MessageBusImpl;
