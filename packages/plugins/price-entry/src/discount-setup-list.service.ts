import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { clampSkip, clampTake, ctxQuery } from 'shared';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';

import type { SelectQueryBuilder } from 'typeorm';

import {
    DiscountSetup,
    DiscountSetupProduct,
    DiscountSetupRecipient,
} from './discount-setup.entity';
import { scopedSetups, withStatus, type SetupScope } from './discount-setup-list.query';
import {
    DISCOUNT_SETUP_STATUSES,
    STATUS_SQL,
    computeSetupStatus,
    setupOrderBy,
    type DiscountSetupCounterparty,
    type DiscountSetupCounts,
    type DiscountSetupListOptions,
    type DiscountSetupRow,
    type DiscountSetupStatus,
} from './discount-setup-list.types';

const MAX_RECIPIENTS_PER_SETUP = 20;

interface RawSetup {
    id: number;
    documentNumber: string;
    percent: number;
    validFrom: Date;
    validTo: Date | null;
    active: boolean;
    inactiveReason: string | null;
    allProducts: boolean;
    productMode: string;
    priceTypeCode: string | null;
    recipientCount: string;
}

interface RawRecipient {
    setupId: number;
    counterpartyErpId: string;
    contractErpId: string;
    counterpartyId: number | null;
    name: string | null;
}

@Injectable()
export class DiscountSetupListService {
    constructor(
        private connection: TransactionalConnection,
        private counterparties: CounterpartyService,
        private priceTypeAccess: PriceTypeAccessService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        options: DiscountSetupListOptions = {},
    ): Promise<PaginatedList<DiscountSetupRow>> {
        const status = DISCOUNT_SETUP_STATUSES.find(s => s === options.status) ?? null;
        const scope = await this.scope(ctx, {
            counterpartyId: options.counterpartyId,
            search: options.search,
        });
        const base = withStatus(scopedSetups(this.setups(ctx), scope), status);
        const totalItems = await base.clone().getCount();
        const take = clampTake(options.take ?? undefined);
        if (take === 0 || totalItems === 0) return { items: [], totalItems };

        const page = base
            .clone()
            .select([
                's."id" AS "id"',
                's."documentNumber" AS "documentNumber"',
                's."percent" AS "percent"',
                's."validFrom" AS "validFrom"',
                's."validTo" AS "validTo"',
                's."active" AS "active"',
                's."inactiveReason" AS "inactiveReason"',
                's."allProducts" AS "allProducts"',
                's."productMode" AS "productMode"',
            ])
            .addSelect(
                `(SELECT pt."code" FROM price_type pt WHERE pt."externalId" = s."priceTypeErpId")`,
                'priceTypeCode',
            )
            .addSelect(
                `(SELECT COUNT(DISTINCT r."counterpartyErpId") FROM discount_setup_recipient r
                  WHERE r."setupId" = s."id" AND r."counterpartyErpId" <> '')`,
                'recipientCount',
            );
        setupOrderBy(options.sort).forEach(([sql, dir], i) =>
            i === 0 ? page.orderBy(sql, dir) : page.addOrderBy(sql, dir),
        );
        const raws = await page
            .offset(clampSkip(options.skip ?? undefined))
            .limit(take)
            .getRawMany<RawSetup>();

        const ids = raws.map(r => r.id);
        const listIds = raws.filter(r => !r.allProducts && r.productMode === 'list').map(r => r.id);
        const [productCounts, recipients] = await Promise.all([
            this.productCounts(ctx, listIds),
            this.recipients(ctx, ids, scope),
        ]);
        const items = raws.map(r => ({
            id: String(r.id),
            documentNumber: r.documentNumber,
            percent: Number(r.percent),
            validFrom: r.validFrom,
            validTo: r.validTo,
            status: computeSetupStatus(r, scope.now),
            inactiveReason: r.inactiveReason,
            priceTypeCode: r.priceTypeCode,
            allProducts: r.allProducts,
            productMode: r.productMode,
            productCount: productCounts.get(r.id) ?? 0,
            counterparties: recipients.get(r.id) ?? [],
            recipientCount: Number(r.recipientCount),
        }));
        return { items, totalItems };
    }

    async counts(ctx: RequestContext, counterpartyId?: ID | null): Promise<DiscountSetupCounts> {
        const scope = await this.scope(ctx, { counterpartyId: counterpartyId?.toString() });
        const filter = (s: DiscountSetupStatus): string =>
            `COUNT(*) FILTER (WHERE ${STATUS_SQL[s]})`;
        const row = await scopedSetups(this.setups(ctx), scope)
            .select('COUNT(*)', 'all')
            .addSelect(filter('running'), 'running')
            .addSelect(filter('expiring-soon'), 'expiringSoon')
            .addSelect(filter('upcoming'), 'upcoming')
            .addSelect(filter('expired'), 'expired')
            .addSelect(filter('inactive'), 'inactive')
            .getRawOne<Record<keyof DiscountSetupCounts, string>>();
        return {
            all: Number(row?.all ?? 0),
            running: Number(row?.running ?? 0),
            expiringSoon: Number(row?.expiringSoon ?? 0),
            upcoming: Number(row?.upcoming ?? 0),
            expired: Number(row?.expired ?? 0),
            inactive: Number(row?.inactive ?? 0),
        };
    }

    private setups(ctx: RequestContext): SelectQueryBuilder<DiscountSetup> {
        return this.connection.getRepository(ctx, DiscountSetup).createQueryBuilder('s');
    }

    private async scope(
        ctx: RequestContext,
        extra: Pick<SetupScope, 'counterpartyId' | 'search'>,
    ): Promise<SetupScope> {
        return {
            ...extra,
            now: new Date(),
            visible: await this.counterparties.visibleErpIdsSql(ctx),
            allowedPriceTypeCodes: await this.priceTypeAccess.allowedCodes(ctx),
        };
    }

    private async productCounts(ctx: RequestContext, ids: number[]): Promise<Map<number, number>> {
        if (ids.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, DiscountSetupProduct)
            .createQueryBuilder('p')
            .select('p."setupId"', 'setupId')
            .addSelect('COUNT(*)', 'count')
            .where('p."setupId" IN (:...ids)', { ids })
            .groupBy('p."setupId"')
            // unbounded-ok: grouped by the page's setup ids
            .getRawMany<{ setupId: number; count: string }>();
        return new Map(rows.map(r => [r.setupId, Number(r.count)]));
    }

    // Only recipients inside the caller's scope: a name outside it is never read.
    private async recipients(
        ctx: RequestContext,
        ids: number[],
        scope: SetupScope,
    ): Promise<Map<number, DiscountSetupCounterparty[]>> {
        const result = new Map<number, DiscountSetupCounterparty[]>();
        if (ids.length === 0) return result;
        const name = `COALESCE(NULLIF(cp."shortName", ''), NULLIF(cp."legalName", ''), r."counterpartyErpId")`;
        const inner = this.connection
            .getRepository(ctx, DiscountSetupRecipient)
            .createQueryBuilder('r')
            .leftJoin('counterparty', 'cp', 'cp."erpId" = r."counterpartyErpId"')
            .select('r."setupId"', 'setupId')
            .addSelect('r."counterpartyErpId"', 'counterpartyErpId')
            .addSelect('r."contractErpId"', 'contractErpId')
            .addSelect('cp."id"', 'counterpartyId')
            .addSelect(name, 'name')
            .addSelect(
                `ROW_NUMBER() OVER (PARTITION BY r."setupId" ORDER BY ${name}, r."contractErpId")`,
                'rn',
            )
            .where('r."setupId" IN (:...ids)', { ids })
            .andWhere(`r."counterpartyErpId" <> ''`);
        if (scope.visible) {
            inner.andWhere(`r."counterpartyErpId" IN (${scope.visible.sql})`, scope.visible.params);
        }
        const [sql, params] = inner.getQueryAndParameters();
        const rows = await ctxQuery<RawRecipient[]>(
            this.connection,
            ctx,
            `SELECT * FROM (${sql}) x WHERE x."rn" <= $${params.length + 1}
             ORDER BY x."setupId", x."rn" LIMIT $${params.length + 2}`,
            [...params, MAX_RECIPIENTS_PER_SETUP, MAX_RECIPIENTS_PER_SETUP * ids.length],
        );
        for (const r of rows) {
            const list = result.get(r.setupId) ?? [];
            list.push({
                id: r.counterpartyId === null ? null : String(r.counterpartyId),
                name: r.name ?? r.counterpartyErpId,
                contractErpId: r.contractErpId || null,
            });
            result.set(r.setupId, list);
        }
        return result;
    }
}
