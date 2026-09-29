import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import { MissingDependencyError } from '../types';
import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationContractHandler';

// Applies Integration Service's `contract` stream (ContractChanged, issue #105), verified live
// against @nlightn22/event-contracts@0.42.0. Full current field-by-field accounting for this
// message (envelope fields event_id/occurred_at/entity_id/version/updated_at are handled
// generically by KafkaConsumerService, not listed here):
//   - counterpartyId/organizationId/priceTypeId/contractKind/contractType — always-present raw
//     passthrough/reference fields, consumed. counterpartyId is resolved to the local
//     Counterparty.id here, never stored as a raw erpId — see resolveCounterpartyId below.
//   - creditLimit/currency/controlledIndividually/debtDaysLimit/paymentKind/paymentDelayDays/
//     brandManufacturerId — real optional-scalar fields (undefined = "the ERP didn't send this"),
//     consumed. controlledIndividually is #50's credit-gate signal — never inferred from
//     creditLimit's own presence (see #50/#105 issue history's explicit retraction of that
//     inference).
//   - name — consumed; also this stream's deletion-tombstone signal (see below).
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
        // A deletion tombstone never carries a name — same convention confirmed for counterparty/
        // organization/department. `name: null` here still lets upsertActiveState update isActive
        // on an existing row; it only refuses to fabricate a brand-new row with a blank name.
        const name = payload.name ? String(payload.name) : null;
        const isActive = payload.isActive === true && payload.isDeleted !== true;

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
            controlledIndividually:
                'controlledIndividually' in payload
                    ? ((payload.controlledIndividually as boolean | null) ?? null)
                    : undefined,
            debtDaysLimit:
                'debtDaysLimit' in payload
                    ? ((payload.debtDaysLimit as number | null) ?? null)
                    : undefined,
            paymentKind:
                'paymentKind' in payload
                    ? ((payload.paymentKind as string | null) ?? null)
                    : undefined,
            paymentDelayDays:
                'paymentDelayDays' in payload
                    ? ((payload.paymentDelayDays as number | null) ?? null)
                    : undefined,
            brandManufacturerId:
                'brandManufacturerId' in payload
                    ? ((payload.brandManufacturerId as string | null) ?? null)
                    : undefined,
        });

        if (!name) {
            Logger.verbose(
                `contract ${entityId}: no name (deletion tombstone) — updated active state ` +
                    'only if a row already existed, never created one',
                loggerCtx,
            );
            return;
        }
        Logger.verbose(`Upserted contract erpId=${entityId}`, loggerCtx);
    }
}
