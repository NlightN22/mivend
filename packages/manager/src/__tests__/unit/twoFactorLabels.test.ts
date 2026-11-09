import { describe, expect, it } from 'vitest';
import { RECOVERED_NOTICE, TWO_FACTOR_LABELS } from '../../pages/auth/twoFactorLabels';

const LATIN_WORD = /[A-Za-z]{3,}/;
const ALLOWED = new Set(['playStore', 'appStore']);

function flatten(value: unknown, path: string, out: [string, string][]): void {
    if (typeof value === 'string') out.push([path, value]);
    else if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
}

describe('manager two-factor labels are Russian', () => {
    const entries: [string, string][] = [];
    flatten(TWO_FACTOR_LABELS, '', entries);
    entries.push(['RECOVERED_NOTICE', RECOVERED_NOTICE]);

    it.each(entries.filter(([k]) => !ALLOWED.has(k)))('%s has no Latin words', (_key, text) => {
        expect(text).toMatch(/[А-Яа-яЁё]/);
        expect(text).not.toMatch(LATIN_WORD);
    });
});
