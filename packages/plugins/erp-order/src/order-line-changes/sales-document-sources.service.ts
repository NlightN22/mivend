import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQueryBounded, findBounded } from 'shared';
import { In } from 'typeorm';

import { ErpSalesDocument } from '../erp-documents/erp-sales-document.entity';
import { ErpSalesDocumentLine } from '../erp-documents/erp-sales-document-line.entity';
import type { LineChangeSource } from './line-change.types';
import { SOURCE_PART_BY_STREAM, salesDocumentSource } from './sales-document-sources';

const STREAM_RETURN = 'customer-goods-return';
const STREAM_PICKING = 'warehouse-order';
const STREAM_PICKED = 'tl-warehouse-work-result';
const STREAM_REALIZATION = 'goods-and-services-sale';

// Links are exact id matches only: order -> realization/return (deal, basis or row order), realization or order ->
// warehouse order (basis), warehouse order -> work result (basis). Nothing else is guessed.
@Injectable()
export class SalesDocumentSourcesService {
    constructor(private readonly connection: TransactionalConnection) {}

    async forOrder(ctx: RequestContext, erpOrderId: string): Promise<LineChangeSource[]> {
        const direct = await this.directDocuments(ctx, erpOrderId);
        const realizationIds = direct.filter(d => d.kind === STREAM_REALIZATION).map(d => d.erpId);
        const picking = await this.byBasis(ctx, STREAM_PICKING, [erpOrderId, ...realizationIds]);
        const picked = await this.byBasis(
            ctx,
            STREAM_PICKED,
            picking.map(d => d.erpId),
        );
        const headerLinked = new Set(direct.filter(d => this.linkedByHeader(d, erpOrderId)));
        const docs = [...direct, ...picking, ...picked];
        const rows = await this.rows(ctx, docs);
        return docs.flatMap(doc =>
            rows
                .filter(r => r.documentId === doc.id && r.part === SOURCE_PART_BY_STREAM[doc.kind])
                .filter(r => this.rowBelongs(doc, r, erpOrderId, headerLinked))
                .map(r => salesDocumentSource(doc, r))
                .filter((s): s is LineChangeSource => s !== null),
        );
    }

    private linkedByHeader(doc: ErpSalesDocument, erpOrderId: string): boolean {
        return [doc.dealId, doc.basisDocumentId, doc.customerOrderId].includes(erpOrderId);
    }

    // A row naming another order is never counted here; a row without one follows its header.
    private rowBelongs(
        doc: ErpSalesDocument,
        row: ErpSalesDocumentLine,
        erpOrderId: string,
        headerLinked: Set<ErpSalesDocument>,
    ): boolean {
        if (doc.kind !== STREAM_REALIZATION && doc.kind !== STREAM_RETURN) return true;
        if (row.linkedId !== null) return row.linkedId === erpOrderId;
        return headerLinked.has(doc) || doc.kind === STREAM_RETURN;
    }

    private async directDocuments(
        ctx: RequestContext,
        erpOrderId: string,
    ): Promise<ErpSalesDocument[]> {
        const kinds = [STREAM_REALIZATION, STREAM_RETURN];
        const ids = await ctxQueryBounded<{ id: number }>(
            this.connection,
            ctx,
            `SELECT d.id FROM erp_sales_document d
             WHERE d.kind = ANY($2) AND NOT d."isDeleted" AND (
               d."dealId" = $1 OR d."basisDocumentId" = $1 OR d."customerOrderId" = $1
               OR d.id IN (SELECT l."documentId" FROM erp_sales_document_line l WHERE l."linkedId" = $1)
               OR (d.kind = '${STREAM_RETURN}' AND d."dealId" IN
                   (SELECT c."erpId" FROM customer_claim_erp c WHERE c."orderId" = $1)))`,
            [erpOrderId, kinds],
        );
        return this.byIds(
            ctx,
            ids.map(r => Number(r.id)),
        );
    }

    private async byBasis(
        ctx: RequestContext,
        kind: string,
        basisIds: string[],
    ): Promise<ErpSalesDocument[]> {
        if (basisIds.length === 0) return [];
        return findBounded(this.connection.getRepository(ctx, ErpSalesDocument), {
            where: { kind, isDeleted: false, basisDocumentId: In(basisIds) },
        });
    }

    private byIds(ctx: RequestContext, ids: number[]): Promise<ErpSalesDocument[]> {
        if (ids.length === 0) return Promise.resolve([]);
        return findBounded(this.connection.getRepository(ctx, ErpSalesDocument), {
            where: { id: In(ids) },
        });
    }

    private rows(ctx: RequestContext, docs: ErpSalesDocument[]): Promise<ErpSalesDocumentLine[]> {
        if (docs.length === 0) return Promise.resolve([]);
        return findBounded(this.connection.getRepository(ctx, ErpSalesDocumentLine), {
            where: { documentId: In(docs.map(d => d.id)) },
        });
    }
}
