import { UserInputError } from '@vendure/core';
import { ID } from '@vendure/common/lib/shared-types';
import type { SelectQueryBuilder } from 'typeorm';

import { INN_DIGITS_SQL } from './counterparty-inn-guard';
import { portalReadinessSql } from './counterparty-readiness-filter';
import { Counterparty } from './entities/counterparty.entity';

// Mirrors the GraphQL `CounterpartyListFilter` input — the narrowing half of
// `CounterpartyListOptions`, shared by the list query and filter-shaped bulk mutations (#136).
export const MAX_ERP_IDS = 200;

export interface CounterpartyListFilter {
    search?: string;
    erpIds?: string[];
    status?: string;
    managerId?: ID;
    managerErpId?: string;
    branchId?: string;
    branchUnassigned?: boolean;
    groupLabel?: string;
    unassignedOnly?: boolean;
    innStatus?: string;
    readiness?: string;
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
    if (filter.erpIds) {
        if (filter.erpIds.length > MAX_ERP_IDS) {
            throw new UserInputError(`At most ${MAX_ERP_IDS} erpIds per request`);
        }
        qb.andWhere('c.erpId IN (:...erpIds)', {
            erpIds: filter.erpIds.length ? filter.erpIds : [''],
        });
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
    // Separate flag, same reason as unassignedOnly: omitted and explicit null are ambiguous.
    if (filter.branchUnassigned) {
        qb.andWhere('c.branchId IS NULL');
    } else if (filter.branchId) {
        qb.andWhere('c.branchId = :branchId', { branchId: filter.branchId });
    }
    if (filter.groupLabel) {
        qb.andWhere('c.erpGroupLabel = :groupLabel', { groupLabel: filter.groupLabel });
    }
    if (filter.innStatus && filter.innStatus !== 'missing' && filter.innStatus !== 'duplicate') {
        throw new UserInputError(`Unknown innStatus filter: ${filter.innStatus}`);
    }
    if (filter.innStatus === 'missing') {
        qb.andWhere(`${INN_DIGITS_SQL} = ''`);
    } else if (filter.innStatus === 'duplicate') {
        qb.andWhere(`c.isActive = true AND ${INN_DIGITS_SQL} <> '' AND EXISTS (
            SELECT 1 FROM counterparty d WHERE d.id <> c.id AND d."isActive" = true
            AND regexp_replace(d.inn, '\\D', '', 'g') = ${INN_DIGITS_SQL})`);
    }
    if (filter.readiness) {
        qb.andWhere(`(${portalReadinessSql(filter.readiness)})`);
    }
    return qb;
}
