import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useI18n } from '../../../hooks/useI18n';

// Mock browser APIs
const mockGetUILanguage = vi.fn(() => 'en');
const mockGetMessage = vi.fn((key: string) => {
  const messages: Record<string, string> = {
    'appName': 'Eastyles',
    'loading': 'Loading...',
    'saveButton': 'Save Style',
  };
  return messages[key] || key;
});

beforeEach(() => {
  (global as any).browser = {
    i18n: {
      getUILanguage: mockGetUILanguage,
      getMessage: mockGetMessage,
    },
  };
});

// Test component that uses the i18n hook
function TestComponent() {
  const { t, getCurrentLocale } = useI18n();

  return (
    <div>
      <h1>{t('appName')}</h1>
      <p>Locale: {getCurrentLocale()}</p>
      <button>{t('saveButton')}</button>
    </div>
  );
}

describe('useI18n', () => {
  it('should provide translation function', () => {
    render(<TestComponent />);

    expect(screen.getByText('Eastyles')).toBeTruthy();
    expect(screen.getByText('Save Style')).toBeTruthy();
    expect(screen.getByText('Locale: en')).toBeTruthy();
  });

  it('should provide locale information', () => {
    render(<TestComponent />);

    // Should show current locale
    expect(screen.getByText('Locale: en')).toBeTruthy();
  });
});