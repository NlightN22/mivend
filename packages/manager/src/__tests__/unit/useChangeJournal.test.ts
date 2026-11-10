import { describe, expect, it, vi } from 'vitest';

vi.mock('@mivend/ui-kit', async () => ({
    useLatestRequest: (await import('../../../../ui-kit/src/composables/useLatestRequest'))
        .useLatestRequest,
}));

import type { ChangeJournalPage, PageRequest } from '../../api/changeJournal';
import { classifyChangeJournalError, useChangeJournal } from '../../composables/useChangeJournal';

function pageOf(ids: string[], totalItems: number): ChangeJournalPage {
    return {
        items: ids.map(id => ({
            id,
            occurredAt: '2026-11-10T10:00:00.000Z',
            actorType: 'system',
            userId: null,
            administratorId: null,
            source: 'background',
            entityType: 'Counterparty',
            entityId: '1',
            action: 'update',
            changes: {},
        })),
        totalItems,
    };
}

describe('useChangeJournal', () => {
    it('requests the page window and exposes the result', async () => {
        const fetchPage = vi.fn(async (_r: PageRequest) => pageOf(['3'], 21));
        const journal = useChangeJournal(fetchPage, 10);
        await journal.load(3);
        expect(fetchPage).toHaveBeenCalledWith({ skip: 20, take: 10 });
        expect(journal.entries.value.map(e => e.id)).toEqual(['3']);
        expect(journal.totalItems.value).toBe(21);
        expect(journal.page.value).toBe(3);
        expect(journal.error.value).toBeNull();
    });

    it('drops a stale response that arrives after a newer page', async () => {
        let resolveFirst: (p: ChangeJournalPage) => void = () => undefined;
        const fetchPage = vi
            .fn<(r: PageRequest) => Promise<ChangeJournalPage>>()
            .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
            .mockResolvedValueOnce(pageOf(['page2'], 40));
        const journal = useChangeJournal(fetchPage, 20);
        const first = journal.load(1);
        await journal.load(2);
        resolveFirst(pageOf(['page1'], 40));
        await first;
        expect(journal.entries.value.map(e => e.id)).toEqual(['page2']);
    });

    it('reports a refused request as forbidden and clears the old rows', async () => {
        const fetchPage = vi
            .fn<(r: PageRequest) => Promise<ChangeJournalPage>>()
            .mockResolvedValueOnce(pageOf(['1'], 1))
            .mockRejectedValueOnce(
                new Error('You are not currently authorized to perform this action'),
            );
        const journal = useChangeJournal(fetchPage);
        await journal.load();
        await journal.load();
        expect(journal.error.value).toBe('forbidden');
        expect(journal.entries.value).toEqual([]);
        expect(journal.loading.value).toBe(false);
    });

    it('classifies other failures as failed', () => {
        expect(classifyChangeJournalError(new Error('Admin API error: 500'))).toBe('failed');
    });
});
