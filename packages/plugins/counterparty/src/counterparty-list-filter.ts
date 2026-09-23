import { ID } from '@vendure/common/lib/shared-types';
import type { SelectQueryBuilder } from 'typeorm';

import { Counterparty } from './entities/counterparty.entity';

// Mirrors the GraphQL `CounterpartyListFilter` input — the narrowing half of
// `CounterpartyListOptions`, shared by the list query and filter-shaped bulk mutations (#136).
export interface CounterpartyListFilter {
    search?: string;
    status?: string;
    managerId?: ID;
    managerErpId?: string;
    branchId?: string;
    groupLabel?: string;
    unassignedOnly?: boolean;
}

// Narrows on top of the access-scope restriction, never replaces it.
export function applyCounterpartyListFilter(
    qb: SelectQueryBuilder<Counterparty>,
    filter: CounterpartyListFilter,
): SelectQueryBuilder<Counterparty> {
    if (filter.search) {
        qb.andWhere(
            '(c.shortName ILIKE :search OR c.legalName ILIKE :search OR c.inn ILIKE :search)',
            {
                search: `%${filter.search}%`,
            },
        );
    }
    if (filter.status === 'active') {
        qb.andWhere('c.isActive = true');
    } else if (filter.status === 'inactive') {
        qb.andWhere('c.isActive = false');
    }
    // Separate flag rather than `managerId: null` — omitted vs explicit null is ambiguous here.
    if (filter.unassignedOnly) {
        qb.andWhere('c.assignedManagerId IS NULL');
    } else if (filter.managerId) {
        qb.andWhere('c.assignedManagerId = :managerId', { managerId: String(filter.managerId) });
    }
    // Matches the raw ERP id OR the ERP-reported name — most rows have no linked Administrator.
    if (filter.managerErpId) {
        qb.andWhere(
            `(c."managerErpId" ILIKE :managerErpId OR EXISTS (
                SELECT 1 FROM erp_user eu
                WHERE eu."erpId" = c."managerErpId" AND eu."fullName" ILIKE :managerErpId
            ))`,
            { managerErpId: `%${filter.managerErpId}%` },
        );
    }
    if (filter.branchId) {
        qb.andWhere('c.branchId = :branchId', { branchId: filter.branchId });
    }
    if (filter.groupLabel) {
        qb.andWhere('c.erpGroupLabel = :groupLabel', { groupLabel: filter.groupLabel });
    }
    return qb;
}
