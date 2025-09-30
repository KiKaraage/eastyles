/**
 * Message types for communication between extension components.
 * Defines the contract for message passing between background script, popup, and manager page.
 */

import { VariableDescriptor } from "../usercss/types";

// Response types for popup messages
export interface PopupMessageResponses {
  [key: string]: {
    success: boolean;
    error?: string;
    styleId?: string;
    styles?: unknown[];
  };
  QUERY_STYLES_FOR_URL: {
    success: boolean;
    error?: string;
    styles?: import("../storage/schema").UserCSSStyle[];
  };
}

// Response types for save page messages
export interface SaveMessageResponses {
  PARSE_USERCSS: {
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
      variables?: Record<string, VariableDescriptor>;
    };
    css?: string;
    metadataBlock?: string;
    warnings?: string[];
    errors?: string[];
  };
  INSTALL_STYLE: {
    success: boolean;
    error?: string;
    styleId?: string;
  };
  INJECT_FONT: {
    success: boolean;
    error?: string;
  };
  CREATE_FONT_STYLE: {
    success: boolean;
    error?: string;
    styleId?: string;
  };
  UPDATE_FONT_STYLE: {
    success: boolean;
    error?: string;
    styleId?: string;
  };
}

// Response types for content script messages
export interface ContentMessageResponses {
  QUERY_STYLES_FOR_URL: {
    success: boolean;
    error?: string;
    styles?: import("../storage/schema").UserCSSStyle[];
  };
  FETCH_ASSETS: {
    success: boolean;
    error?: string;
    assets?: Array<{
      url: string;
      type: "image" | "font" | "other";
      dataUrl?: string;
      error?: string;
    }>;
  };
}

/**
 * Messages sent from the background script to other components.
 */
export type BackgroundMessages =
  | {
      type: "ERROR_REPORTED";
      payload: {
        error: ErrorDetails;
      };
    }
  | {
      type: "STORAGE_UPDATED";
      payload: {
        key: string;
        newValue: unknown;
        oldValue: unknown;
      };
    }
  | {
      type: "VARIABLES_UPDATED";
      payload: {
        styleId: string;
        variables: Record<string, string>;
        timestamp: number;
      };
    }
  | {
      type: "STYLE_REAPPLY_REQUEST";
      payload: {
        styleId: string;
        reason: string;
        timestamp: number;
      };
    };

/**
 * Messages sent from the popup to the background script.
 */
export type PopupMessages =
  | {
      type: "OPEN_MANAGER";
      payload?: {
        url?: string;
      };
    }
  | {
      type: "ADD_STYLE";
      payload?: {
        template?: string;
      };
    }
  | {
      type: "OPEN_SETTINGS";
      payload?: {
        section?: string;
      };
    }
  | {
      type: "GET_STYLES";
      payload?: {
        ids?: string[];
      };
    }
  | {
      type: "TOGGLE_STYLE";
      payload: {
        id: string;
        enabled: boolean;
        tabId?: number;
      };
    }
  | {
      type: "THEME_CHANGED";
      payload: {
        theme: "light" | "dark" | "system";
      };
    }
  | {
      type: "GET_CURRENT_TAB";
    }
  | {
      type: "TOGGLE_THEME";
    }
  | {
      type: "RESET_SETTINGS";
    }
  | {
      type: "UPDATE_VARIABLES";
      payload: {
        styleId: string;
        variables: Record<string, string>;
      };
    }
  | {
      type: "QUERY_STYLES_FOR_URL";
      payload: {
        url: string;
      };
    };

/**
 * Messages sent from the manager page to the background script.
 */
export type ManagerMessages =
  | {
      type: "REQUEST_EXPORT";
      payload: {
        format: "json";
      };
    }
  | {
      type: "REQUEST_IMPORT";
      payload: {
        data: string;
      };
    }
  | {
      type: "RESET_SETTINGS";
    }
  | {
      type: "GET_ALL_STYLES";
    };

/**
 * Messages sent from the save page to the background script.
 */
export type SaveMessages =
  | {
      type: "PARSE_USERCSS";
      payload: {
        text: string;
        sourceUrl?: string;
      };
    }
  | {
      type: "INSTALL_STYLE";
      payload: {
        meta: {
          name: string;
          namespace: string;
          version: string;
          description: string;
          author: string;
          sourceUrl: string;
          domains: string[];
          variables?: Record<string, VariableDescriptor>;
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
    }
  | {
      type: "INJECT_FONT";
      payload: {
        fontName: string;
        css: string;
      };
    }
   | {
       type: "CREATE_FONT_STYLE";
       payload: {
         domain?: string;
         fontName: string;
       };
     }
   | {
       type: "UPDATE_FONT_STYLE";
       payload: {
         styleId: string;
         domain?: string;
         fontName: string;
       };
     };

/**
 * Messages sent from the content script to the background script.
 */
export type ContentMessages =
  | {
      type: "QUERY_STYLES_FOR_URL";
      payload: {
        url: string;
      };
    }
  | {
      type: "FETCH_ASSETS";
      payload: {
        assets: Array<{
          url: string;
          type: "image" | "font" | "other";
        }>;
      };
    };

/**
 * Union type of all possible message types that can be received by the background script.
 */
export type ReceivedMessages =
  | PopupMessages
  | ManagerMessages
  | SaveMessages
  | ContentMessages;

/**
 * Union type of all possible message types that can be sent from the background script.
 */
export type SentMessages = BackgroundMessages;

/**
 * Common error details structure for error reporting.
 */
export interface ErrorDetails {
  message: string;
  stack?: string;
  source: "background" | "popup" | "manager" | "content";
  timestamp: number;
  severity: "silent" | "notify" | "fatal";
}
