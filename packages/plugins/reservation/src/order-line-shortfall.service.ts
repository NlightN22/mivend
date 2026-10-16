import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { In } from 'typeorm';

import { OrderLineShortfall } from './entities/order-line-shortfall.entity';

export interface OrderLineShortfallRow {
    id: string;
    orderLineId: string;
    productVariantId: string;
    sku: string | null;
    name: string | null;
    requestedQuantity: number;
    keptQuantity: number;
    shortfallQuantity: number;
    limitedBy: string | null;
    createdAt: Date;
}

// Read side of the demand cut when staff trimmed an order to available stock (#233).
@Injectable()
export class OrderLineShortfallService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
    ) {}

    async forOrder(ctx: RequestContext, orderId: ID): Promise<OrderLineShortfallRow[]> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const order = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!order) throw new UserInputError('Order not found');

        const rows = await this.connection
            .getRepository(ctx, OrderLineShortfall)
            .find({ where: { orderId: String(orderId) }, order: { createdAt: 'ASC', id: 'ASC' } });
        if (rows.length === 0) return [];
        const variants = await this.connection.getRepository(ctx, ProductVariant).find({
            where: { id: In([...new Set(rows.map(r => r.productVariantId))]) },
            withDeleted: true,
        });
        const byId = new Map(variants.map(v => [String(v.id), v]));
        return rows.map(row => ({
            id: String(row.id),
            orderLineId: row.orderLineId,
            productVariantId: row.productVariantId,
            sku: byId.get(row.productVariantId)?.sku ?? null,
            name: byId.get(row.productVariantId)?.name ?? null,
            requestedQuantity: row.requestedQuantity,
            keptQuantity: row.keptQuantity,
            shortfallQuantity: row.shortfallQuantity,
            limitedBy: row.limitedBy,
            createdAt: row.createdAt,
        }));
    }
}
