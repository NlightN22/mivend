import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQueryBounded } from 'shared';

import {
    SOURCE_PART_BY_STREAM,
    isPickingWorkResult,
    parsePickingStages,
    salesDocumentSource,
    type SourceDoc,
    type SourceRow,
} from './sales-document-sources';
import type { LineChangeSource } from './line-change.types';

const STREAM_RETURN = 'customer-goods-return';
const STREAM_PICKING = 'warehouse-order';
const STREAM_PICKED = 'tl-warehouse-work-result';
const STREAM_REALIZATION = 'goods-and-services-sale';

interface Header extends SourceDoc {
    id: number;
    erpId: string;
    dealId: string | null;
    basisDocumentId: string | null;
    customerOrderId: string | null;
    stage: string | null;
}

interface Row extends SourceRow {
    documentId: number;
    linkedId: string | null;
}

// Explicit columns only: header attributes and row attributes (employee data of a work result) are never selected.
const HEADER_COLUMNS = `d.id, d."erpId", d.kind, d.number, d.date, d.posted, d."deletionMarked", d."isDeleted",
    d."amountIncludesVat", d."dealId", d."basisDocumentId", d."customerOrderId",
    d.attributes->>'stage' AS stage, d.attributes->>'taskCompleted' AS "taskCompleted"`;

// Links are exact id matches only: order -> realization/return (deal, basis or row order), realization or order ->
// warehouse order (basis), warehouse order -> work result (basis). Nothing else is guessed.
@Injectable()
export class SalesDocumentSourcesService {
    constructor(private readonly connection: TransactionalConnection) {}

    async forOrder(ctx: RequestContext, erpOrderId: string): Promise<LineChangeSource[]> {
        const viaClaim = new Set<number>();
        const direct = await this.directDocuments(ctx, erpOrderId, viaClaim);
        const realizationIds = direct.filter(d => d.kind === STREAM_REALIZATION).map(d => d.erpId);
        const picking = await this.byBasis(ctx, STREAM_PICKING, [erpOrderId, ...realizationIds]);
        const workResults = await this.byBasis(
            ctx,
            STREAM_PICKED,
            picking.map(d => d.erpId),
        );
        const stages = workResults.length > 0 ? await this.pickingStages(ctx) : new Set<string>();
        const picked = workResults.filter(d => isPickingWorkResult(d.stage, stages));
        const docs = [...direct, ...picking, ...picked];
        const rows = await this.rows(ctx, docs, erpOrderId);
        const byId = new Map(docs.map(d => [d.id, d]));
        return rows
            .map(row => {
                const doc = byId.get(row.documentId)!;
                return this.rowBelongs(doc, row, erpOrderId, viaClaim)
                    ? salesDocumentSource(doc, row)
                    : null;
            })
            .filter((s): s is LineChangeSource => s !== null);
    }

    private async pickingStages(ctx: RequestContext): Promise<ReadonlySet<string>> {
        const [row] = await ctxQueryBounded<{ stages: string | null }>(
            this.connection,
            ctx,
            `SELECT "customFieldsPickingworkstages" AS stages FROM global_settings LIMIT 1`,
            [],
        );
        return parsePickingStages(row?.stages ?? null);
    }

    private linkedByHeader(doc: Header, erpOrderId: string): boolean {
        return [doc.dealId, doc.basisDocumentId, doc.customerOrderId].includes(erpOrderId);
    }

    // A row naming another order is never counted; a row without one follows a header link or the order's claim.
    private rowBelongs(doc: Header, row: Row, erpOrderId: string, viaClaim: Set<number>): boolean {
        if (doc.kind !== STREAM_REALIZATION && doc.kind !== STREAM_RETURN) return true;
        if (row.linkedId !== null) return row.linkedId === erpOrderId;
        return this.linkedByHeader(doc, erpOrderId) || viaClaim.has(doc.id);
    }

    // Indexed selects only (deal, basis, customer order, row order, claim of the order), never one OR over subselects.
    private async directDocuments(
        ctx: RequestContext,
        erpOrderId: string,
        viaClaim: Set<number>,
    ): Promise<Header[]> {
        const ids = await ctxQueryBounded<{ id: number; claim: boolean }>(
            this.connection,
            ctx,
            `SELECT id, bool_or(claim) AS claim FROM (
               SELECT d.id, false AS claim FROM erp_sales_document d
                 WHERE d."dealId" = $1 AND d.kind = ANY($2) AND NOT d."isDeleted"
               UNION ALL SELECT d.id, false FROM erp_sales_document d
                 WHERE d."basisDocumentId" = $1 AND d.kind = ANY($2) AND NOT d."isDeleted"
               UNION ALL SELECT d.id, false FROM erp_sales_document d
                 WHERE d."customerOrderId" = $1 AND d.kind = ANY($2) AND NOT d."isDeleted"
               UNION ALL SELECT d.id, false FROM erp_sales_document_line l
                 JOIN erp_sales_document d ON d.id = l."documentId"
                 WHERE l."linkedId" = $1 AND d.kind = ANY($2) AND NOT d."isDeleted"
               UNION ALL SELECT d.id, true FROM customer_claim_erp c
                 JOIN erp_sales_document d ON d."dealId" = c."erpId"
                 WHERE c."orderId" = $1 AND d.kind = '${STREAM_RETURN}' AND NOT d."isDeleted"
             ) found GROUP BY id`,
            [erpOrderId, [STREAM_REALIZATION, STREAM_RETURN]],
        );
        for (const r of ids) if (r.claim) viaClaim.add(Number(r.id));
        return this.headers(
            ctx,
            ids.map(r => Number(r.id)),
        );
    }

    private async byBasis(
        ctx: RequestContext,
        kind: string,
        basisIds: string[],
    ): Promise<Header[]> {
        if (basisIds.length === 0) return [];
        const found = await ctxQueryBounded<{ id: number }>(
            this.connection,
            ctx,
            `SELECT d.id FROM erp_sales_document d
             WHERE d.kind = $1 AND NOT d."isDeleted" AND d."basisDocumentId" = ANY($2)`,
            [kind, basisIds],
        );
        return this.headers(
            ctx,
            found.map(r => Number(r.id)),
        );
    }

    private async headers(ctx: RequestContext, ids: number[]): Promise<Header[]> {
        if (ids.length === 0) return [];
        const rows = await ctxQueryBounded<Header>(
            this.connection,
            ctx,
            `SELECT ${HEADER_COLUMNS} FROM erp_sales_document d WHERE d.id = ANY($1)`,
            [ids],
        );
        return rows.map(r => ({
            ...r,
            id: Number(r.id),
            date: r.date === null ? null : new Date(r.date),
            taskCompleted: r.taskCompleted === null ? null : String(r.taskCompleted) === 'true',
        }));
    }

    // One query per (table part, order filter): only the part a kind feeds the card with is read.
    private async rows(ctx: RequestContext, docs: Header[], erpOrderId: string): Promise<Row[]> {
        const groups = new Map<string, number[]>();
        for (const d of docs) {
            const key = `${SOURCE_PART_BY_STREAM[d.kind]}|${d.kind === STREAM_REALIZATION || d.kind === STREAM_RETURN}`;
            groups.set(key, [...(groups.get(key) ?? []), d.id]);
        }
        const result: Row[] = [];
        for (const [key, ids] of groups) {
            const [part, byOrder] = key.split('|');
            const found = await ctxQueryBounded<Row>(
                this.connection,
                ctx,
                `SELECT l."documentId", l."linkedId", l."productId", l.quantity, l.coefficient,
                        l."amountMinor", l."vatAmountMinor"
                 FROM erp_sales_document_line l
                 WHERE l."documentId" = ANY($1) AND l.part = $2
                   AND ($3::boolean IS FALSE OR l."linkedId" = $4 OR l."linkedId" IS NULL)`,
                [ids, part, byOrder === 'true', erpOrderId],
            );
            result.push(
                ...found.map(r => ({
                    ...r,
                    documentId: Number(r.documentId),
                    amountMinor: r.amountMinor === null ? null : Number(r.amountMinor),
                    vatAmountMinor: r.vatAmountMinor === null ? null : Number(r.vatAmountMinor),
                })),
            );
        }
        return result;
    }
}
