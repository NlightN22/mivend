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

import { ONLINE_STUB_METHOD_CODE } from './online-stub-handler';
import { loggerCtx } from './constants';

// Idempotent, safe to run on every boot, on both instance types — no ERP/Kafka dependency, and a
// branch instance can run checkout locally too (see docs/sync.md). Same pattern as
// plugin-deferred-payment's DeferredPaymentBootstrapService.
@Injectable()
export class OnlineStubBootstrapService implements OnApplicationBootstrap {
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
                `Failed to self-provision payment method "${ONLINE_STUB_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async ensurePaymentMethodExists(): Promise<void> {
        const ctx = RequestContext.empty();
        const repo = this.connection.getRepository(ctx, PaymentMethod);
        const existing = await repo.findOne({ where: { code: ONLINE_STUB_METHOD_CODE } });
        if (existing) return;

        const defaultChannel = await this.channelService.getDefaultChannel();
        await this.paymentMethodService.create(ctx, {
            code: ONLINE_STUB_METHOD_CODE,
            enabled: true,
            handler: { code: ONLINE_STUB_METHOD_CODE, arguments: [] },
            translations: [
                {
                    languageCode: LanguageCode.en,
                    name: 'Online payment (demo)',
                },
            ],
        });
        Logger.info(
            `Self-provisioned payment method "${ONLINE_STUB_METHOD_CODE}" on channel ${defaultChannel.code}`,
            loggerCtx,
        );
    }
}
