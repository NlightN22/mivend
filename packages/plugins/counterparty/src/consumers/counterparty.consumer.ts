import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { CounterpartyService } from '../counterparty.service';
import { loggerCtx } from '../types';

export interface CounterpartyUpsertEvent {
    eventType: 'counterparty.upsert';
    eventId: string;
    payload: {
        erpId: string;
        legalName: string;
        shortName: string;
        inn?: string | null;
        creditLimit: number;
        creditBalance: number;
        paymentDelayDays: number;
        priceType: string;
        isActive: boolean;
    };
}

export interface CounterpartyDeactivateEvent {
    eventType: 'counterparty.deactivate';
    eventId: string;
    payload: { erpId: string };
}

export interface CounterpartyCreditUpdateEvent {
    eventType: 'counterparty.credit_update';
    eventId: string;
    payload: { erpId: string; creditLimit: number; creditBalance: number };
}

export type CounterpartyEvent =
    | CounterpartyUpsertEvent
    | CounterpartyDeactivateEvent
    | CounterpartyCreditUpdateEvent;

// Wired up by plugin-sync at runtime via handleEvent().
// Idempotency is guaranteed by erpId uniqueness in the DB.
@Injectable()
export class CounterpartyConsumer {
    constructor(
        private readonly counterpartyService: CounterpartyService,
        private readonly connection: TransactionalConnection,
    ) {}

    async handleEvent(event: CounterpartyEvent): Promise<void> {
        const ctx = RequestContext.empty();
        switch (event.eventType) {
            case 'counterparty.upsert':
                await this.counterpartyService.upsert(ctx, event.payload);
                Logger.verbose(`Handled counterparty.upsert [${event.payload.erpId}]`, loggerCtx);
                break;
            case 'counterparty.deactivate':
                await this.counterpartyService.deactivate(ctx, event.payload.erpId);
                Logger.verbose(
                    `Handled counterparty.deactivate [${event.payload.erpId}]`,
                    loggerCtx,
                );
                break;
            case 'counterparty.credit_update':
                await this.counterpartyService.updateCredit(
                    ctx,
                    event.payload.erpId,
                    event.payload.creditLimit,
                    event.payload.creditBalance,
                );
                Logger.verbose(
                    `Handled counterparty.credit_update [${event.payload.erpId}]`,
                    loggerCtx,
                );
                break;
        }
    }
}
