import { describe, expect, it } from 'vitest';

import {
    abbreviateLegalName,
    type LegalNameAbbreviationRule,
} from '../../qr-payment/legal-name-abbreviation';
import { cleanAbbreviationInput } from '../../qr-payment/legal-name-abbreviation-input';
import { DEFAULT_LEGAL_NAME_ABBREVIATIONS } from '../../qr-payment/default-legal-name-abbreviations';

const rules = DEFAULT_LEGAL_NAME_ABBREVIATIONS;

describe('abbreviateLegalName', () => {
    it.each([
        ['Общество с ограниченной ответственностью "Организация А"', 'ООО "Организация А"'],
        ['Общество с ограниченной ответственностью «Организация А»', 'ООО «Организация А»'],
        ['ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "А"', 'ООО "А"'],
        ['Общество  с ограниченной\tответственностью   "А"', 'ООО "А"'],
        ['Акционерное общество "А"', 'АО "А"'],
        ['Индивидуальный предприниматель Иванов Иван Иванович', 'ИП Иванов Иван Иванович'],
    ])('shortens %s', (name, expected) => {
        expect(abbreviateLegalName(name, rules)).toBe(expected);
    });

    it('prefers the longest phrase at the same position', () => {
        expect(abbreviateLegalName('Публичное акционерное общество "А"', rules)).toBe('ПАО "А"');
        expect(abbreviateLegalName('Закрытое акционерное общество "А"', rules)).toBe('ЗАО "А"');
    });

    it('prefers the longer rule regardless of rule order', () => {
        const reversed = [...rules].reverse();
        expect(abbreviateLegalName('Публичное акционерное общество "А"', reversed)).toBe('ПАО "А"');
    });

    it('returns a name without a known phrase untouched, spacing included', () => {
        expect(abbreviateLegalName('Фонд  "А"', rules)).toBe('Фонд  "А"');
        expect(abbreviateLegalName('Фонд "А"', [])).toBe('Фонд "А"');
    });

    it('does not match inside a longer word', () => {
        const custom: LegalNameAbbreviationRule[] = [{ phrase: 'Фонд', abbreviation: 'Ф' }];
        expect(abbreviateLegalName('Фондовая биржа', custom)).toBe('Фондовая биржа');
        expect(abbreviateLegalName('Фонд "А"', custom)).toBe('Ф "А"');
    });

    it('treats regex characters in a phrase literally', () => {
        const custom: LegalNameAbbreviationRule[] = [{ phrase: 'Орг. (тест)', abbreviation: 'О' }];
        expect(abbreviateLegalName('Орг. (тест) "А"', custom)).toBe('О "А"');
        expect(abbreviateLegalName('Оргx (тест) "А"', custom)).toBe('Оргx (тест) "А"');
    });

    it('is idempotent', () => {
        const once = abbreviateLegalName('Общество с ограниченной ответственностью "А"', rules);
        expect(abbreviateLegalName(once, rules)).toBe(once);
    });
});

describe('cleanAbbreviationInput', () => {
    it('trims and collapses spacing', () => {
        expect(
            cleanAbbreviationInput({ phrase: '  Акционерное   общество ', abbreviation: ' АО ' }),
        ).toEqual({ ok: true, value: { phrase: 'Акционерное общество', abbreviation: 'АО' } });
    });

    it.each([
        [{ phrase: '  ', abbreviation: 'АО' }],
        [{ phrase: 'Акционерное общество', abbreviation: '' }],
        [{ phrase: 'Акционерное общество', abbreviation: 'А|О' }],
        [{ phrase: 'Акционерное общество', abbreviation: 'А'.repeat(21) }],
        [{ phrase: 'А'.repeat(161), abbreviation: 'АО' }],
    ])('rejects %j', input => {
        expect(cleanAbbreviationInput(input).ok).toBe(false);
    });
});
