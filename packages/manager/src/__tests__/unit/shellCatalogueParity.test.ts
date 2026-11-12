import { describe, expect, it } from 'vitest';
import enAuth from '../../i18n/en/auth';
import ruAuth from '../../i18n/ru/auth';
import enShell from '../../i18n/en/shell';
import ruShell from '../../i18n/ru/shell';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe.each([
    ['shell', enShell, ruShell],
    ['auth', enAuth, ruAuth],
])('%s catalogue', (_name, en, ru) => {
    it('has the same keys in ru and en', () => {
        expect(keys(ru).sort()).toEqual(keys(en).sort());
    });
});
