import { describe, expect, it, vi } from 'vitest';
import { QueryTooLargeError } from 'shared';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ContractProformaCleanupService } from '../../contract-proforma-cleanup.service';
import { DocumentsService } from '../../documents.service';
import { LegalNameAbbreviationService } from '../../legal-name-abbreviation.service';
import { ProformaInvoiceHtmlBuilder } from '../../pdf/proforma-invoice-html.builder';
import { ProformaDocumentLoaders } from '../../proforma-document-loaders.service';
import { ProformaRequeueService } from '../../proforma-requeue.service';

const ctx = {} as unknown as RequestContext;
const rowsOf = (count: number, row: object = {}): object[] =>
    Array.from({ length: count }, () => row);
const connectionOf = (repo: object): TransactionalConnection =>
    ({ getRepository: () => repo }) as unknown as TransactionalConnection;

function rawBuilder(count: number, row: object): Record<string, unknown> {
    const qb: Record<string, unknown> = {};
    for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'distinct'])
        qb[method] = () => qb;
    qb.limit = vi.fn(() => qb);
    qb.getRawMany = vi.fn(async () => rowsOf(count, row));
    return qb;
}

describe('documents reads fail over the ceiling', () => {
    it('requisites registry passes at 1000 rows and throws one over', async () => {
        const read = (count: number): Promise<unknown> =>
            new DocumentsService(
                connectionOf({ find: vi.fn(async () => rowsOf(count)) }),
                {} as never,
            ).findAllRequisites(ctx);
        await expect(read(1000)).resolves.toHaveLength(1000);
        await expect(read(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('visible document types pass at 1000 rows and throw one over', async () => {
        const read = (count: number): Promise<string[]> => {
            const service = new DocumentsService(connectionOf({}), {} as never);
            vi.spyOn(
                service as unknown as { visibleDocumentsQb: () => Promise<unknown> },
                'visibleDocumentsQb',
            ).mockResolvedValue(rawBuilder(count, { type: 't' }));
            return service.findVisibleTypes(ctx);
        };
        await expect(read(1000)).resolves.toHaveLength(1000);
        await expect(read(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('legal name rules pass at 1000 rows and throw one over', async () => {
        const read = (count: number): Promise<unknown> =>
            new LegalNameAbbreviationService(
                connectionOf({ find: vi.fn(async () => rowsOf(count, { phrase: 'a' })) }),
                {} as never,
                {} as never,
            ).findRules(ctx);
        await expect(read(1000)).resolves.toHaveLength(1000);
        await expect(read(1001)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('proforma document loader allows five rows per invoice id and throws one over', async () => {
        const load = (count: number): Promise<unknown> =>
            new ProformaDocumentLoaders(
                connectionOf({
                    find: vi.fn(async () => rowsOf(count, { proformaInvoiceId: '1' })),
                }),
            ).document(ctx, 1);
        await expect(load(5)).resolves.toBeTruthy();
        await expect(load(6)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('variant unit names use the distinct id count as the ceiling', async () => {
        const read = (count: number): Promise<Map<number, string>> => {
            const builder = new ProformaInvoiceHtmlBuilder(
                connectionOf({
                    createQueryBuilder: () => rawBuilder(count, { id: 1, unitName: 'pcs' }),
                }),
                {} as never,
                {} as never,
                {} as never,
            );
            return (
                builder as unknown as {
                    loadUnitNames: (
                        c: RequestContext,
                        ids: number[],
                    ) => Promise<Map<number, string>>;
                }
            ).loadUnitNames(ctx, [1, 2, 2]);
        };
        await expect(read(2)).resolves.toBeInstanceOf(Map);
        await expect(read(3)).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('contract cleanup allows five documents per purged invoice id and throws one over', async () => {
        const run = (count: number): Promise<number> => {
            const repo = { find: vi.fn(async () => rowsOf(count, { uuid: 'u' })), delete: vi.fn() };
            const purge = {
                purgeBatch: vi.fn(
                    async (
                        c: RequestContext,
                        _m: number,
                        _b: number,
                        work: (tx: RequestContext, ids: number[]) => Promise<void>,
                    ) => {
                        await work(c, [1, 2]);
                        return 0;
                    },
                ),
            };
            return new ContractProformaCleanupService(
                connectionOf(repo),
                purge as never,
                {
                    remove: vi.fn(),
                } as never,
            ).run(ctx, 6);
        };
        await expect(run(10)).resolves.toBe(0);
        await expect(run(11)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('ProformaRequeueService reads failed documents by id slices', () => {
    it('continues after the last id with no id condition on the first slice and never throws', async () => {
        const slices = [rowsOf(1000, { id: '1000' }), rowsOf(2, { id: '1002' }), []];
        const qb = rawBuilder(0, {});
        const afterIds: unknown[] = [];
        qb.andWhere = vi.fn((cond: unknown, params?: { afterId?: unknown }) => {
            if (typeof cond === 'string' && params?.afterId !== undefined)
                afterIds.push(params.afterId);
            return qb;
        });
        qb.getRawMany = vi.fn(async () => slices.shift() ?? []);
        const repo = {
            createQueryBuilder: () => qb,
            update: vi.fn(async () => ({ affected: 0 })),
        };
        const service = new ProformaRequeueService(connectionOf(repo), {
            enqueue: vi.fn(),
        } as never);

        await service.requeueForUnconfirmedVat(ctx, 'VAT-20');

        expect(afterIds).toEqual(['1000']);
        expect(qb.limit).toHaveBeenCalledWith(1000);
    });
});
