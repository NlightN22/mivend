import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LOCALE,
    SUPPORTED_LOCALES,
    flagRegion,
    nativeName,
    resolveLocale,
} from '../../i18n/locales';

const SUPPORTED = ['en', 'ru'];

describe('resolveLocale', () => {
    it('prefers a saved supported choice over the browser language', () =>
        expect(resolveLocale('ru', ['en-US'], SUPPORTED)).toBe('ru'));
    it('ignores a saved locale that is no longer supported', () =>
        expect(resolveLocale('de', ['ru-RU'], SUPPORTED)).toBe('ru'));
    it('takes the first supported browser language by its primary subtag', () =>
        expect(resolveLocale(null, ['fr-FR', 'RU-ru', 'en'], SUPPORTED)).toBe('ru'));
    it('falls back to English when nothing matches', () =>
        expect(resolveLocale(null, ['fr', 'de'], SUPPORTED)).toBe(DEFAULT_LOCALE));
});

describe('locale metadata', () => {
    it('derives supported locales from the catalogues present', () =>
        expect([...SUPPORTED_LOCALES].sort()).toEqual(['en', 'ru']));
    it('shows the UK flag for English and the locale region otherwise', () => {
        expect(flagRegion('en')).toBe('gb');
        expect(flagRegion('ru')).toBe('ru');
    });
    it('names each language in itself, capitalised', () => {
        expect(nativeName('en')).toBe('English');
        expect(nativeName('ru')).toBe('Русский');
    });
});
