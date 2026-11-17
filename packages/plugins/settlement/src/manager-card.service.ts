import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { getRawManyBounded, toAlphaCurrency } from 'shared';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { SettlementDocument } from './entities/settlement-document.entity';
import { AGING_BUCKETS_SQL, DEBT_BY_CUSTOMER_SQL } from './manager-card-aging.sql';
import { DYNAMICS_SQL, LAST_SALE_SQL, SALES_SQL } from './manager-card.sql';
import type {
    DynamicsPoint,
    LostCustomerRow,
    ManagerCard,
    ManagerDynamics,
    ManagerLostCustomers,
    ManagerReceivables,
    ManagerSales,
} from './manager-card.types';
import { addDays, managerCardPeriods, shiftMonths } from './manager-card.windows';
import type { ManagerCardPeriods } from './manager-card.windows';

export const CUSTOMER_CEILING = 5000;
export const LOST_THRESHOLDS = [60, 90, 180] as const;
const LOST_ROWS = 50;
const TOP_DEBTORS = 5;
const DEFAULT_CURRENCY = 'RUB';
const NON_OPEN_STATES = ['AddingItems', 'Draft', 'Cancelled', 'Delivered'];
const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;
interface Customer {
    id: string;
    erpId: string;
    name: string;
}

const num = (v: unknown): number => Number(v ?? 0);
const dayOf = (v: unknown): string =>
    v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

@Injectable()
export class ManagerCardService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly accessScope: AccessScopeService,
    ) {}

    // Own card; a head sees their department's managers; scope 'all' sees every manager. A missing manager answers like a hidden one.
    async openName(ctx: RequestContext, administratorId: string): Promise<string | null> {
        const scope = await this.accessScope.resolveCounterpartyScope(ctx);
        const rows = await this.query(
            ctx,
            `SELECT "customFieldsDepartmentid" AS department, concat_ws(' ', "firstName", "lastName") AS name
             FROM administrator WHERE id::text = $1 AND "deletedAt" IS NULL`,
            [administratorId],
        );
        if (rows.length === 0) return null;
        const name = String(rows[0].name);
        if (scope.kind === 'all') return name;
        if (scope.administratorId != null && String(scope.administratorId) === administratorId)
            return name;
        if (scope.kind !== 'department') return null;
        const department = rows[0].department as string | null;
        const inDepartment = department != null && department === scope.departmentId;
        return inDepartment || (scope.grantedManagerIds ?? []).includes(administratorId)
            ? name
            : null;
    }

    private query(ctx: RequestContext, sql: string, params: unknown[]): Promise<Row[]> {
        return this.connection.getRepository(ctx, SettlementDocument).query(sql, params);
    }

    async card(
        ctx: RequestContext,
        administratorId: string,
        administratorName: string,
        lostThreshold: number = 90,
        now: Date = new Date(),
    ): Promise<ManagerCard> {
        const periods = managerCardPeriods(now);
        const customers = await this.visibleCustomers(ctx, administratorId);
        const customersTotal = await this.assignedTotal(ctx, administratorId);
        const erpIds = customers.map(c => c.erpId);
        const ids = customers.map(c => c.id);
        const salesRows = await this.salesRows(ctx, erpIds, periods);
        const currency = pickCurrency(salesRows);
        const codes = currencyCodes(salesRows, currency);
        const [receivables, lost, dynamics, openOrders] = await Promise.all([
            this.receivables(ctx, ids, customers, currency),
            this.lost(ctx, customers, periods, codes, lostThreshold),
            this.dynamics(ctx, erpIds, periods),
            this.openOrders(ctx, ids),
        ]);
        return {
            administratorId,
            administratorName,
            currency,
            customersTotal,
            customersVisible: customers.length,
            openOrders,
            sales: toSales(salesRows, currency),
            receivables,
            lost,
            dynamics,
            computedAt: now,
        };
    }

    private async visibleCustomers(
        ctx: RequestContext,
        administratorId: string,
    ): Promise<Customer[]> {
        const qb = await this.counterparties.visibleFilteredQb(ctx, { managerId: administratorId });
        const rows = await getRawManyBounded<{ id: number; erpId: string; name: string }>(
            qb.select(['c.id AS id', 'c.erpId AS "erpId"', 'c.shortName AS name']).orderBy('c.id'),
            CUSTOMER_CEILING,
        );
        return rows.map(r => ({ id: String(r.id), erpId: r.erpId, name: r.name }));
    }

    private async assignedTotal(ctx: RequestContext, administratorId: string): Promise<number> {
        const rows = await this.query(
            ctx,
            `SELECT count(*) AS total FROM counterparty WHERE "assignedManagerId" = $1`,
            [administratorId],
        );
        return num(rows[0]?.total);
    }

    private async salesRows(
        ctx: RequestContext,
        erpIds: string[],
        p: ManagerCardPeriods,
    ): Promise<Row[]> {
        if (erpIds.length === 0) return [];
        const ranges = [
            p.last30,
            p.prev30,
            p.mtd,
            p.prevMonth,
            p.prevYearMonth,
            p.ytd,
            p.prevYtd,
            p.last12,
        ];
        const lower = ranges.map(r => r.from).sort()[0];
        return this.query(ctx, SALES_SQL, [erpIds, ...ranges.flatMap(r => [r.from, r.to]), lower]);
    }

    private async receivables(
        ctx: RequestContext,
        ids: string[],
        customers: Customer[],
        currency: string,
    ): Promise<ManagerReceivables> {
        if (ids.length === 0) return emptyReceivables();
        const [debtRows, bucketRows] = await Promise.all([
            this.query(ctx, DEBT_BY_CUSTOMER_SQL, [ids]),
            this.query(ctx, AGING_BUCKETS_SQL, [ids]),
        ]);
        const names = new Map(customers.map(c => [c.id, c.name]));
        const perCustomer = new Map<string, { debt: number; overdue: number }>();
        for (const r of debtRows) {
            if (toAlphaCurrency(String(r.currency)) !== currency) continue;
            const key = String(r.counterpartyId);
            const acc = perCustomer.get(key) ?? { debt: 0, overdue: 0 };
            acc.debt += num(r.balance);
            acc.overdue += num(r.overdue);
            perCustomer.set(key, acc);
        }
        const debtors = [...perCustomer]
            .map(([id, v]) => ({
                counterpartyId: id,
                name: names.get(id) ?? id,
                debtMinor: Math.max(v.debt, 0),
                overdueMinor: v.overdue,
            }))
            .filter(d => d.debtMinor > 0);
        const sum = (pick: (d: (typeof debtors)[number]) => number): number =>
            debtors.reduce((a, d) => a + pick(d), 0);
        const b = bucketRows.filter(r => toAlphaCurrency(String(r.currency)) === currency);
        const bucket = (key: string): number => b.reduce((a, r) => a + num(r[key]), 0);
        return {
            debtMinor: sum(d => d.debtMinor),
            overdueMinor: sum(d => d.overdueMinor),
            aging: {
                notDueMinor: bucket('notDue'),
                overdue1to30Minor: bucket('d1to30'),
                overdue31to60Minor: bucket('d31to60'),
                overdueOver60Minor: bucket('over60'),
            },
            topDebtors: [...debtors]
                .sort((x, y) => y.debtMinor - x.debtMinor)
                .slice(0, TOP_DEBTORS),
        };
    }

    private async lost(
        ctx: RequestContext,
        customers: Customer[],
        p: ManagerCardPeriods,
        codes: string[],
        threshold: number,
    ): Promise<ManagerLostCustomers> {
        const empty = { thresholdDays: threshold, count60: 0, count90: 0, count180: 0, rows: [] };
        if (customers.length === 0) return empty;
        const rows = await this.query(ctx, LAST_SALE_SQL, [
            customers.map(c => c.erpId),
            p.last12.from,
            p.today,
            codes,
        ]);
        const byErp = new Map(customers.map(c => [c.erpId, c]));
        const idle = (r: Row): number =>
            Math.floor((Date.parse(p.today) - Date.parse(dayOf(r.lastSale))) / DAY_MS);
        const countAbove = (days: number): number => rows.filter(r => idle(r) > days).length;
        const listed: LostCustomerRow[] = rows
            .filter(r => idle(r) > threshold && num(r.turnover12m) > 0)
            .map(r => ({
                counterpartyId: byErp.get(String(r.erpId))?.id ?? '',
                name: byErp.get(String(r.erpId))?.name ?? String(r.erpId),
                lastSaleDay: dayOf(r.lastSale),
                idleDays: idle(r),
                turnover12mMinor: num(r.turnover12m),
            }))
            .sort((a, b) => b.turnover12mMinor - a.turnover12mMinor)
            .slice(0, LOST_ROWS);
        return {
            thresholdDays: threshold,
            count60: countAbove(60),
            count90: countAbove(90),
            count180: countAbove(180),
            rows: listed,
        };
    }

    private async dynamics(
        ctx: RequestContext,
        erpIds: string[],
        p: ManagerCardPeriods,
    ): Promise<ManagerDynamics> {
        const zero: DynamicsPoint = { active: 0, newCustomers: 0, returned: 0, lost: 0 };
        if (erpIds.length === 0)
            return { current: zero, previous: zero, previousYear: zero, historyStartsAt: null };
        const yearBack = shiftMonths(p.today, -12);
        const rows = await this.query(ctx, DYNAMICS_SQL, [
            erpIds,
            p.today,
            addDays(p.today, -30),
            yearBack,
            shiftMonths(yearBack, -13),
        ]);
        const r = rows[0] ?? {};
        const point = (k: number): DynamicsPoint => ({
            active: num(r[`active${k}`]),
            newCustomers: num(r[`new${k}`]),
            returned: num(r[`returned${k}`]),
            lost: num(r[`lost${k}`]),
        });
        return {
            current: point(0),
            previous: point(1),
            previousYear: point(2),
            historyStartsAt: r.historyStartsAt ? dayOf(r.historyStartsAt) : null,
        };
    }

    private async openOrders(ctx: RequestContext, ids: string[]): Promise<number> {
        if (ids.length === 0) return 0;
        const rows = await this.query(
            ctx,
            `SELECT COUNT(*) AS total FROM "order" o
             WHERE o."customFieldsCounterpartyid" = ANY($1::text[]) AND o.state <> ALL($2::text[])`,
            [ids, NON_OPEN_STATES],
        );
        return num(rows[0]?.total);
    }
}

function pickCurrency(rows: Row[]): string {
    const best = [...rows].sort((a, b) => Math.abs(num(b.last12)) - Math.abs(num(a.last12)))[0];
    return best ? toAlphaCurrency(String(best.currency)) : DEFAULT_CURRENCY;
}

const currencyCodes = (rows: Row[], currency: string): string[] =>
    rows.map(r => String(r.currency)).filter(c => toAlphaCurrency(c) === currency);

function toSales(rows: Row[], currency: string): ManagerSales {
    const own = rows.filter(r => toAlphaCurrency(String(r.currency)) === currency);
    const sum = (key: string): number => own.reduce((a, r) => a + num(r[key]), 0);
    const docs = sum('saleDocuments12m');
    return {
        last30: { currentMinor: sum('last30'), previousMinor: sum('prev30') },
        monthToDayVsPrevMonth: { currentMinor: sum('mtd'), previousMinor: sum('prevMonth') },
        monthToDayVsPrevYear: { currentMinor: sum('mtd'), previousMinor: sum('prevYearMonth') },
        yearToDay: { currentMinor: sum('ytd'), previousMinor: sum('prevYtd') },
        averageCheckMinor: docs > 0 ? Math.round(sum('last12') / docs) : null,
        saleDocuments12m: docs,
    };
}

const emptyReceivables = (): ManagerReceivables => ({
    debtMinor: 0,
    overdueMinor: 0,
    aging: { notDueMinor: 0, overdue1to30Minor: 0, overdue31to60Minor: 0, overdueOver60Minor: 0 },
    topDebtors: [],
});
