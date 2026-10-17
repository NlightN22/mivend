import { Counterparty } from './entities/counterparty.entity';
import { CounterpartyErpDetails, definedErpDetails } from './counterparty-erp-details';

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

export function applyActiveStateFields(entity: Counterparty, fields: ActiveStateFields): void {
    if (fields.name) {
        entity.legalName = fields.name;
        entity.shortName = fields.name;
    }
    entity.isActive = fields.isActive;
    if (fields.inn !== undefined) entity.inn = fields.inn;
    if (fields.erpGroupLabel !== undefined) entity.erpGroupLabel = fields.erpGroupLabel;
    if (fields.departmentId !== undefined) entity.departmentId = fields.departmentId;
    if (fields.assignedManagerId !== undefined) {
        entity.assignedManagerId = fields.assignedManagerId;
    }
    if (fields.managerErpId !== undefined) entity.managerErpId = fields.managerErpId;
    if (fields.legalAddress !== undefined) entity.legalAddress = fields.legalAddress;
    if (fields.factualAddress !== undefined) {
        entity.factualAddress = fields.factualAddress;
    }
    if (fields.phone !== undefined) entity.phone = fields.phone;
    if (fields.officialEmail !== undefined) entity.officialEmail = fields.officialEmail;
    Object.assign(entity, definedErpDetails(fields));
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
