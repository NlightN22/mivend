import { describe, expect, it } from 'vitest';
import enSettlements from '../../i18n/en/settlements';
import ruSettlements from '../../i18n/ru/settlements';
import enPanels from '../../i18n/en/settingsPanels';
import ruPanels from '../../i18n/ru/settingsPanels';
import enParts from '../../i18n/en/dashboardParts';
import ruParts from '../../i18n/ru/dashboardParts';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('leftover catalogues', () => {
    it.each([
        ['settlements', enSettlements, ruSettlements],
        ['settingsPanels', enPanels, ruPanels],
        ['dashboardParts', enParts, ruParts],
    ])('%s has the same keys in en and ru', (_name, en, ru) => {
        expect(keys(ru).sort()).toEqual(keys(en).sort());
    });
});
