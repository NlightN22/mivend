import type { Repository } from 'typeorm';

import { TradingPointChange } from './entities/trading-point-change.entity';

export interface ProposedPointFields {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    workingHours: string | null;
    // undefined = contact left as is; null/'' = contact removed
    contactName?: string | null;
    contactPhone?: string | null;
}

export function parsePayload(change: Pick<TradingPointChange, 'payload'>): ProposedPointFields {
    return JSON.parse(change.payload) as ProposedPointFields;
}

// One pending change per point (unique partial index): a newer proposal replaces the older one.
export async function savePendingChange(
    repo: Repository<TradingPointChange>,
    point: { id: string; counterpartyId: string },
    proposed: ProposedPointFields,
    requestedByUserId: string | null,
): Promise<TradingPointChange> {
    await repo.update(
        { tradingPointId: point.id, status: 'pending' },
        { status: 'rejected', comment: 'superseded by a newer change', decidedAt: new Date() },
    );
    return repo.save(
        repo.create({
            tradingPointId: point.id,
            counterpartyId: point.counterpartyId,
            payload: JSON.stringify(proposed),
            status: 'pending',
            requestedByUserId,
        }),
    );
}

export function changeView(change: TradingPointChange): Record<string, unknown> {
    return {
        id: change.id,
        tradingPointId: change.tradingPointId,
        status: change.status,
        createdAt: change.createdAt,
        ...parsePayload(change),
    };
}
