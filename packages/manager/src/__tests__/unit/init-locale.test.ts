// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, initLocale } from '../../i18n';

function browserLanguages(languages: string[]): void {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

beforeEach(() => {
    localStorage.clear();
    i18n.global.locale.value = 'en';
});

afterEach(() => vi.restoreAllMocks());

describe('initLocale', () => {
    it('applies the settings default when saved and browser languages do not match', async () => {
        browserLanguages(['fr']);
        await initLocale(async () => 'ru');
        expect(i18n.global.locale.value).toBe('ru');
        expect(document.documentElement.lang).toBe('ru');
    });

    it('keeps the code constant when the settings query fails', async () => {
        browserLanguages(['fr']);
        await initLocale(() => Promise.reject(new Error('offline')));
        expect(i18n.global.locale.value).toBe('en');
    });

    it('ignores an unsupported settings default', async () => {
        browserLanguages(['fr']);
        await initLocale(async () => 'de');
        expect(i18n.global.locale.value).toBe('en');
    });

    it('does not query the settings when a saved choice exists', async () => {
        localStorage.setItem('mivend.locale', 'ru');
        browserLanguages(['fr']);
        const fetchDefault = vi.fn().mockResolvedValue('en');
        await initLocale(fetchDefault);
        expect(fetchDefault).not.toHaveBeenCalled();
        expect(i18n.global.locale.value).toBe('ru');
    });

    it('lets a supported browser language beat the settings default', async () => {
        browserLanguages(['ru-RU']);
        await initLocale(async () => 'en');
        expect(i18n.global.locale.value).toBe('ru');
    });

    it('falls back to the code constant when the settings query is slow', async () => {
        vi.useFakeTimers();
        try {
            browserLanguages(['fr']);
            const done = initLocale(
                () => new Promise(resolve => setTimeout(() => resolve('ru'), 10_000)),
            );
            await vi.advanceTimersByTimeAsync(1600);
            await done;
            expect(i18n.global.locale.value).toBe('en');
        } finally {
            vi.useRealTimers();
        }
    });

    it('applies a settings default that arrives within the timeout', async () => {
        vi.useFakeTimers();
        try {
            browserLanguages(['fr']);
            const done = initLocale(
                () => new Promise(resolve => setTimeout(() => resolve('ru'), 500)),
            );
            await vi.advanceTimersByTimeAsync(600);
            await done;
            expect(i18n.global.locale.value).toBe('ru');
        } finally {
            vi.useRealTimers();
        }
    });
});
