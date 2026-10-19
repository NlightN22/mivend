import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../../i18n';

const store = new Map<string, string>();
const html = { lang: '' };

describe('setLocale', () => {
    beforeEach(() => {
        store.clear();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
        });
        vi.stubGlobal('document', { documentElement: html });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('lets the last switch win when an earlier catalogue load resolves later', async () => {
        const slowRu = setLocale('ru');
        await setLocale('en');
        await slowRu;
        expect(i18n.global.locale.value).toBe('en');
        expect(store.get('mivend.locale')).toBe('en');
        expect(html.lang).toBe('en');
    });

    it('applies and persists a single switch', async () => {
        await setLocale('ru');
        expect(i18n.global.locale.value).toBe('ru');
        expect(store.get('mivend.locale')).toBe('ru');
    });
});
