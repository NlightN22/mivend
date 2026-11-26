import { Injectable } from '@nestjs/common';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import { Contract, CounterpartyService, TradingPoint } from '@mivend/plugin-counterparty';
import { In } from 'typeorm';

import { OrderAnalyticsScopeService } from './order-analytics-scope.service';

export const ENTITY_FILTER_KINDS = [
    'CUSTOMER',
    'ORGANIZATION',
    'CONTRACT',
    'POINT_OF_SALE',
    'MANAGER',
    'COUNTERPARTY_MANAGER',
    'PRODUCT',
    'MANUFACTURER',
] as const;
export type EntityFilterKind = (typeof ENTITY_FILTER_KINDS)[number];

export interface NamedEntity {
    erpId: string;
    name: string;
}

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, m => `\\${m}`);

// Finds the entities a manager typed a name for, inside what the viewer may see; the analytics service only ever gets ERP ids.
@Injectable()
export class OrderAnalyticsEntityNamesService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
        private readonly scope: OrderAnalyticsScopeService,
    ) {}

    async find(
        ctx: RequestContext,
        kind: EntityFilterKind,
        text: string,
        limit: number,
        exact = false,
    ): Promise<NamedEntity[]> {
        const escaped = escapeLike(text.trim());
        const like = exact ? escaped : `%${escaped}%`;
        switch (kind) {
            case 'CUSTOMER':
                return this.customers(ctx, like, limit);
            case 'CONTRACT':
                return this.contracts(ctx, like, limit);
            case 'POINT_OF_SALE':
                return this.pointsOfSale(ctx, like, limit);
            case 'MANAGER':
            case 'COUNTERPARTY_MANAGER':
                return this.managers(ctx, like, limit);
            case 'ORGANIZATION':
                return this.byName(
                    ctx,
                    'OrganizationRequisites',
                    'legalName',
                    'erpId',
                    like,
                    limit,
                );
            case 'MANUFACTURER':
                return this.byName(ctx, 'Manufacturer', 'name', 'externalId', like, limit);
            case 'PRODUCT':
                return this.products(ctx, like, limit);
        }
    }

    private async customers(
        ctx: RequestContext,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const qb = await this.counterparties.visibleFilteredQb(ctx, {});
        const rows = await qb
            .andWhere(
                "(c.shortName ILIKE :like ESCAPE '\\' OR c.legalName ILIKE :like ESCAPE '\\')",
                { like },
            )
            .andWhere("c.erpId IS NOT NULL AND c.erpId <> ''")
            .orderBy('c.shortName', 'ASC')
            .take(limit)
            .getMany();
        return rows.map(c => ({ erpId: c.erpId as string, name: c.shortName || c.legalName }));
    }

    private async pointsOfSale(
        ctx: RequestContext,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const qb = this.connection
            .getRepository(ctx, TradingPoint)
            .createQueryBuilder('t')
            .where("t.name ILIKE :like ESCAPE '\\'", { like });
        const visible = await this.counterparties.visibleIdsSql(ctx);
        if (visible) qb.andWhere(`t.counterpartyId IN (${visible.sql})`, visible.params);
        const rows = await qb.orderBy('t.name', 'ASC').take(limit).getMany();
        return rows.map(t => ({ erpId: t.erpId, name: t.name }));
    }

    private async contracts(
        ctx: RequestContext,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const qb = this.connection
            .getRepository(ctx, Contract)
            .createQueryBuilder('k')
            .where("k.name ILIKE :like ESCAPE '\\'", { like });
        const visible = await this.counterparties.visibleIdsSql(ctx);
        if (visible) qb.andWhere(`k.counterpartyId IN (${visible.sql})`, visible.params);
        const rows = await qb.orderBy('k.name', 'ASC').take(limit).getMany();
        return rows.map(k => ({ erpId: k.erpId, name: k.name as string }));
    }

    private async managers(
        ctx: RequestContext,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const visible = await this.scope.visibleManagerErpIds(ctx);
        if (visible && visible.length === 0) return [];
        const qb = this.connection
            .getRepository(ctx, 'ErpUser')
            .createQueryBuilder('u')
            .where("u.fullName ILIKE :like ESCAPE '\\'", { like });
        if (visible) qb.andWhere({ erpId: In(visible) });
        const rows = (await qb.orderBy('u.fullName', 'ASC').take(limit).getMany()) as Array<
            Record<string, string>
        >;
        return rows.map(u => ({ erpId: u.erpId, name: u.fullName }));
    }

    private async products(
        ctx: RequestContext,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const rows = await this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('p')
            .innerJoinAndSelect('p.translations', 't')
            .where('p.deletedAt IS NULL')
            .andWhere("t.name ILIKE :like ESCAPE '\\'", { like })
            .andWhere("p.customFields.externalId IS NOT NULL AND p.customFields.externalId <> ''")
            .orderBy('t.name', 'ASC')
            .take(limit)
            .getMany();
        return rows.map(p => ({
            erpId: (p.customFields as { externalId?: string }).externalId as string,
            name: p.translations[0]?.name ?? '',
        }));
    }

    private async byName(
        ctx: RequestContext,
        entity: string,
        nameField: string,
        idField: string,
        like: string,
        limit: number,
    ): Promise<NamedEntity[]> {
        const rows = (await this.connection
            .getRepository(ctx, entity as never)
            .createQueryBuilder('e')
            .where(`e.${nameField} ILIKE :like ESCAPE '\\'`, { like })
            .orderBy(`e.${nameField}`, 'ASC')
            .take(limit)
            .getMany()) as unknown as Array<Record<string, string | null>>;
        return rows
            .filter(r => r[idField] && r[nameField])
            .map(r => ({ erpId: r[idField] as string, name: r[nameField] as string }));
    }
}
