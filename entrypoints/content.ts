import { contentController } from '../services/usercss/content-controller';
import { logger } from '../services/errors/logger';
import { ErrorSource } from '../services/errors/service';

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("UserCSS content script initializing...");

    try {
      // Initialize the content controller
      contentController.initialize().then(() => {
        console.log("UserCSS content controller initialized successfully");
      }).catch((error) => {
        logger.error?.(
          ErrorSource.CONTENT,
          'Failed to initialize UserCSS content controller',
          { error: error instanceof Error ? error.message : String(error) }
        );
      });

      // Set up message listener for style updates
      browser.runtime.onMessage.addListener((message: any) => {
        try {
          if (message.type === 'styleUpdate' && message.styleId && message.style) {
            contentController.onStyleUpdate(message.styleId, message.style);
          } else if (message.type === 'styleRemove' && message.styleId) {
            contentController.onStyleRemove(message.styleId);
          }
        } catch (error) {
          logger.error?.(
            ErrorSource.CONTENT,
            'Failed to handle message',
            {
              error: error instanceof Error ? error.message : String(error),
              messageType: message.type
            }
          );
        }
      });

    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        'Failed to initialize UserCSS content script',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
