import { describe, it, expect, beforeEach, vi } from 'vitest';
import { I18nService } from '../../../services/i18n/service';

// Mock browser APIs
const mockGetUILanguage = vi.fn(() => 'en');
const mockGetMessage = vi.fn((key: string, _substitutions?: string | string[]) => {
  const messages: Record<string, string> = {
        'saveButton': 'Save Style',
    'cancelButton': 'Cancel',
    'appName': 'Eastyles',
    'styleInstalled': 'Style installed successfully',
    'missingKey': '',
  };

  return messages[key] || '';
});

// Mock the browser global before each test
beforeEach(() => {
  (global as any).browser = {
    i18n: {
      getUILanguage: mockGetUILanguage,
      getMessage: mockGetMessage,
    },
  };
});

describe('I18nService', () => {
  let i18nService: I18nService;

  beforeEach(() => {
    i18nService = new I18nService();
    i18nService.clearCache();
    vi.clearAllMocks();
  });

  describe('getCurrentLocale', () => {
    it('should return the UI language', () => {
      mockGetUILanguage.mockReturnValue('id');
      expect(i18nService.getCurrentLocale()).toBe('id');
    });

    it('should fallback to default locale when getUILanguage fails', () => {
      mockGetUILanguage.mockImplementation(() => {
        throw new Error('API not available');
      });
      expect(i18nService.getCurrentLocale()).toBe('en');
    });
  });

  describe('t (translate)', () => {
    it('should return translated message for existing key', () => {
      const result = i18nService.t('saveButton');
      expect(result).toBe('Save Style');
    });

    it('should return key when translation is missing', () => {
      const result = i18nService.t('nonexistentKey');
      expect(result).toBe('nonexistentKey');
    });

    it('should handle substitutions', () => {
      mockGetMessage.mockReturnValue('Hello $1!');
      const result = i18nService.t('greeting', ['World']);
      expect(result).toBe('Hello $1!');
      expect(mockGetMessage).toHaveBeenCalledWith('greeting', ['World']);
    });

    it('should cache translations', () => {
      i18nService.t('saveButton');
      i18nService.t('saveButton'); // Should use cache

      expect(mockGetMessage).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', () => {
      i18nService.t('saveButton');
      i18nService.clearCache();
      i18nService.t('saveButton');

      expect(mockGetMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('hasMessage', () => {
    it('should return true for existing messages', () => {
      expect(i18nService.hasMessage('saveButton')).toBe(true);
    });

    it('should return false for missing messages', () => {
      expect(i18nService.hasMessage('nonexistentKey')).toBe(false);
    });
  });

  describe('getAvailableLocales', () => {
    it('should return list of available locales', () => {
      const locales = i18nService.getAvailableLocales();
      expect(locales).toEqual(['en', 'id']);
    });
  });
});