import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';

const shopApiMock = vi.fn();
vi.mock('../../api/client', () => ({ shopApi: (...args: unknown[]) => shopApiMock(...args) }));

// The ui-kit barrel pulls in .vue files, which plain vitest cannot parse — only the composables are needed.
vi.mock('@mivend/ui-kit', async () => ({
    ...(await import('../../../../ui-kit/src/composables/useDebouncedCallback')),
    ...(await import('../../../../ui-kit/src/composables/useLatestRequest')),
}));

import { useSearchSuggestions } from '../../composables/useSearchSuggestions';

function searchResult(...names: string[]): { search: { items: unknown[] } } {
    return {
        search: {
            items: names.map((name, i) => ({
                productId: String(i),
                productName: name,
                manufacturer: { name: 'BRAND' },
                slug: `slug-${i}`,
                sku: `sku-${i}`,
            })),
        },
    };
}

async function type(query: { value: string }, value: string): Promise<void> {
    query.value = value;
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
}

describe('useSearchSuggestions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        shopApiMock.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('does not query below the minimum length and keeps the dropdown hidden', async () => {
        const query = ref('');
        const groups = useSearchSuggestions(query, ref(undefined));

        await type(query, 'н');

        expect(shopApiMock).not.toHaveBeenCalled();
        expect(groups.value).toBeUndefined();
    });

    it('debounces keystrokes into one trimmed, scoped query and maps products', async () => {
        shopApiMock.mockResolvedValue(searchResult('Ролик натяжной'));
        const query = ref('');
        const groups = useSearchSuggestions(query, ref('cat-a'));

        query.value = 'нат';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        await type(query, 'натяжной ');

        expect(shopApiMock).toHaveBeenCalledTimes(1);
        expect(shopApiMock.mock.calls[0][1]).toEqual({ term: 'натяжной', collectionSlug: 'cat-a' });
        expect(groups.value).toEqual([
            {
                type: 'products',
                label: 'Products',
                items: [
                    {
                        id: '0',
                        label: 'Ролик натяжной',
                        subtitle: 'BRAND · sku-0',
                        to: '/product/slug-0',
                    },
                ],
            },
        ]);
    });

    it('returns an empty list (not hidden) when a finished search found nothing', async () => {
        shopApiMock.mockResolvedValue(searchResult());
        const query = ref('');
        const groups = useSearchSuggestions(query, ref(undefined));

        await type(query, 'zzzz');

        expect(groups.value).toEqual([]);
    });

    it('does not fire a pending query for a term the user already erased', async () => {
        shopApiMock.mockResolvedValue(searchResult('x'));
        const query = ref('');
        const groups = useSearchSuggestions(query, ref(undefined));

        query.value = 'фильт';
        await nextTick();
        await vi.advanceTimersByTimeAsync(100);
        query.value = '';
        await nextTick();
        await vi.advanceTimersByTimeAsync(300);

        expect(shopApiMock).not.toHaveBeenCalled();
        expect(groups.value).toBeUndefined();
    });

    it('hides the dropdown when the request fails', async () => {
        shopApiMock.mockRejectedValue(new Error('Shop API error: 500'));
        const query = ref('');
        const groups = useSearchSuggestions(query, ref(undefined));

        await type(query, 'натяжной');

        expect(groups.value).toBeUndefined();
    });

    it('ignores a stale response that resolves after a newer query', async () => {
        let resolveFirst!: (v: unknown) => void;
        shopApiMock
            .mockReturnValueOnce(new Promise(r => (resolveFirst = r)))
            .mockResolvedValueOnce(searchResult('second'));
        const query = ref('');
        const groups = useSearchSuggestions(query, ref(undefined));

        await type(query, 'first');
        await type(query, 'second');
        resolveFirst(searchResult('first'));
        await vi.advanceTimersByTimeAsync(0);

        expect(groups.value?.[0]?.items[0]?.label).toBe('second');
    });
});
