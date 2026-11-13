import { describe, expect, it } from 'vitest';
import enSettingsSystem from '../../i18n/en/settingsSystem';
import ruSettingsSystem from '../../i18n/ru/settingsSystem';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('settingsSystem catalogues', () => {
    it('has the same keys in en and ru', () => {
        expect(keys(ruSettingsSystem).sort()).toEqual(keys(enSettingsSystem).sort());
    });
});
