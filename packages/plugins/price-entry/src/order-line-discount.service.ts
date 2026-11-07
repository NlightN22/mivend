import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Order, OrderService, RequestContext, UserInputError } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { OrderLineEditService } from '@mivend/plugin-reservation';

import { DiscountLimitService } from './discount-limit.service';
import { reductionRefusal, revertRefusal } from './discount-reduction.rule';
import type { DiscountChangeRefusal } from './discount-reduction.rule';
import { LINE_DISCOUNT_RELATIONS, LineDiscountService } from './line-discount.service';
import type { LineDiscount } from './line-discount.service';
import { discountPercent } from './discount-percent';
import './types';

const REFUSALS: Record<DiscountChangeRefusal, string> = {
    'increases-discount': 'Staff can only reduce a line discount, not increase it',
    'beyond-reference': 'The price cannot go above the price without any discount',
    'over-limit': 'The automatic discount is above your discount limit',
};

// Staff may only reduce a placed order line's discount (or return it to automatic when that fits their limit).
// Runs inside OrderLineEditService.edit: same locks, guard, on-edit checks; the order is read under the lock.
@Injectable()
export class OrderLineDiscountService {
    constructor(
        private lineEdit: OrderLineEditService,
        private orderService: OrderService,
        private lineDiscounts: LineDiscountService,
        private limits: DiscountLimitService,
        private accessScope: AccessScopeService,
    ) {}

    reduce(
        ctx: RequestContext,
        orderId: ID,
        lineId: ID,
        targetUnitPrice: number,
        reason?: string,
    ): Promise<void> {
        if (!Number.isInteger(targetUnitPrice) || targetUnitPrice < 0) {
            throw new UserInputError('The unit price must be a whole number, zero or more');
        }
        return this.lineEdit.edit(ctx, orderId, 'discount', async (txCtx, order) => {
            const line = this.lineEdit.lineOf(order, lineId);
            const before = await this.discountOf(txCtx, order, lineId);
            const refusal = reductionRefusal({
                current: before.effective,
                reference: before.reference,
                target: targetUnitPrice,
            });
            if (refusal) throw new UserInputError(REFUSALS[refusal]);
            if (targetUnitPrice === before.effective) return null;
            line.customFields = {
                ...line.customFields,
                manualUnitPrice: targetUnitPrice,
                manualPriceReason: reason ?? null,
            };
            await this.lineEdit.persist(txCtx, order, [line]);
            const after = await this.reloadedDiscount(txCtx, orderId, lineId);
            if (after.effective < before.effective)
                throw new UserInputError(REFUSALS['increases-discount']);
            return `Line ${line.productVariant.sku}: discount reduced, unit price ${before.effective} -> ${after.effective}`;
        });
    }

    revert(ctx: RequestContext, orderId: ID, lineId: ID): Promise<void> {
        return this.lineEdit.edit(ctx, orderId, 'discount', async (txCtx, order) => {
            const line = this.lineEdit.lineOf(order, lineId);
            const before = await this.discountOf(txCtx, order, lineId);
            if (!before.manual) return null;
            line.customFields = {
                ...line.customFields,
                manualUnitPrice: null,
                manualPriceReason: null,
            };
            await this.lineEdit.persist(txCtx, order, [line]);
            const after = await this.reloadedDiscount(txCtx, orderId, lineId);
            const { roleCodes } = await this.accessScope.getActorIdentity(txCtx);
            const ceiling =
                (await this.limits.ceilingsForProducts(txCtx, roleCodes, [after.productErpId])).get(
                    after.productErpId,
                ) ?? null;
            const refusal = revertRefusal({
                current: before.effective,
                reference: after.reference,
                automatic: after.effective,
                ceiling,
            });
            if (refusal) throw new UserInputError(REFUSALS[refusal]);
            return `Line ${line.productVariant.sku}: back to automatic discount, unit price ${before.effective} -> ${after.effective} (${discountPercent(after.reference, after.effective)}%)`;
        });
    }

    private async discountOf(ctx: RequestContext, order: Order, lineId: ID): Promise<LineDiscount> {
        const found = (await this.lineDiscounts.forOrder(ctx, order)).find(
            d => d.lineId === String(lineId),
        );
        if (!found) throw new UserInputError('The order has no such line');
        return found;
    }

    private async reloadedDiscount(
        ctx: RequestContext,
        orderId: ID,
        lineId: ID,
    ): Promise<LineDiscount> {
        const order = await this.orderService.findOne(ctx, orderId, LINE_DISCOUNT_RELATIONS);
        if (!order) throw new UserInputError('Order not found');
        return this.discountOf(ctx, order, lineId);
    }
}
