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

import { loggerCtx } from './types';

export const FREIGHT_SHIPPING_METHOD_CODE = 'freight-delivery';

// Idempotent ShippingMethod bootstrap, same pattern as plugin-pickup-shipping's
// PickupShippingBootstrapService — but gated only on `!processContext.isWorker`, NOT
// instanceType, unlike this plugin's other bootstrap steps (kafka-consumer-bootstrap.service.ts,
// tax-category-auto-create.service.ts): those are central-only because they're tied to the Kafka
// connection, but a branch instance can originate its own local checkout too (see
// docs/sync.md), so this must run on both. This ShippingMethod exists only when
// plugin-erp-integration is enabled: ERP integration is what conceptually unlocks
// warehouse-based freight delivery as a real fulfillment option, distinct from the universal
// "pickup" default that plugin-pickup-shipping always provides.
//
// NOTE: the storefront still calls this concept "courier" (DeliveryType, DeliverySelector.vue) —
// that's a known naming mismatch tracked by issue #44, not fixed here.
@Injectable()
export class FreightShippingBootstrapService implements OnApplicationBootstrap {
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
                `Failed to self-provision shipping method "${FREIGHT_SHIPPING_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async ensureShippingMethodExists(): Promise<void> {
        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, ShippingMethod);
        const existing = await repo.findOne({ where: { code: FREIGHT_SHIPPING_METHOD_CODE } });
        if (existing) return;

        await this.shippingMethodService.create(ctx, {
            code: FREIGHT_SHIPPING_METHOD_CODE,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Freight delivery',
                    description: 'Freight delivery per contract terms',
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
        Logger.info(
            `Self-provisioned shipping method "${FREIGHT_SHIPPING_METHOD_CODE}"`,
            loggerCtx,
        );
    }
}
