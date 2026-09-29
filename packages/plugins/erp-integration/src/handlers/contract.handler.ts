import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import { MissingDependencyError } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationContractHandler';

// Applies Integration Service's `contract` stream (ContractChanged, issue #105). Field-by-field
// accounting: docs/ai/erp-streams-map.md's `contract` row.
@Injectable()
export class ContractStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly contractService: ContractService,
        private readonly counterpartyService: CounterpartyService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = payload.name ? String(payload.name) : null;

        // Tombstone: no name, no reliable counterpartyId — deactivate-only, no lookup or field
        // write (docs/ai/erp-streams-map.md's `contract` field accounting).
        if (!name) {
            await this.contractService.deactivateTombstone(ctx, entityId);
            Logger.verbose(
                `contract ${entityId}: tombstone — deactivated if a row existed`,
                loggerCtx,
            );
            return;
        }

        const isActive = payload.isActive === true && payload.isDeleted !== true;
        // Proto3 zero-value omission (docs/ai/erp-streams-map.md) — absent means false/null.
        const controlledIndividually = payload.controlledIndividually === true;
        const debtDaysLimit =
            typeof payload.debtDaysLimit === 'number' ? payload.debtDaysLimit : null;
        const paymentDelayDays =
            typeof payload.paymentDelayDays === 'number' ? payload.paymentDelayDays : null;

        const counterpartyErpId = String(payload.counterpartyId ?? '');
        const counterparty = await this.counterpartyService.findByErpId(ctx, counterpartyErpId);
        if (!counterparty) {
            // Ordinary eventual-consistency race (Kafka gives no cross-topic ordering guarantee)
            // — retryable, same as every other sibling handler's cross-entity dependency.
            throw new MissingDependencyError(
                `contract ${entityId}: counterparty erpId=${counterpartyErpId} not synced yet`,
            );
        }

        await this.contractService.upsertActiveState(ctx, entityId, {
            name,
            counterpartyId: String(counterparty.id),
            organizationId: String(payload.organizationId ?? ''),
            priceTypeId: String(payload.priceTypeId ?? ''),
            isActive,
            contractKind: String(payload.contractKind ?? ''),
            contractType: String(payload.contractType ?? ''),
            creditLimit:
                'creditLimit' in payload
                    ? ((payload.creditLimit as string | null) ?? null)
                    : undefined,
            currency:
                'currency' in payload ? ((payload.currency as string | null) ?? null) : undefined,
            controlledIndividually,
            debtDaysLimit,
            paymentKind:
                'paymentKind' in payload
                    ? ((payload.paymentKind as string | null) ?? null)
                    : undefined,
            paymentDelayDays,
            brandManufacturerId:
                'brandManufacturerId' in payload
                    ? ((payload.brandManufacturerId as string | null) ?? null)
                    : undefined,
        });
        Logger.verbose(`Upserted contract erpId=${entityId}`, loggerCtx);
    }
}
