import type { Repository } from 'typeorm';

import { TradingPointErp } from './entities/trading-point-erp.entity';

// Point-of-sale fields mivend does not read; ids are soft links, lists are JSON text exactly as sent.
export interface ErpPointExtra {
    isDeleted: boolean;
    code: string | null;
    regionId: string | null;
    storageStock: string | null;
    loyalty: string | null;
    area: number | null;
    classification: string | null;
    hasCompetitors: boolean | null;
    mainManagerId: string | null;
    bankAccountId: string | null;
    internalTransferPointId: string | null;
    accuracyRadius: number | null;
    productGroupIds: string;
    managerIds: string;
    pointTypeIds: string;
    salesChannels: string;
    contactInfos: string;
}

export async function markMirrorDeleted(
    repo: Repository<TradingPointErp>,
    erpId: string,
): Promise<boolean> {
    const result = await repo.update({ erpId }, { isActive: false, isDeleted: true });
    return (result.affected ?? 0) > 0;
}
