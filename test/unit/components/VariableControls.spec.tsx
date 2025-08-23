/**
 * VariableControls Component Tests
 *
 * Tests for the VariableControls component covering all variable types,
 * min/max clamping, and select options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariableControls } from '../../../components/features/VariableControls';
import { VariableDescriptor } from '../../../services/usercss/types';

describe('VariableControls', () => {
  const mockOnChange = vi.fn();

  const createVariable = (overrides: Partial<VariableDescriptor>): VariableDescriptor => ({
    name: '--test-var',
    type: 'text',
    default: 'default-value',
    value: 'current-value',
    ...overrides,
  });

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Rendering', () => {
    it('renders empty state when no variables provided', () => {
      render(<VariableControls variables={[]} onChange={mockOnChange} />);
      expect(screen.getByText('No configurable variables available')).toBeTruthy();
    });

    it('renders empty state when variables array is undefined', () => {
      render(<VariableControls variables={undefined} onChange={mockOnChange} />);
      expect(screen.getByText('No configurable variables available')).toBeTruthy();
    });

    it('renders title and variables grid', () => {
      const variables = [createVariable({ name: '--color', type: 'color', value: '#ff0000' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      expect(screen.getByText('Variable Configuration')).toBeTruthy();
      expect(screen.getByDisplayValue('#ff0000')).toBeTruthy();
    });
  });

  describe('Color Variable Type', () => {
    it('renders color input for color type', () => {
      const variables = [createVariable({ name: '--accent-color', type: 'color', value: '#ff0000' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const colorInput = screen.getByDisplayValue('#ff0000');
      expect(colorInput.getAttribute('type')).toBe('color');
      expect(screen.getByText('accent-color')).toBeTruthy();
    });

    it('calls onChange when color value changes', () => {
      const variables = [createVariable({ name: '--color', type: 'color', value: '#ff0000' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const colorInput = screen.getByDisplayValue('#ff0000');
      fireEvent.change(colorInput, { target: { value: '#00ff00' } });

      expect(mockOnChange).toHaveBeenCalledWith('--color', '#00ff00');
    });
  });

  describe('Number Variable Type', () => {
    it('renders number input for number type', () => {
      const variables = [createVariable({
        name: '--font-size',
        type: 'number',
        value: '16',
        min: 8,
        max: 72
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const numberInput = screen.getByDisplayValue('16');
      expect(numberInput.getAttribute('type')).toBe('number');
      expect(numberInput.getAttribute('min')).toBe('8');
      expect(numberInput.getAttribute('max')).toBe('72');
      expect(screen.getByText('font-size')).toBeTruthy();
    });

    it('calls onChange when number value changes', () => {
      const variables = [createVariable({ name: '--size', type: 'number', value: '16' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const numberInput = screen.getByDisplayValue('16');
      fireEvent.change(numberInput, { target: { value: '24' } });

      expect(mockOnChange).toHaveBeenCalledWith('--size', '24');
    });

    it('handles min/max constraints', () => {
      const variables = [createVariable({
        name: '--opacity',
        type: 'number',
        value: '50',
        min: 0,
        max: 100
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const numberInput = screen.getByDisplayValue('50');
      expect(numberInput.getAttribute('min')).toBe('0');
      expect(numberInput.getAttribute('max')).toBe('100');
    });
  });

  describe('Text Variable Type', () => {
    it('renders text input for text type', () => {
      const variables = [createVariable({
        name: '--font-family',
        type: 'text',
        value: 'Arial'
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const textInput = screen.getByDisplayValue('Arial');
      expect(textInput.getAttribute('type')).toBe('text');
      expect(screen.getByText('font-family')).toBeTruthy();
    });

    it('calls onChange when text value changes', () => {
      const variables = [createVariable({ name: '--text', type: 'text', value: 'hello' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const textInput = screen.getByDisplayValue('hello');
      fireEvent.change(textInput, { target: { value: 'world' } });

      expect(mockOnChange).toHaveBeenCalledWith('--text', 'world');
    });

    it('shows placeholder with default value', () => {
      const variables = [createVariable({
        name: '--placeholder',
        type: 'text',
        value: '',
        default: 'default-text'
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const textInput = screen.getByPlaceholderText('default-text');
      expect(textInput).toBeTruthy();
    });
  });

  describe('Select Variable Type', () => {
    it('renders select dropdown for select type', () => {
      const variables = [createVariable({
        name: '--theme',
        type: 'select',
        value: 'dark',
        options: ['light', 'dark', 'auto']
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const selectElement = screen.getByDisplayValue('dark');
      expect(selectElement.tagName).toBe('SELECT');
      expect(screen.getByText('theme')).toBeTruthy();

      // Check options are rendered
      expect(screen.getByText('light')).toBeTruthy();
      expect(screen.getByText('dark')).toBeTruthy();
      expect(screen.getByText('auto')).toBeTruthy();
    });

    it('calls onChange when select value changes', () => {
      const variables = [createVariable({
        name: '--mode',
        type: 'select',
        value: 'light',
        options: ['light', 'dark']
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const selectElement = screen.getByDisplayValue('light');
      fireEvent.change(selectElement, { target: { value: 'dark' } });

      expect(mockOnChange).toHaveBeenCalledWith('--mode', 'dark');
    });

    it('handles empty options gracefully', () => {
      const variables = [createVariable({
        name: '--empty-select',
        type: 'select',
        value: 'value',
        options: []
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const selectElement = screen.getByTitle('Select option for --empty-select');
      expect(selectElement.tagName).toBe('SELECT');
    });
  });

  describe('Unknown Variable Type', () => {
    it('renders text input for unknown type', () => {
      const variables = [createVariable({
        name: '--unknown',
        type: 'unknown',
        value: 'fallback'
      })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const textInput = screen.getByDisplayValue('fallback');
      expect(textInput.getAttribute('type')).toBe('text');
      expect(screen.getByText('unknown')).toBeTruthy();
    });
  });

  describe('Multiple Variables', () => {
    it('renders multiple variables with different types', () => {
      const variables = [
        createVariable({ name: '--color', type: 'color', value: '#ff0000' }),
        createVariable({ name: '--size', type: 'number', value: '16' }),
        createVariable({ name: '--text', type: 'text', value: 'hello' }),
        createVariable({ name: '--theme', type: 'select', value: 'dark', options: ['light', 'dark'] })
      ];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      expect(screen.getByDisplayValue('#ff0000')).toBeTruthy();
      expect(screen.getByDisplayValue('16')).toBeTruthy();
      expect(screen.getByDisplayValue('hello')).toBeTruthy();
      expect(screen.getByDisplayValue('dark')).toBeTruthy();
    });

    it('calls onChange with correct variable name for each control', () => {
      const variables = [
        createVariable({ name: '--first', type: 'text', value: 'value1' }),
        createVariable({ name: '--second', type: 'text', value: 'value2' })
      ];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const firstInput = screen.getByDisplayValue('value1');
      const secondInput = screen.getByDisplayValue('value2');

      fireEvent.change(firstInput, { target: { value: 'new1' } });
      fireEvent.change(secondInput, { target: { value: 'new2' } });

      expect(mockOnChange).toHaveBeenCalledWith('--first', 'new1');
      expect(mockOnChange).toHaveBeenCalledWith('--second', 'new2');
    });
  });

  describe('CSS Classes and Styling', () => {
    it('applies custom className', () => {
      const variables = [createVariable({ name: '--test', type: 'text' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} className="custom-class" />);

      const container = screen.getByText('Variable Configuration').parentElement;
      expect(container?.className).toContain('custom-class');
    });

    it('uses daisyUI classes for styling', () => {
      const variables = [createVariable({ name: '--test', type: 'color', value: '#000000' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      const colorInput = screen.getByDisplayValue('#000000');
      expect(colorInput.className).toContain('input');
      expect(colorInput.className).toContain('input-bordered');
      expect(colorInput.className).toContain('input-sm');
    });
  });

  describe('Variable Name Display', () => {
    it('removes -- prefix from variable names in labels', () => {
      const variables = [createVariable({ name: '--my-variable', type: 'text' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      expect(screen.getByText('my-variable')).toBeTruthy();
      expect(screen.queryByText('--my-variable')).toBeNull();
    });

    it('handles variable names without -- prefix', () => {
      const variables = [createVariable({ name: 'simple-name', type: 'text' })];
      render(<VariableControls variables={variables} onChange={mockOnChange} />);

      expect(screen.getByText('simple-name')).toBeTruthy();
    });
  });
});