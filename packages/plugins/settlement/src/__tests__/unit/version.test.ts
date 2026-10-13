import { describe, expect, it } from 'vitest';

import { isNewerVersion, shouldApplyDocument } from '../../version';

describe('isNewerVersion', () => {
    it('orders ISO send-times by time, not lexicographically across formats', () => {
        expect(isNewerVersion('2026-10-13T10:00:00.5Z', '2026-10-13T10:00:00Z')).toBe(true);
        expect(isNewerVersion('2026-10-13T10:00:00Z', '2026-10-13T10:00:00.5Z')).toBe(false);
    });

    it('orders numeric versions by value', () => {
        expect(isNewerVersion('10', '9')).toBe(true);
        expect(isNewerVersion('9', '10')).toBe(false);
    });

    it('treats an equal version as not newer', () => {
        expect(isNewerVersion('2026-10-13T10:00:00Z', '2026-10-13T10:00:00Z')).toBe(false);
    });
});

describe('shouldApplyDocument', () => {
    const stored = { version: '2026-10-13T10:00:00Z', isDeleted: false };

    it('applies when nothing is stored', () => {
        expect(shouldApplyDocument({ version: '1', isDeleted: false }, null)).toBe(true);
    });

    it('drops a stale or duplicate version', () => {
        expect(
            shouldApplyDocument({ version: '2026-10-13T09:00:00Z', isDeleted: false }, stored),
        ).toBe(false);
        expect(shouldApplyDocument({ ...stored }, stored)).toBe(false);
    });

    it('lets a tombstone win a version tie, but not an older version', () => {
        expect(shouldApplyDocument({ ...stored, isDeleted: true }, stored)).toBe(true);
        expect(
            shouldApplyDocument({ version: '2026-10-13T09:00:00Z', isDeleted: true }, stored),
        ).toBe(false);
    });

    it('does not let a same-version upsert resurrect a tombstone', () => {
        expect(shouldApplyDocument({ ...stored }, { ...stored, isDeleted: true })).toBe(false);
    });
});
