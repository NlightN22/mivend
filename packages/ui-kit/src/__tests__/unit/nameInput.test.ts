import { describe, expect, it } from 'vitest';
import { applyNameInput, formatPersonName, isValidPersonName } from '../../utils/contactFormat';

describe('formatPersonName', () => {
    it.each([
        ['', ''],
        ['и', 'И'],
        ['иван', 'Иван'],
        ['ИВАНОВ ИВАН', 'Иванов Иван'],
        ['иванов иван иванович', 'Иванов Иван Иванович'],
        ['иванов ', 'Иванов '],
        ['  иванов', 'Иванов'],
        ['иванов    иван', 'Иванов Иван'],
        ['анна-мария петрова', 'Анна-Мария Петрова'],
        ["o'brien john", "O'Brien John"],
        ['иванов и.', 'Иванов И.'],
        ['иван123 петров!', 'Иван Петров'],
        ['john smith', 'John Smith'],
    ])('%j -> %j', (raw, out) => expect(formatPersonName(raw)).toBe(out));

    it('is idempotent', () => {
        const once = formatPersonName('анна-мария  петрова ');
        expect(formatPersonName(once)).toBe(once);
    });
});

describe('applyNameInput caret', () => {
    it('keeps the caret at the end while typing', () => {
        expect(applyNameInput('иван', 4)).toEqual({ value: 'Иван', caret: 4 });
    });

    it('does not jump to the end when a character is dropped mid-string', () => {
        expect(applyNameInput('Ив1ан', 3)).toEqual({ value: 'Иван', caret: 2 });
    });

    it('shifts the caret when a double space collapses before it', () => {
        expect(applyNameInput('Иван  Петров', 6)).toEqual({ value: 'Иван Петров', caret: 5 });
    });
});

describe('isValidPersonName', () => {
    it.each([
        ['Иванов Иван', true],
        ['Иванов Иван Иванович', true],
        ['Иванов И.', true],
        ['Анна-Мария Петрова', true],
        ['Иванов', false],
        ['', false],
        ['   ', false],
        ['И И', false],
        ['Иванов 1', false],
    ])('%j -> %s', (raw, ok) => expect(isValidPersonName(raw)).toBe(ok));
});
