import { describe, test, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatShortDate,
  getFreshnessStatus,
  formatElapsedTime
} from '../src/utils/formatters';

describe('formatters', () => {
  test('formatCurrency should format correctly for CLP', () => {
    // CLP formatting uses specific spacer (e.g. dot or no decimals)
    const result = formatCurrency(5000);
    expect(result).toContain('$5.000');
  });

  test('formatDate should format correctly', () => {
    const today = new Date();
    today.setHours(10, 30);
    const result = formatDate(today.toISOString());
    expect(result).toContain('Hoy, 10:30');
  });

  test('formatShortDate should format correctly', () => {
    const d = new Date(2026, 4, 20); // May 20, 2026
    expect(formatShortDate(d)).toBe('20/05/2026');
  });

  test('getFreshnessStatus should return correct status', () => {
    const now = new Date();
    // 1 hour ago (fresh)
    const freshTime = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    expect(getFreshnessStatus(freshTime, 48)).toBe('fresh');

    // 30 hours ago (warning, since > 24)
    const warningTime = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(getFreshnessStatus(warningTime, 48)).toBe('warning');

    // 50 hours ago (danger, since > 48)
    const dangerTime = new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString();
    expect(getFreshnessStatus(dangerTime, 48)).toBe('danger');
  });

  test('formatElapsedTime should format correctly', () => {
    expect(formatElapsedTime(null)).toBe('0h 0m');
  });
});
