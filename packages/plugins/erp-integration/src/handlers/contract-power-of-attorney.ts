import type { PowerOfAttorneyErpItem } from '@mivend/plugin-counterparty';

import { records, str, time } from './erp-document-payload';

export function powerOfAttorneyItems(payload: Record<string, unknown>): PowerOfAttorneyErpItem[] {
    return records(payload.powersOfAttorney).map(item => ({
        externalId: str(item.externalId),
        number: str(item.number) ?? '',
        holderName: str(item.holderName) ?? '',
        issueDate: time(item.issueDate),
        validUntil: time(item.validUntil),
        scanId: str(item.scanId),
    }));
}
