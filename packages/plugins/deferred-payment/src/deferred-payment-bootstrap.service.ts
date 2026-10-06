import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    ChannelService,
    LanguageCode,
    Logger,
    PaymentMethod,
    PaymentMethodService,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { DEFERRED_PAYMENT_METHOD_CODE } from './deferred-payment-handler';
import { deferredEligibilityChecker } from './deferred-eligibility-checker';
import { loggerCtx } from './constants';

// Idempotent, safe to run on every boot, on both instance types — plain local
// Vendure config with no ERP/Kafka dependency (unlike erp-integration's instanceType-gated
// bootstrap steps), and a branch instance can run checkout locally too (see docs/sync.md).
// Gated on `!processContext.isWorker`, same reasoning as RoleProvisioningService.
@Injectable()
export class DeferredPaymentBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private channelService: ChannelService,
        private paymentMethodService: PaymentMethodService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;

        try {
            await this.ensurePaymentMethodExists();
        } catch (err) {
            Logger.error(
                `Failed to self-provision payment method "${DEFERRED_PAYMENT_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async ensurePaymentMethodExists(): Promise<void> {
        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, PaymentMethod);
        const existing = await repo.findOne({ where: { code: DEFERRED_PAYMENT_METHOD_CODE } });
        const checker = { code: deferredEligibilityChecker.code, arguments: [] };
        if (existing) {
            if (!existing.checker) {
                await this.paymentMethodService.update(ctx, { id: existing.id, checker });
            }
            return;
        }

        const defaultChannel = await this.channelService.getDefaultChannel();
        await this.paymentMethodService.create(ctx, {
            code: DEFERRED_PAYMENT_METHOD_CODE,
            enabled: true,
            checker,
            handler: { code: DEFERRED_PAYMENT_METHOD_CODE, arguments: [] },
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Deferred payment',
                },
            ],
        });
        Logger.info(
            `Self-provisioned payment method "${DEFERRED_PAYMENT_METHOD_CODE}" on channel ${defaultChannel.code}`,
            loggerCtx,
        );
    }
}
