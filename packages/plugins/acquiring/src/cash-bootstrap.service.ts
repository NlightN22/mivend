import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    LanguageCode,
    Logger,
    PaymentMethod,
    PaymentMethodService,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { CASH_METHOD_CODE } from './cash-handler';
import { loggerCtx } from './types';

// Creates the method once; an admin may disable it afterwards and it stays disabled.
@Injectable()
export class CashBootstrapService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private paymentMethodService: PaymentMethodService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        try {
            const ctx = RequestContext.empty();
            const existing = await this.connection
                .getRepository(ctx, PaymentMethod)
                .findOne({ where: { code: CASH_METHOD_CODE } });
            if (existing) return;
            await this.paymentMethodService.create(ctx, {
                code: CASH_METHOD_CODE,
                enabled: true,
                handler: { code: CASH_METHOD_CODE, arguments: [] },
                translations: [{ languageCode: LanguageCode.en, name: 'Cash' }],
            });
            Logger.info(`Self-provisioned payment method "${CASH_METHOD_CODE}"`, loggerCtx);
        } catch (err) {
            Logger.error(
                `Failed to self-provision payment method "${CASH_METHOD_CODE}": ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }
}
