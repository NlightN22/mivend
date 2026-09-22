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

import { OFFLINE_TERMS_METHOD_CODE } from './offline-terms-handler';
import { loggerCtx } from './types';

// Idempotent, safe to run on every boot — same pattern as
// plugin-deferred-payment's DeferredPaymentBootstrapService. Gated on
// `!processContext.isWorker` only; AcquiringPlugin itself is instantiated only on the central
// instance (see apps/server/src/vendure-config.ts's instancePlugins), so this bootstrap
// currently only ever runs on central as a byproduct of that, not via any gating here.
@Injectable()
export class OfflineTermsBootstrapService implements OnApplicationBootstrap {
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
                `Failed to self-provision payment method "${OFFLINE_TERMS_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async ensurePaymentMethodExists(): Promise<void> {
        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, PaymentMethod);
        const existing = await repo.findOne({ where: { code: OFFLINE_TERMS_METHOD_CODE } });
        if (existing) return;

        const defaultChannel = await this.channelService.getDefaultChannel();
        await this.paymentMethodService.create(ctx, {
            code: OFFLINE_TERMS_METHOD_CODE,
            enabled: true,
            handler: { code: OFFLINE_TERMS_METHOD_CODE, arguments: [] },
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Invoice / deferred payment',
                },
            ],
        });
        Logger.info(
            `Self-provisioned payment method "${OFFLINE_TERMS_METHOD_CODE}" on channel ${defaultChannel.code}`,
            loggerCtx,
        );
    }
}
