import { describe, expect, it } from 'vitest';
import en from '../../i18n/en/auth';
import ru from '../../i18n/ru/auth';
import { TWO_FACTOR_LABELS } from '../../pages/auth/twoFactorLabels';

const LATIN_WORD = /[A-Za-z]{3,}/;
const ALLOWED = new Set(['playStore', 'appStore']);

describe('manager two-factor labels', () => {
    it('resolve lazily from the active catalogue', () => {
        expect(TWO_FACTOR_LABELS.codeSubmit).toBe(en.twoFactor.codeSubmit);
        expect(TWO_FACTOR_LABELS.errors.INVALID_CODE).toBe(en.twoFactor.errors.INVALID_CODE);
    });

    it.each(Object.entries(ru.twoFactor).filter(([k]) => !ALLOWED.has(k) && k !== 'errors'))(
        'ru %s is Russian text',
        (_key, text) => {
            expect(text).toMatch(/[А-Яа-яЁё]/);
            expect(text).not.toMatch(LATIN_WORD);
        },
    );
});
