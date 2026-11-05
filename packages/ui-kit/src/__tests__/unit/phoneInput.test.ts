import { describe, expect, it } from 'vitest';
import { applyPhoneInput, isValidPhone } from '../../utils/phoneFormat';

interface Field {
    value: string;
    caret: number;
}

function type(field: Field, text: string): Field {
    let cur = field;
    for (const ch of text) {
        const raw = cur.value.slice(0, cur.caret) + ch + cur.value.slice(cur.caret);
        cur = applyPhoneInput(cur.value, raw, cur.caret + 1, false);
    }
    return cur;
}

function backspace(field: Field): Field {
    if (field.caret === 0) return field;
    const raw = field.value.slice(0, field.caret - 1) + field.value.slice(field.caret);
    return applyPhoneInput(field.value, raw, field.caret - 1, true);
}

function replaceRange(field: Field, from: number, to: number, text: string): Field {
    const raw = field.value.slice(0, from) + text + field.value.slice(to);
    return applyPhoneInput(field.value, raw, from + text.length, false);
}

const empty: Field = { value: '', caret: 0 };
const ru = type(empty, '9131234567');

describe('typing a Russian number', () => {
    it('adds +7 and formats while typing', () => {
        expect(type(empty, '9').value).toBe('+7 9');
        expect(type(empty, '913').value).toBe('+7 913');
        expect(ru.value).toBe('+7 913 123 45 67');
        expect(ru.caret).toBe(ru.value.length);
    });

    it('treats a leading 8 as the trunk prefix and a leading 7 as the country code', () => {
        expect(type(empty, '89131234567').value).toBe('+7 913 123 45 67');
        expect(type(empty, '79131234567').value).toBe('+7 913 123 45 67');
    });

    it('accepts +7 typed by hand', () => {
        expect(type(empty, '+').value).toBe('+');
        expect(type(empty, '+7').value).toBe('+7');
        expect(type(empty, '+7913').value).toBe('+7 913');
        expect(type(empty, '+78121234567').value).toBe('+7 812 123 45 67');
    });

    it('ignores letters and digits beyond the length of a number', () => {
        expect(type(empty, 'abc').value).toBe('');
        expect(type(empty, '+4412345678901234').value).toBe('+44 1234 567890');
        expect(isValidPhone(type(empty, '+79131234567890').value)).toBe(false);
        expect(
            type(empty, '+3801234567890123456').value.replace(/\D/g, '').length,
        ).toBeLessThanOrEqual(15);
    });
});

describe('other countries', () => {
    it.each([
        ['+441234567890', '+44 1234 567890'],
        ['+905321234567', '+90 532 123 45 67'],
        ['+380441234567', '+380 44 123 4567'],
    ])('%s -> %s', (typed, shown) => expect(type(empty, typed).value).toBe(shown));

    it('lets the user erase +7 and type another country code', () => {
        const start = type(empty, '9131234567');
        const replaced = replaceRange(start, 0, 2, '+44');
        expect(replaced.value.startsWith('+44')).toBe(true);
        const cleared = replaceRange(start, 0, start.value.length, '+90 532 123 45 67');
        expect(cleared.value).toBe('+90 532 123 45 67');
    });

    it('selecting everything and typing a national digit restarts as Russian', () => {
        expect(replaceRange(ru, 0, ru.value.length, '9').value).toBe('+7 9');
    });
});

describe('pasting', () => {
    it.each([
        ['89131234567', '+7 913 123 45 67'],
        ['+7 (913) 123-45-67', '+7 913 123 45 67'],
        ['8 913 123 45 67', '+7 913 123 45 67'],
        ['9131234567', '+7 913 123 45 67'],
        ['+44 20 7946 0958', '+44 20 7946 0958'],
    ])('%s -> %s', (pasted, shown) =>
        expect(applyPhoneInput('', pasted, pasted.length, false).value).toBe(shown),
    );
});

describe('deleting', () => {
    it('hold-to-delete walks any number down to empty without stalling', () => {
        for (const start of [ru, type(empty, '+441234567890'), type(empty, '+905321234567')]) {
            let cur = start;
            let steps = 0;
            while (cur.value !== '' && steps++ < 40) {
                const next = backspace(cur);
                expect(next.value.length).toBeLessThan(cur.value.length);
                cur = next;
            }
            expect(cur.value).toBe('');
        }
    });

    it('removes a digit, not only a mask character, when backspacing over a space', () => {
        const next = backspace({ value: '+7 913 123 45 67', caret: 7 });
        expect(next.value.replace(/\D/g, '')).toBe('791123456 7'.replace(' ', ''));
    });

    it('can erase the country code', () => {
        expect(backspace({ value: '+7', caret: 2 }).value).toBe('');
        expect(backspace({ value: '+', caret: 1 }).value).toBe('');
    });
});

describe('editing in the middle', () => {
    it('keeps the caret after the same digit when a digit is inserted', () => {
        const next = type({ value: '+7 913 123 4', caret: 6 }, '0');
        expect(next.value).toBe('+7 913 012 34');
        expect(next.caret).toBe(8);
    });

    it('deleting a middle digit shifts the rest and keeps the caret in place', () => {
        const next = backspace({ value: '+7 913 123 45 67', caret: 9 });
        expect(next.value).toBe('+7 913 134 56 7');
        expect(next.caret).toBe(8);
    });
});

describe('isValidPhone', () => {
    it.each([
        ['+7 913 123 45 67', true],
        ['89131234567', true],
        ['9131234567', true],
        ['+7 800 555 35 35', true],
        ['+44 20 7946 0958', true],
        ['+90 532 123 45 67', true],
        ['+7 913 123', false],
        ['+7', false],
        ['', false],
        ['abc', false],
        ['12345', false],
    ])('%j -> %s', (raw, ok) => expect(isValidPhone(raw)).toBe(ok));
});
