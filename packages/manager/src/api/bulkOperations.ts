import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { i18n } from '../i18n';
import { adminApi } from './client';
import {
    BulkBatchDocument,
    BulkBatchItemsDocument,
    BulkBatchesDocument,
    BulkOperationCatalogDocument,
    PreviewBulkBatchDocument,
    RunBulkBatchDocument,
    UndoBulkBatchDocument,
    type BulkBatchFieldsFragment,
    type BulkBatchItemFieldsFragment,
    type BulkBatchListOptions,
} from './generated/graphql';

export type BulkBatch = BulkBatchFieldsFragment;
export type BulkBatchItem = BulkBatchItemFieldsFragment;
export interface BulkOperationInfo {
    type: string;
    title: string;
    description: string;
    area: string;
    undoable: boolean;
    supportsMatching: boolean;
    maxRecords: number;
}
export interface BulkItemsPage {
    items: BulkBatchItem[];
    totalItems: number;
}

export const ITEMS_PAGE_SIZE = 25;
const EXPORT_PAGE_SIZE = 100;
export const ACTIVE_STATUSES = ['queued', 'running'];

export function batchStatusLabel(status: string): string {
    const key = `bulkOperations.status.${status}`;
    return i18n.global.te(key) ? i18n.global.t(key) : status;
}

export const BATCH_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    draft: 'neutral',
    queued: 'info',
    running: 'info',
    done: 'success',
    partial: 'warning',
    stopped: 'warning',
    failed: 'danger',
};

export const batchStatusOptions = (): Array<{ value: string; label: string }> =>
    ['queued', 'running', 'done', 'partial', 'stopped', 'failed'].map(value => ({
        value,
        label: batchStatusLabel(value),
    }));

export function fetchBulkCatalog(): Promise<BulkOperationInfo[]> {
    return adminApi(BulkOperationCatalogDocument).then(r => r.bulkOperationCatalog);
}

export function fetchBulkBatches(
    options: BulkBatchListOptions,
): Promise<{ items: BulkBatch[]; totalItems: number }> {
    return adminApi(BulkBatchesDocument, { options }).then(r => r.bulkBatches);
}

export function fetchBulkBatch(uuid: string): Promise<BulkBatch> {
    return adminApi(BulkBatchDocument, { uuid }).then(r => r.bulkBatch);
}

export function fetchBulkBatchItems(
    uuid: string,
    page: number,
    outcome: string,
    pageSize = ITEMS_PAGE_SIZE,
): Promise<BulkItemsPage> {
    const options = { take: pageSize, skip: (page - 1) * pageSize, outcome: outcome || null };
    return adminApi(BulkBatchItemsDocument, { uuid, options }).then(r => r.bulkBatchItems);
}

export function previewBulkBatch(
    type: string,
    parameters: Record<string, unknown>,
    selection: { ids: string[] } | { matching: Record<string, unknown> },
): Promise<BulkBatch> {
    return adminApi(PreviewBulkBatchDocument, { type, parameters, selection }).then(
        r => r.previewBulkBatch,
    );
}

export function runBulkBatch(uuid: string): Promise<BulkBatch> {
    return adminApi(RunBulkBatchDocument, { uuid }).then(r => r.runBulkBatch);
}

export function undoBulkBatch(uuid: string): Promise<BulkBatch> {
    return adminApi(UndoBulkBatchDocument, { uuid }).then(r => r.undoBulkBatch);
}

export async function fetchAllBulkBatchItems(uuid: string): Promise<BulkBatchItem[]> {
    const all: BulkBatchItem[] = [];
    for (let page = 1; ; page += 1) {
        const chunk = await fetchBulkBatchItems(uuid, page, '', EXPORT_PAGE_SIZE);
        all.push(...chunk.items);
        if (all.length >= chunk.totalItems || chunk.items.length === 0) return all;
    }
}
