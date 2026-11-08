import type { ErpPointExtra } from '@mivend/plugin-counterparty';

import { listJson, optionalText } from './erp-mirror-upsert';

function number(value: unknown): number | null {
    return typeof value === 'number' ? value : null;
}

// A named point-of-sale event is full state: an absent field clears the mirrored value.
export function pointOfSaleExtra(payload: Record<string, unknown>): ErpPointExtra {
    return {
        isDeleted: payload.isDeleted === true,
        code: optionalText(payload.code),
        regionId: optionalText(payload.regionId),
        storageStock: optionalText(payload.storageStock),
        loyalty: optionalText(payload.loyalty),
        area: number(payload.area),
        classification: optionalText(payload.classification),
        hasCompetitors: typeof payload.hasCompetitors === 'boolean' ? payload.hasCompetitors : null,
        mainManagerId: optionalText(payload.mainManagerId),
        bankAccountId: optionalText(payload.bankAccountId),
        internalTransferPointId: optionalText(payload.internalTransferPointId),
        accuracyRadius: number(payload.accuracyRadius),
        productGroupIds: listJson(payload.productGroupIds),
        managerIds: listJson(payload.managerIds),
        pointTypeIds: listJson(payload.pointTypeIds),
        salesChannels: listJson(payload.salesChannels),
        contactInfos: listJson(payload.contactInfos),
    };
}
