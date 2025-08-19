/**
 * UserCSS Variable Resolution Tests
 *
 * Tests for resolving variables in CSS content
 */

import { describe, it, expect } from 'vitest';
import { resolveVariables } from '@services/usercss/variables';

describe('UserCSS Variable Resolution', () => {
  describe('resolveVariables', () => {
    it('should resolve variables with provided values', () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
          color: /*[[--text-color]]*/ #000000;
        }
      `;
      
      const values = {
        '--bg-color': '#ff0000',
        '--text-color': '#ffffff'
      };
      
      const result = resolveVariables(css, values);
      expect(result).not.toContain('/*[[');
      expect(result).toContain('#ff0000');
      expect(result).toContain('#ffffff');
    });

    it('should use default values from annotations when no value is provided', () => {
      const css = `
        body {
          font-size: /*[[--font-size|number|16]]*/ 16px;
        }
      `;
      
      const values = {};
      
      const result = resolveVariables(css, values);
      expect(result).toContain('16');
      expect(result).not.toContain('/*[[');
    });

    it('should preserve placeholder when no value or default is available', () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
        }
      `;
      
      const values = {};
      
      const result = resolveVariables(css, values);
      expect(result).toContain('/*[[--bg-color]]*/');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const css = `
        body {
          background-color: /*[[--primary-color]]*/ #ffffff;
          border-color: /*[[--primary-color]]*/ #000000;
        }
      `;
      
      const values = {
        '--primary-color': '#ff0000'
      };
      
      const result = resolveVariables(css, values);
      const occurrences = (result.match(/#ff0000/g) || []).length;
      expect(occurrences).toBe(2);
    });

    it('should be idempotent (calling multiple times produces same result)', () => {
      const css = `
        body {
          background-color: /*[[--bg-color|color|#ffffff]]*/ #ffffff;
        }
      `;
      
      const values = {
        '--bg-color': '#ff0000'
      };
      
      const result1 = resolveVariables(css, values);
      const result2 = resolveVariables(result1, values);
      
      expect(result1).toEqual(result2);
    });

    it('should only replace touched variables when doing scoped regeneration', () => {
      // This test verifies that we could implement efficient partial updates
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
          color: /*[[--text-color]]*/ #000000;
        }
      `;
      
      // Simulate updating only one variable
      const values = {
        '--bg-color': '#ff0000'
        // --text-color not provided, should remain as placeholder
      };
      
      const result = resolveVariables(css, values);
      expect(result).toContain('#ff0000');
      expect(result).toContain('/*[[--text-color]]*/');
    });
  });
});