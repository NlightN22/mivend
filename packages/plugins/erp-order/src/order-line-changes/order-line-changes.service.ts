import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery, findBounded, readAllByKeyset } from 'shared';
import { In, MoreThan, type Repository } from 'typeorm';

import { SalesCorrectionErp } from '../erp-documents/sales-correction-erp.entity';
import {
    SalesCorrectionGoodsLineErp,
    SalesCorrectionServiceLineErp,
} from '../erp-documents/sales-correction-line-erp.entity';
import { SalesDocumentSourcesService } from './sales-document-sources.service';
import { buildOrderChanges, type OrderLineRef } from './line-change-events';
import { correctionGoodsSource, correctionServiceSource } from './line-change-sources';
import type { LineChangeAudience, LineChangeSource, OrderChanges } from './line-change.types';

const EMPTY: OrderChanges = { lines: [], amountDeltaMinor: 0 };

// The caller reaches this only through an Order it already may read (field resolver on Order).
@Injectable()
export class OrderLineChangesService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly salesDocuments: SalesDocumentSourcesService,
    ) {}

    async forOrder(
        ctx: RequestContext,
        order: Pick<Order, 'id' | 'customFields'>,
        audience: LineChangeAudience,
    ): Promise<OrderChanges> {
        const erpOrderId = order.customFields?.erpOrderId;
        if (!erpOrderId) return EMPTY;
        const sources = await this.loadSources(ctx, erpOrderId);
        if (sources.length === 0) return EMPTY;
        const lines = await this.orderLines(ctx, order.id);
        return buildOrderChanges(lines, sources, audience);
    }

    private async orderLines(ctx: RequestContext, orderId: unknown): Promise<OrderLineRef[]> {
        const rows = await readAllByKeyset<{
            id: number;
            quantity: number;
            productErpId: string | null;
        }>((afterId, limit) =>
            ctxQuery<Array<{ id: number; quantity: number; productErpId: string | null }>>(
                this.connection,
                ctx,
                `SELECT ol.id, ol.quantity, p."customFieldsExternalid" AS "productErpId"
                 FROM order_line ol
                 JOIN product_variant v ON v.id = ol."productVariantId"
                 JOIN product p ON p.id = v."productId"
                 WHERE ol."orderId" = $1 AND ol.id > $2 ORDER BY ol.id LIMIT $3`,
                [orderId, afterId ?? 0, limit],
            ),
        );
        return rows.map(r => ({
            id: Number(r.id),
            quantity: Number(r.quantity),
            productErpId: r.productErpId,
        }));
    }

    private async loadSources(
        ctx: RequestContext,
        erpOrderId: string,
    ): Promise<LineChangeSource[]> {
        const corrections = await findBounded(
            this.connection.getRepository(ctx, SalesCorrectionErp),
            {
                where: { orderId: erpOrderId, isDeleted: false },
            },
        );
        const sources: LineChangeSource[] = [];
        const correctionIds = corrections.map(c => c.id);
        if (correctionIds.length > 0) {
            const [goods, services] = await Promise.all([
                this.lines(ctx, SalesCorrectionGoodsLineErp, correctionIds),
                this.lines(ctx, SalesCorrectionServiceLineErp, correctionIds),
            ]);
            for (const doc of corrections) {
                sources.push(
                    ...goods
                        .filter(l => l.documentId === doc.id)
                        .map(l => correctionGoodsSource(doc, l)),
                    ...services
                        .filter(l => l.documentId === doc.id)
                        .map(l => correctionServiceSource(doc, l)),
                );
            }
        }
        sources.push(...(await this.salesDocuments.forOrder(ctx, erpOrderId)));
        return sources;
    }

    private lines<T extends { documentId: number }>(
        ctx: RequestContext,
        entity: new () => T,
        documentIds: number[],
    ): Promise<T[]> {
        const repo = this.connection.getRepository(ctx, entity as never) as Repository<
            T & { id: number }
        >;
        return readAllByKeyset<T & { id: number }>((afterId, take) =>
            repo.find({
                where: {
                    documentId: In(documentIds),
                    ...(afterId === null ? {} : { id: MoreThan(afterId) }),
                } as never,
                order: { id: 'ASC' } as never,
                take,
            }),
        );
    }
}
