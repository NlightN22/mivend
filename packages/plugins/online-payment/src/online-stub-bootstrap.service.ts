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

// The stub accepts any card payment, so a production server never enables it, whatever the flag says.
export function onlineStubEnabled(): boolean {
    if (process.env.ONLINE_PAYMENT_STUB_ENABLED !== 'true') return false;
    if (process.env.NODE_ENV !== 'production') return true;
    Logger.error('ONLINE_PAYMENT_STUB_ENABLED=true is refused when NODE_ENV=production', loggerCtx);
    return false;
}

// Runs on every boot of every instance type, so it must be idempotent and avoid ERP/Kafka.
// Branch instances run it locally without ERP/Kafka, so no remote dependency is allowed.
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
        const enabled = onlineStubEnabled();
        if (existing) {
            if (existing.enabled !== enabled) {
                await this.paymentMethodService.update(ctx, { id: existing.id, enabled });
            }
            return;
        }
        if (!enabled) return;

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
