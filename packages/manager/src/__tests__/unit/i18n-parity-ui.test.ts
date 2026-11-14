import { describe, expect, it } from 'vitest';
import en from '../../i18n/en/ui';
import ru from '../../i18n/ru/ui';

function placeholders(text: string): string[] {
    return (text.match(/\{[A-Za-z]+\}/g) ?? []).sort();
}

describe('ui catalogue', () => {
    it('has the same keys in ru and en', () => {
        expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    });

    it('keeps the same placeholders in every message', () => {
        for (const key of Object.keys(en) as (keyof typeof en)[]) {
            expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
        }
    });
});
