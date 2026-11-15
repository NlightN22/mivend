import type { VendureEntity } from '@vendure/core';

import type { Counterparty } from './entities/counterparty.entity';

// 'erp' = the ERP stream keeps writing it; 'portal' = seeded on first arrival, then only mivend
// changes it (and sends it to the ERP); 'local' = derived or mivend-only, the stream never sets it.
export type FieldOwner = 'erp' | 'portal' | 'local';

export type CounterpartyColumn = Exclude<keyof Counterparty, keyof VendureEntity>;

// The only place field authority is decided; a new Counterparty column fails to compile until listed.
export const COUNTERPARTY_FIELD_OWNERS = {
    erpId: 'local',
    version: 'local',
    isActive: 'erp',
    creditLimit: 'erp',
    creditBalance: 'erp',
    paymentDelayDays: 'erp',
    priceType: 'erp',
    mainContractId: 'erp',
    mainBankAccountId: 'erp',
    managerErpId: 'erp',
    departmentId: 'erp',
    branchId: 'local',
    branchOverrideId: 'local',
    creditTermOverrideExtraDays: 'local',
    legalName: 'portal',
    shortName: 'portal',
    fullName: 'portal',
    inn: 'portal',
    kpp: 'portal',
    ogrnip: 'portal',
    okpo: 'portal',
    legalType: 'portal',
    legalFormId: 'portal',
    regionId: 'portal',
    legalAddress: 'portal',
    factualAddress: 'portal',
    phone: 'portal',
    officialEmail: 'portal',
    erpGroupLabel: 'portal',
    assignedManagerId: 'portal',
} as const satisfies Record<CounterpartyColumn, FieldOwner>;

export const PORTAL_OWNED_COLUMNS = (
    Object.keys(COUNTERPARTY_FIELD_OWNERS) as CounterpartyColumn[]
).filter(column => COUNTERPARTY_FIELD_OWNERS[column] === 'portal');

// What an inbound event may write onto an existing record.
export function withoutPortalOwned(patch: Partial<Counterparty>): Partial<Counterparty> {
    const kept: Partial<Counterparty> = {};
    for (const key of Object.keys(patch) as CounterpartyColumn[]) {
        if (COUNTERPARTY_FIELD_OWNERS[key] !== 'portal') {
            (kept as Record<string, unknown>)[key] = patch[key];
        }
    }
    return kept;
}
