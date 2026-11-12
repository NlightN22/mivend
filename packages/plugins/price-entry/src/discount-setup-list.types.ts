import { EXPIRING_SOON_DAYS } from './discount-registry.service';

export type DiscountSetupStatus = 'running' | 'expiring-soon' | 'upcoming' | 'expired' | 'inactive';

export const DISCOUNT_SETUP_STATUSES: readonly DiscountSetupStatus[] = [
    'running',
    'expiring-soon',
    'upcoming',
    'expired',
    'inactive',
];

export type DiscountSetupSortField = 'documentNumber' | 'validFrom' | 'validTo' | 'percent';

export interface DiscountSetupListOptions {
    skip?: number | null;
    take?: number | null;
    search?: string | null;
    status?: string | null;
    counterpartyId?: string | null;
    sort?: { field: DiscountSetupSortField; direction: 'ASC' | 'DESC' } | null;
}

export interface DiscountSetupCounterparty {
    id: string | null;
    name: string;
    contractErpId: string | null;
}

export interface DiscountSetupRow {
    id: string;
    documentNumber: string;
    percent: number;
    validFrom: Date;
    validTo: Date | null;
    status: DiscountSetupStatus;
    inactiveReason: string | null;
    priceTypeCode: string | null;
    allProducts: boolean;
    productMode: string;
    productCount: number;
    counterparties: DiscountSetupCounterparty[];
    recipientCount: number;
}

export interface DiscountSetupCounts {
    all: number;
    running: number;
    expiringSoon: number;
    upcoming: number;
    expired: number;
    inactive: number;
}

export interface SetupStatusInput {
    active: boolean;
    inactiveReason: string | null;
    validFrom: Date;
    validTo: Date | null;
}

export function soonThreshold(now: Date): Date {
    return new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
}

// Mirrors STATUS_SQL; the statuses are disjoint, so the counts add up to the total.
export function computeSetupStatus(setup: SetupStatusInput, now: Date): DiscountSetupStatus {
    if (!setup.active || setup.inactiveReason !== null) return 'inactive';
    if (setup.validTo && setup.validTo.getTime() < now.getTime()) return 'expired';
    if (setup.validFrom.getTime() > now.getTime()) return 'upcoming';
    if (setup.validTo && setup.validTo.getTime() < soonThreshold(now).getTime()) {
        return 'expiring-soon';
    }
    return 'running';
}

const LIVE = `s."active" AND s."inactiveReason" IS NULL`;

export const STATUS_SQL: Record<DiscountSetupStatus, string> = {
    inactive: `(NOT s."active" OR s."inactiveReason" IS NOT NULL)`,
    expired: `(${LIVE} AND s."validTo" < :dsNow)`,
    upcoming: `(${LIVE} AND s."validFrom" > :dsNow AND (s."validTo" IS NULL OR s."validTo" >= :dsNow))`,
    'expiring-soon': `(${LIVE} AND s."validFrom" <= :dsNow AND s."validTo" >= :dsNow AND s."validTo" < :dsSoon)`,
    running: `(${LIVE} AND s."validFrom" <= :dsNow AND (s."validTo" IS NULL OR s."validTo" >= :dsSoon))`,
};

const SORT_SQL: Record<DiscountSetupSortField, string> = {
    documentNumber: 's."documentNumber"',
    validFrom: 's."validFrom"',
    validTo: 's."validTo"',
    percent: 's."percent"',
};

export function setupOrderBy(
    sort: DiscountSetupListOptions['sort'],
): Array<[sql: string, direction: 'ASC' | 'DESC']> {
    const column = sort ? SORT_SQL[sort.field] : undefined;
    const primary: [string, 'ASC' | 'DESC'] = column
        ? [column, sort!.direction === 'ASC' ? 'ASC' : 'DESC']
        : [SORT_SQL.validFrom, 'DESC'];
    return [primary, ['s."id"', 'DESC']];
}
