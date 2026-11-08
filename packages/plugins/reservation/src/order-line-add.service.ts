import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    OrderModifier,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { PackagingPolicyService } from '@mivend/plugin-moq';

import { OrderLineEditService } from './order-line-edit.service';
import { OrderLineStockSyncService } from './order-line-stock-sync.service';

const MAX_LINE_QUANTITY = 1_000_000;

// Staff adds a position to an unsent order by its article (#320); same lock, guard and on-edit checks as the other edits.
@Injectable()
export class OrderLineAddService {
    constructor(
        private connection: TransactionalConnection,
        private edits: OrderLineEditService,
        private modifier: OrderModifier,
        private packaging: PackagingPolicyService,
        private stockSync: OrderLineStockSyncService,
    ) {}

    async addBySku(ctx: RequestContext, orderId: ID, sku: string, quantity: number): Promise<void> {
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_LINE_QUANTITY) {
            throw new UserInputError(
                `Quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}`,
            );
        }
        const wanted = sku.trim();
        if (!wanted) throw new UserInputError('Enter an article');
        return this.edits.edit(ctx, orderId, 'add', async (txCtx, order) => {
            const variant = await this.connection
                .getRepository(txCtx, ProductVariant)
                .createQueryBuilder('v')
                .where('v.sku = :sku', { sku: wanted })
                .andWhere('v.deletedAt IS NULL')
                .andWhere('v.enabled = true')
                .getOne();
            if (!variant) throw new UserInputError(`No product with the article ${wanted}`);
            const multiple = await this.packaging.requiredMultiple(
                txCtx,
                variant,
                order.customerId,
                order.customFields?.branchId ?? null,
            );
            if (quantity % multiple !== 0) {
                throw new UserInputError(`${wanted} must be ordered in multiples of ${multiple}`);
            }
            const line = await this.modifier.getOrCreateOrderLine(txCtx, order, variant.id);
            await this.stockSync.addQuantity(txCtx, order, line, quantity);
            line.quantity += quantity;
            await this.edits.persist(txCtx, order, [line]);
            return `Line ${variant.sku} added (${quantity})`;
        });
    }
}
