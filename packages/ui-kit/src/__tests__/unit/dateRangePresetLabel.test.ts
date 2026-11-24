import { describe, expect, it } from 'vitest';
import { DATE_RANGE_PRESETS, presetLabel } from '../../components/MvColumnFilter/dateRangePresets';

const ru = (key: string, fallback: string): string =>
    key === 'datePreset_last30' ? 'Последние 30 дней' : fallback;

describe('presetLabel', () => {
    it('takes the app translation for a default preset', () => {
        const last30 = DATE_RANGE_PRESETS.find(p => p.key === 'last30')!;
        expect(presetLabel(ru, last30)).toBe('Последние 30 дней');
    });

    it('keeps the English default when the app has no translation', () => {
        const today = DATE_RANGE_PRESETS.find(p => p.key === 'today')!;
        expect(presetLabel(ru, today)).toBe('Today');
    });

    it('never overrides a label the consumer gave its own preset', () => {
        expect(presetLabel(ru, { key: 'last30', label: 'Rolling month' })).toBe('Rolling month');
    });
});
