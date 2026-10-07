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

import { freightEligibilityChecker } from './freight-eligibility-checker';
import { FREIGHT_SHIPPING_METHOD_CODE, loggerCtx } from './constants';

// Idempotent, runs on every boot of both instance types (a branch can originate its own checkout).
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
        if (existing) {
            if (existing.checker?.code !== freightEligibilityChecker.code) {
                await repo.update(existing.id, {
                    checker: { code: freightEligibilityChecker.code, args: [] },
                });
            }
            return;
        }

        await this.shippingMethodService.create(ctx, {
            code: FREIGHT_SHIPPING_METHOD_CODE,
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Freight delivery',
                    description: 'Freight delivery per contract terms',
                },
            ],
            checker: { code: freightEligibilityChecker.code, arguments: [] },
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
