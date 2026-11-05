import { describe, expect, it } from 'vitest';
import { applyPhoneInput, formatRuPhone } from '../../utils/contactFormat';

interface Field {
    value: string;
    caret: number;
}

function type(field: Field, text: string): Field {
    let cur = field;
    for (const ch of text) {
        const raw = cur.value.slice(0, cur.caret) + ch + cur.value.slice(cur.caret);
        cur = applyPhoneInput(cur.value, raw, cur.caret + 1);
    }
    return cur;
}

function backspace(field: Field): Field {
    if (field.caret === 0) return field;
    const raw = field.value.slice(0, field.caret - 1) + field.value.slice(field.caret);
    return applyPhoneInput(field.value, raw, field.caret - 1);
}

const empty: Field = { value: '', caret: 0 };
const full = type(empty, '9131234567');

describe('typing', () => {
    it('formats digits typed one by one', () => {
        expect(type(empty, '9').value).toBe('+7 (9');
        expect(type(empty, '913').value).toBe('+7 (913)');
        expect(full.value).toBe('+7 (913) 123-45-67');
        expect(full.caret).toBe(full.value.length);
    });

    it('accepts +7 typed as a prefix and keeps it visible', () => {
        expect(type(empty, '+').value).toBe('+7');
        expect(type(empty, '+7').value).toBe('+7');
        expect(type(empty, '+79').value).toBe('+7 (9');
        expect(type(empty, '+7913').value).toBe('+7 (913)');
    });

    it('treats a leading 7 or 8 as the country prefix', () => {
        expect(type(empty, '7').value).toBe('+7');
        expect(type(empty, '8').value).toBe('+7');
        expect(type(empty, '89131234567').value).toBe('+7 (913) 123-45-67');
        expect(type(empty, '79131234567').value).toBe('+7 (913) 123-45-67');
    });

    it('ignores letters and extra digits', () => {
        expect(type(empty, 'abc').value).toBe('');
        expect(type(full, '999').value).toBe('+7 (913) 123-45-67');
    });

    it('handles a pasted number in any format', () => {
        for (const pasted of [
            '89131234567',
            '+7 913 123 45 67',
            '8 (913) 123-45-67',
            '+79131234567',
        ]) {
            expect(applyPhoneInput('', pasted, pasted.length).value).toBe('+7 (913) 123-45-67');
        }
    });
});

describe('deleting', () => {
    it('hold-to-delete walks the whole number down to empty', () => {
        let cur = full;
        const seen: string[] = [cur.value];
        for (let i = 0; i < 40 && cur.value !== ''; i++) {
            cur = backspace(cur);
            seen.push(cur.value);
        }
        expect(cur.value).toBe('');
        expect(seen).toEqual([
            '+7 (913) 123-45-67',
            '+7 (913) 123-45-6',
            '+7 (913) 123-45',
            '+7 (913) 123-4',
            '+7 (913) 123',
            '+7 (913) 12',
            '+7 (913) 1',
            '+7 (913)',
            '+7 (91',
            '+7 (9',
            '',
        ]);
    });

    it('removes a digit, not only a mask character, when backspacing over one', () => {
        const atMask: Field = { value: '+7 (913) 1', caret: 9 };
        expect(backspace(atMask).value).toBe('+7 (911)');
    });

    it('deleting the last digit clears the field and the bare prefix too', () => {
        expect(backspace({ value: '+7 (9', caret: 5 }).value).toBe('');
        expect(backspace({ value: '+7', caret: 2 }).value).toBe('');
    });
});

describe('editing in the middle', () => {
    it('keeps the caret after the same digit when a digit is inserted', () => {
        const start: Field = { value: '+7 (913) 123-45-67', caret: 7 };
        const next = type(start, '0');
        expect(next.value).toBe('+7 (913) 012-34-56');
        expect(next.caret).toBe(10);
    });

    it('deleting a middle digit shifts the rest and keeps the caret in place', () => {
        const next = backspace({ value: '+7 (913) 123-45-67', caret: 11 });
        expect(next.value).toBe('+7 (913) 13-45-67'.replace('13-45-67', '134-56-7'));
        expect(next.caret).toBe(10);
    });
});

describe('formatRuPhone', () => {
    it('is idempotent', () => {
        expect(formatRuPhone(formatRuPhone('89131234567'))).toBe('+7 (913) 123-45-67');
    });
});
