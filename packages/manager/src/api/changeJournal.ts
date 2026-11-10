import { adminApi } from './client';
import {
    ChangeJournalDocument,
    ChangeJournalForEntityDocument,
    type ChangeJournalEntryFieldsFragment,
    type ChangeJournalFilter,
} from './generated/graphql';

export type ChangeJournalEntry = ChangeJournalEntryFieldsFragment;
export type { ChangeJournalFilter };

export interface ChangeJournalPage {
    items: ChangeJournalEntry[];
    totalItems: number;
}

export interface PageRequest {
    skip: number;
    take: number;
}

// Requires ReadChangeJournal; the backend returns an empty page for an entity outside the viewer's scope.
export async function fetchChangeJournalForEntity(
    entityType: string,
    entityId: string,
    page: PageRequest,
): Promise<ChangeJournalPage> {
    const result = await adminApi(ChangeJournalForEntityDocument, {
        entityType,
        entityId,
        ...page,
    });
    return result.changeJournalForEntity;
}

// Served only to counterparty scope 'all'; any other scope gets an empty page.
export async function fetchChangeJournal(
    filter: ChangeJournalFilter,
    page: PageRequest,
): Promise<ChangeJournalPage> {
    const result = await adminApi(ChangeJournalDocument, { filter, ...page });
    return result.changeJournal;
}
