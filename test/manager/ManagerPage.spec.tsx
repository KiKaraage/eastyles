/**
 * ManagerPage Component Tests
 *
 * Tests for the Manager Page UI component that displays and manages UserCSS styles.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManagerPage from '../../components/features/manager/ManagerPage';
import { UserCSSStyle } from '@services/storage/schema';
import { storageClient } from '@services/storage/client';

// Mock storage client
vi.mock('../../services/storage/client', () => ({
  storageClient: {
    getUserCSSStyles: vi.fn(),
    enableUserCSSStyle: vi.fn(),
    removeUserCSSStyle: vi.fn(),
    updateUserCSSStyleVariables: vi.fn(),
    watchUserCSSStyles: vi.fn(() => vi.fn()),
  },
}));

// Mock useMessage hook
vi.mock('../../hooks/useMessage', () => ({
  useMessage: () => ({
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  }),
  PopupMessageType: {
    TOGGLE_STYLE: 'TOGGLE_STYLE',
  },
}));

// Mock window.confirm
const mockConfirm = vi.fn();
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: mockConfirm,
});

describe('ManagerPage', () => {
  const mockStyles: UserCSSStyle[] = [
    {
      id: 'style-1',
      name: 'Test Style 1',
      namespace: 'test',
      version: '1.0.0',
      description: 'A test style',
      author: 'Test Author',
      sourceUrl: 'https://example.com/style.user.css',
      domains: [
        { kind: 'domain', pattern: 'example.com', include: true },
        { kind: 'url-prefix', pattern: 'https://test.com', include: true },
      ],
      compiledCss: 'body { color: red; }',
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: '/* ==UserStyle== */ body { color: red; }',
    },
    {
      id: 'style-2',
      name: 'Test Style 2',
      namespace: 'test',
      version: '1.0.0',
      description: 'Another test style',
      author: 'Test Author 2',
      sourceUrl: 'https://example.com/style2.user.css',
      domains: [],
      compiledCss: 'body { color: blue; }',
      variables: {
        '--accent-color': {
          name: '--accent-color',
          type: 'color',
          default: '#ff0000',
          value: '#00ff00',
        },
      },
      originalDefaults: { '--accent-color': '#ff0000' },
      assets: [],
      installedAt: Date.now(),
      enabled: false,
      source: '/* ==UserStyle== */ body { color: blue; }',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(true);

    // Mock storage client methods
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue(mockStyles);
    vi.mocked(storageClient.watchUserCSSStyles).mockReturnValue(vi.fn());
  });

  it('renders list of styles', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Style 1')).toBeTruthy();
      expect(screen.getByText('Test Style 2')).toBeTruthy();
    });
  });

  it('shows status labels correctly', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const activeBadge = screen.getByText('Active');
      const disabledBadge = screen.getByText('Disabled');

      expect(activeBadge).toBeTruthy();
      expect(disabledBadge).toBeTruthy();
    });
  });

  it('applies 50% opacity to disabled styles', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const styleCards = screen.getAllByText(/Test Style/);
      // The disabled style should have opacity-50 class applied to its card
      const disabledCard = styleCards[1].closest('.card');
      expect(disabledCard?.className).toContain('opacity-50');
    });
  });

  it('toggles style enabled state', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const toggleButtons = screen.getAllByRole('button', { name: /disable|enable/i });
      expect(toggleButtons).toHaveLength(2);
    });

    const toggleButtons = screen.getAllByRole('button', { name: /disable|enable/i });
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(storageClient.enableUserCSSStyle).toHaveBeenCalledWith('style-1', false);
    });
  });

  it('shows configure button only for styles with variables', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const configureButtons = screen.getAllByTitle('Configure variables');
      expect(configureButtons).toHaveLength(1); // Only style-2 has variables
    });
  });

  it('expands variable controls when configure button is clicked', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const configureButton = screen.getByTitle('Configure variables');
      fireEvent.click(configureButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Variable Configuration')).toBeTruthy();
    });
  });

  it('deletes style with confirmation', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete style');
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        'Are you sure you want to delete "Test Style 1"? This action cannot be undone.'
      );
      expect(storageClient.removeUserCSSStyle).toHaveBeenCalledWith('style-1');
    });
  });

  it('cancels deletion when user declines confirmation', async () => {
    mockConfirm.mockReturnValueOnce(false);

    render(<ManagerPage />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete style');
      fireEvent.click(deleteButtons[0]);
    });

    expect(storageClient.removeUserCSSStyle).not.toHaveBeenCalled();
  });

  it('formats domains correctly', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText('Domains: example.com, https://test.com*')).toBeTruthy();
      expect(screen.getByText('Domains: All sites')).toBeTruthy();
    });
  });

  it('shows empty state when no styles are installed', async () => {
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue([]);

    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText('No styles installed')).toBeTruthy();
    });
  });

  it('shows drag and drop zone', async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const dropZone = screen.getByText('Drop UserCSS files here to import');
      expect(dropZone).toBeTruthy();
    });
  });

  it('shows loading state', () => {
    vi.mocked(storageClient.getUserCSSStyles).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<ManagerPage />);

    expect(document.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('displays error messages', async () => {
    const errorMessage = 'Failed to load styles';
    vi.mocked(storageClient.getUserCSSStyles).mockRejectedValue(new Error(errorMessage));

    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeTruthy();
    });
  });
});