import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { CtxLoader, ctxQuery } from 'shared';
import { In, Not } from 'typeorm';

import { loadPortalReadiness, type PortalReadiness } from './counterparty-readiness-filter';
import { ContactPointService, type ChosenContact } from './contact-point.service';
import { applyCounterpartyVisibilityScope } from './counterparty-visibility';
import { Counterparty } from './entities/counterparty.entity';
import { TradingPoint } from './entities/trading-point.entity';

const isRowId = (key: string): boolean => /^\d+$/.test(key);

// Per-request batches for the nested Counterparty/Customer fields that list rows resolve one by one.
@Injectable()
export class CounterpartyBatchLoaders {
    private hidden = new CtxLoader<boolean>((ctx, keys) => this.loadHidden(ctx, keys));
    private points = new CtxLoader<TradingPoint[]>((ctx, keys) => this.loadPoints(ctx, keys));
    private byCustomer = new CtxLoader<Counterparty | null>((ctx, keys) =>
        this.loadByCustomer(ctx, keys),
    );

    private readiness = new CtxLoader<PortalReadiness>(async (ctx, keys) => {
        const found = await loadPortalReadiness(this.connection, ctx, keys.filter(isRowId));
        return keys.map(key => found.get(key) ?? 'missing-data');
    });

    private chosen = new CtxLoader<ChosenContact>(async (ctx, keys) => {
        const found = await this.contactPoints.chosenContacts(ctx, keys.filter(isRowId));
        return keys.map(key => found.get(key) ?? { email: null, phone: null });
    });

    constructor(
        private connection: TransactionalConnection,
        private accessScopeService: AccessScopeService,
        private contactPoints: ContactPointService,
    ) {}

    chosenContact(ctx: RequestContext, counterpartyId: string | number): Promise<ChosenContact> {
        if (!isRowId(String(counterpartyId))) return Promise.resolve({ email: null, phone: null });
        return this.chosen.load(ctx, counterpartyId);
    }

    portalReadiness(
        ctx: RequestContext,
        counterpartyId: string | number,
    ): Promise<PortalReadiness> {
        return this.readiness.load(ctx, counterpartyId);
    }

    isHidden(ctx: RequestContext, counterpartyId: string | number): Promise<boolean> {
        return this.hidden.load(ctx, counterpartyId);
    }

    tradingPoints(ctx: RequestContext, counterpartyId: string | number): Promise<TradingPoint[]> {
        return this.points.load(ctx, counterpartyId);
    }

    forCustomer(ctx: RequestContext, customerId: string | number): Promise<Counterparty | null> {
        return this.byCustomer.load(ctx, customerId);
    }

    private async loadHidden(ctx: RequestContext, keys: readonly string[]): Promise<boolean[]> {
        const qb = this.connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .select('c.id')
            .where('c.id IN (:...ids)', { ids: keys });
        const visible = await applyCounterpartyVisibilityScope(this.accessScopeService, ctx, qb);
        // unbounded-ok: visible subset of the counterparty ids passed in, ids only
        const seen = new Set((await visible.getMany()).map(row => String(row.id)));
        return keys.map(key => !seen.has(key));
    }

    private async loadPoints(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<TradingPoint[][]> {
        // unbounded-ok: trading points of the counterparties passed in, bounded by that list
        const rows = await this.connection.getRepository(ctx, TradingPoint).find({
            where: {
                counterpartyId: In([...keys]),
                ...(ctx.apiType === 'admin' ? {} : { isActive: true, address: Not('') }),
            },
            relations: ['contacts'],
            order: { name: 'ASC' },
        });
        return keys.map(key => rows.filter(row => String(row.counterpartyId) === key));
    }

    private async loadByCustomer(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<Counterparty | null>> {
        const rows = await ctxQuery<Array<Counterparty & { customerId: string }>>(
            this.connection,
            ctx,
            `SELECT c.*, cu.id AS "customerId" FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = ANY($1::int[])`,
            [keys.map(Number)],
        );
        const byId = new Map<string, Counterparty>();
        for (const { customerId, ...counterparty } of rows) {
            if (!byId.has(String(customerId)))
                byId.set(String(customerId), counterparty as Counterparty);
        }
        return keys.map(key => byId.get(key) ?? null);
    }
}
