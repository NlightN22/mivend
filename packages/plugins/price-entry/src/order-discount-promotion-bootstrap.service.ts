import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    LanguageCode,
    Logger,
    ProcessContext,
    Promotion,
    PromotionService,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

import {
    ORDER_DISCOUNT_ACTION_CODE,
    ORDER_DISCOUNT_CONDITION_CODE,
} from './order-discount.promotion';
import { loggerCtx } from './types';

// Failing to provision must stop boot: without the promotion every order-dependent discount silently vanishes.
@Injectable()
export class OrderDiscountPromotionBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private promotionService: PromotionService,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await withAggregateLock(this.connection, ctx, 'order-discount-promotion', async txCtx => {
            const promotions = await this.connection.getRepository(txCtx, Promotion).find();
            const existing = promotions.find(
                p => !p.deletedAt && p.actions.some(a => a.code === ORDER_DISCOUNT_ACTION_CODE),
            );
            if (existing) {
                if (!existing.enabled) {
                    await this.promotionService.updatePromotion(txCtx, {
                        id: existing.id,
                        enabled: true,
                    });
                    Logger.warn('Re-enabled the order-discount promotion', loggerCtx);
                }
                return;
            }
            await this.promotionService.createPromotion(txCtx, {
                enabled: true,
                conditions: [{ code: ORDER_DISCOUNT_CONDITION_CODE, arguments: [] }],
                actions: [{ code: ORDER_DISCOUNT_ACTION_CODE, arguments: [] }],
                translations: [
                    { languageCode: LanguageCode.en, name: 'Order-dependent discounts' },
                ],
            });
            Logger.info('Provisioned the order-discount promotion', loggerCtx);
        });
    }
}
