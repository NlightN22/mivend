import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyErpDetails, definedErpDetails } from './counterparty-erp-details';
import { withoutPortalOwned } from './counterparty-ownership';

export interface ActiveStateFields extends CounterpartyErpDetails {
    name: string | null;
    isActive: boolean;
    inn?: string | null;
    erpGroupLabel?: string | null;
    departmentId?: string | null;
    assignedManagerId?: string | null;
    // Raw erpId assignedManagerId was resolved from; always passed alongside it, even when that is null
    managerErpId?: string | null;
    legalAddress?: string | null;
    factualAddress?: string | null;
    phone?: string | null;
    officialEmail?: string | null;
}

// Everything the event carries, for a record seen for the first time.
export function activeStateSeedPatch(fields: ActiveStateFields): Partial<Counterparty> {
    const patch: Partial<Counterparty> = { isActive: fields.isActive };
    if (fields.name) {
        patch.legalName = fields.name;
        patch.shortName = fields.name;
    }
    if (fields.inn !== undefined) patch.inn = fields.inn;
    if (fields.erpGroupLabel !== undefined) patch.erpGroupLabel = fields.erpGroupLabel;
    if (fields.departmentId !== undefined) patch.departmentId = fields.departmentId;
    if (fields.assignedManagerId !== undefined) patch.assignedManagerId = fields.assignedManagerId;
    if (fields.managerErpId !== undefined) patch.managerErpId = fields.managerErpId;
    if (fields.legalAddress !== undefined) patch.legalAddress = fields.legalAddress;
    if (fields.factualAddress !== undefined) patch.factualAddress = fields.factualAddress;
    if (fields.phone !== undefined) patch.phone = fields.phone;
    if (fields.officialEmail !== undefined) patch.officialEmail = fields.officialEmail;
    return { ...patch, ...definedErpDetails(fields) };
}

// An existing record takes only what the ERP still owns; a full-entity save would also write a stale branchId over a concurrent reconcile.
export function activeStatePatch(fields: ActiveStateFields): Partial<Counterparty> {
    return withoutPortalOwned(activeStateSeedPatch(fields));
}

export function newCounterpartyFromActiveState(
    erpId: string,
    name: string,
    fields: ActiveStateFields,
): Partial<Counterparty> {
    return {
        erpId,
        legalName: name,
        shortName: name,
        isActive: fields.isActive,
        inn: fields.inn ?? null,
        erpGroupLabel: fields.erpGroupLabel ?? null,
        departmentId: fields.departmentId ?? null,
        assignedManagerId: fields.assignedManagerId ?? null,
        managerErpId: fields.managerErpId ?? null,
        legalAddress: fields.legalAddress ?? null,
        factualAddress: fields.factualAddress ?? null,
        phone: fields.phone ?? null,
        officialEmail: fields.officialEmail ?? null,
        ...definedErpDetails(fields),
    };
}
