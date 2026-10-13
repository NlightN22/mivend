import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { SettlementDocumentService } from '@mivend/plugin-settlement';
import type { SettlementEntryInput } from '@mivend/plugin-settlement';

import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { optionalString, parseTimestamp } from './settlement-payload';

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

// Applies `settlement-document` (#224): one registrar document, its per-triple effect in entries[].
// Amounts are major-unit doubles (a zero is omitted by proto3); the service converts to minor units.
@Injectable()
export class SettlementDocumentStreamHandler implements InboundStreamHandler {
    constructor(private readonly documentService: SettlementDocumentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const version = String(payload.version ?? '');
        if (!entityId || !version) {
            return inboundNoop(`settlement-document ${entityId}: missing version, skipping`);
        }
        const isDeleted = payload.isDeleted === true;
        const date = parseTimestamp(payload.date);
        if (!isDeleted && !date) {
            return inboundNoop(`settlement-document ${entityId}: no date, skipping`);
        }
        const parsed = this.parseEntries(payload.entries);
        if (!isDeleted && parsed.problem) {
            throw new NonRetryableInboundError(
                `settlement-document ${entityId}: invalid entry, ${parsed.problem}`,
            );
        }

        const result = await this.documentService.apply(ctx, {
            erpId: entityId,
            version,
            isDeleted,
            documentType: String(payload.documentType ?? ''),
            documentTypeLabel: String(payload.documentTypeLabel ?? ''),
            number: String(payload.number ?? ''),
            date,
            entries: isDeleted ? [] : parsed.entries,
        });
        if (result === 'stale') {
            return inboundNoop(`settlement-document ${entityId}: version not newer than stored`);
        }
        if (result === 'unknown-deleted') {
            return inboundNoop(`settlement-document ${entityId}: deletion of an unknown document`);
        }
        return inboundApplied();
    }

    private parseEntries(raw: unknown): { entries: SettlementEntryInput[]; problem?: string } {
        const entries: SettlementEntryInput[] = [];
        if (!Array.isArray(raw)) return { entries };
        for (const [index, item] of raw.entries()) {
            const entry = asRecord(item);
            const organizationErpId = String(entry.organizationId ?? '');
            const counterpartyErpId = String(entry.counterpartyId ?? '');
            const contractErpId = String(entry.contractId ?? '');
            const amount = Number(entry.amount ?? 0);
            if (!organizationErpId || !counterpartyErpId || !contractErpId) {
                return {
                    entries,
                    problem: `entry ${index} misses organization, counterparty or contract`,
                };
            }
            if (!Number.isFinite(amount)) {
                return { entries, problem: `entry ${index} has a non-numeric amount` };
            }
            const links = Array.isArray(entry.orderLinks) ? entry.orderLinks : [];
            entries.push({
                organizationErpId,
                counterpartyErpId,
                contractErpId,
                currency: String(entry.currency ?? ''),
                amount,
                dueDate: parseTimestamp(entry.dueDate),
                orderLinks: links.map(link => {
                    const l = asRecord(link);
                    return {
                        orderErpId: String(l.orderId ?? ''),
                        orderUuid: optionalString(l.orderUuid),
                        amount: Number(l.amount ?? 0),
                    };
                }),
            });
        }
        return { entries };
    }
}
