import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    OrderModifier,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { PackagingPolicyService } from '@mivend/plugin-moq';

import { findVariantBySku, MAX_LINE_QUANTITY, noPriceMessage } from './order-line-sku';
import { LINE_PRICE_CHECK, type LinePriceCheck } from './line-price-check';
import { OrderLineEditService } from './order-line-edit.service';
import { OrderLineStockSyncService } from './order-line-stock-sync.service';

// Staff adds a position to an unsent order by its article (#320); same lock, guard and on-edit checks as the other edits.
@Injectable()
export class OrderLineAddService {
    constructor(
        private connection: TransactionalConnection,
        private edits: OrderLineEditService,
        private modifier: OrderModifier,
        private packaging: PackagingPolicyService,
        private stockSync: OrderLineStockSyncService,
        private moduleRef: ModuleRef,
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
            const variant = await findVariantBySku(this.connection, txCtx, wanted);
            const priced = await this.moduleRef
                .get<LinePriceCheck>(LINE_PRICE_CHECK, { strict: false })
                .hasCustomerPrice(txCtx, order, variant.id);
            if (!priced) throw new UserInputError(noPriceMessage(wanted));
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
            if (line.quantity + quantity > MAX_LINE_QUANTITY) {
                throw new UserInputError(`A line holds at most ${MAX_LINE_QUANTITY} items`);
            }
            await this.stockSync.addQuantity(txCtx, order, line, quantity);
            line.quantity += quantity;
            await this.edits.persist(txCtx, order, [line]);
            return `Line ${variant.sku} added (${quantity})`;
        });
    }
}
