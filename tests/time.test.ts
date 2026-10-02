import { it, expect } from 'vitest';
import { isoDate } from '../src/components/ui';
it('interprets dates in the selected timezone', () =>
  expect(isoDate('2025-01-02T10:00', 'America/Mexico_City')).toBe('2025-01-02T16:00:00.000Z'));
it('rejects nonexistent daylight-saving local times', () =>
  expect(() => isoDate('2025-03-09T02:30', 'America/New_York')).toThrow('no existe'));
it('rejects ambiguous daylight-saving local times', () =>
  expect(() => isoDate('2025-11-02T01:30', 'America/New_York')).toThrow('ambigua'));
