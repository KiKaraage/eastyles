import { contentController } from '../services/usercss/content-controller';
import { logger } from '../services/errors/logger';
import { ErrorSource } from '../services/errors/service';
import { UserCSSStyle } from '../services/storage/schema';

// Types for content script messages
type ContentScriptMessage =
  | {
      type: 'styleUpdate';
      styleId: string;
      style: UserCSSStyle;
    }
  | {
      type: 'styleRemove';
      styleId: string;
    }
  | {
      type: 'VARIABLES_UPDATED';
      payload: {
        styleId: string;
        variables: Record<string, string>;
        timestamp: number;
      };
    };

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

      // Set up message listener for style updates and variable changes
      browser.runtime.onMessage.addListener((message: ContentScriptMessage) => {
        try {
          if (message.type === 'styleUpdate' && message.styleId && message.style) {
            contentController.onStyleUpdate(message.styleId, message.style);
          } else if (message.type === 'styleRemove' && message.styleId) {
            contentController.onStyleRemove(message.styleId);
          } else if (message.type === 'VARIABLES_UPDATED' && message.payload) {
            const { styleId, variables } = message.payload;
            contentController.onVariablesUpdate(styleId, variables);
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
