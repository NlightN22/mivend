import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    LanguageCode,
    Logger,
    ProcessContext,
    RequestContext,
    ShippingMethod,
    ShippingMethodService,
    TransactionalConnection,
} from '@vendure/core';

import { PICKUP_SHIPPING_METHOD_CODE, loggerCtx } from './constants';

// Runs on every boot of both instance types, so it must be idempotent.
// Not instanceType-gated: a branch instance can originate its own local checkout (docs/sync.md).
@Injectable()
export class PickupShippingBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private shippingMethodService: ShippingMethodService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;

        try {
            await this.ensureShippingMethodExists();
        } catch (err) {
            Logger.error(
                `Failed to self-provision shipping method "${PICKUP_SHIPPING_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async ensureShippingMethodExists(): Promise<void> {
        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, ShippingMethod);
        const existing = await repo.findOne({ where: { code: PICKUP_SHIPPING_METHOD_CODE } });
        if (existing) return;

        await this.shippingMethodService.create(ctx, {
            code: PICKUP_SHIPPING_METHOD_CODE,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Pickup',
                    description: 'Pickup per contract terms',
                },
            ],
            checker: {
                code: 'default-shipping-eligibility-checker',
                arguments: [{ name: 'orderMinimum', value: '0' }],
            },
            calculator: {
                code: 'default-shipping-calculator',
                arguments: [
                    { name: 'rate', value: '0' },
                    { name: 'includesTax', value: 'auto' },
                    { name: 'taxRate', value: '0' },
                ],
            },
            fulfillmentHandler: 'manual-fulfillment',
        });
        Logger.info(`Self-provisioned shipping method "${PICKUP_SHIPPING_METHOD_CODE}"`, loggerCtx);
    }
}
