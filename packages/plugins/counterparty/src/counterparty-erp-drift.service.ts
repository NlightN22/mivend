import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { getPageAndCount } from 'shared';

import { Counterparty } from './entities/counterparty.entity';
import { PORTAL_OWNED_COLUMNS } from './counterparty-ownership';

interface PageOptions {
    take?: number;
    skip?: number;
}

// Mirror column behind each portal-owned Counterparty column that has one; the two names differ for the display name only.
const MIRROR_COLUMN: Partial<Record<(typeof PORTAL_OWNED_COLUMNS)[number], string>> = {
    shortName: 'name',
    fullName: 'fullName',
    inn: 'inn',
    kpp: 'kpp',
    ogrnip: 'ogrnip',
    okpo: 'okpo',
    legalType: 'legalType',
    legalFormId: 'legalFormId',
    regionId: 'regionId',
    legalAddress: 'legalAddress',
    factualAddress: 'factualAddress',
    phone: 'phone',
    officialEmail: 'officialEmail',
    erpGroupLabel: 'erpGroupLabel',
};

const OWNER_ERP_ID = `(SELECT u."erpId" FROM erp_user u WHERE u."administratorId" = c."assignedManagerId")`;

const DIFFERS = [
    ...PORTAL_OWNED_COLUMNS.filter(column => MIRROR_COLUMN[column]).map(
        column => `c."${column}" IS DISTINCT FROM m."${MIRROR_COLUMN[column]}"`,
    ),
    `${OWNER_ERP_ID} IS DISTINCT FROM m."managerId"`,
].join(' OR ');

// Unscoped system reports for the ERP drift check (ManageErpIntegration at the resolver).
@Injectable()
export class CounterpartyErpDriftService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Records whose portal-owned fields have moved away from what the ERP last sent: the expected result of a person's edit.
    listDifferingFromErp(
        ctx: RequestContext,
        options: PageOptions = {},
    ): Promise<{ items: Counterparty[]; totalItems: number }> {
        return this.page(
            this.base(ctx)
                .innerJoin('counterparty_erp', 'm', 'm."erpId" = c."erpId"')
                .where(DIFFERS),
            options,
        );
    }

    // Edited here and not yet echoed back: no mirror row, or the mirror still differs from the record.
    listNotConfirmedByErp(
        ctx: RequestContext,
        options: PageOptions = {},
    ): Promise<{ items: Counterparty[]; totalItems: number }> {
        return this.page(
            this.base(ctx)
                .leftJoin('counterparty_erp', 'm', 'm."erpId" = c."erpId"')
                .where(`c.version > 0 AND (m.id IS NULL OR ${DIFFERS})`),
            options,
        );
    }

    // Owner or team member whose Administrator has no ERP user link: left out of the message to the ERP.
    listWithUnlinkedManagers(
        ctx: RequestContext,
        options: PageOptions = {},
    ): Promise<{ items: Counterparty[]; totalItems: number }> {
        const unlinked = (admin: string): string =>
            `NOT EXISTS (SELECT 1 FROM erp_user u WHERE u."administratorId" = ${admin})`;
        return this.page(
            this.base(ctx).where(
                `(c."assignedManagerId" IS NOT NULL AND ${unlinked('c."assignedManagerId"')})
                 OR EXISTS (SELECT 1 FROM counterparty_team_member t
                             WHERE t."counterpartyId" = c.id::text AND ${unlinked('t."administratorId"')})`,
            ),
            options,
        );
    }

    private base(ctx: RequestContext): SelectQueryBuilder<Counterparty> {
        return this.connection.getRepository(ctx, Counterparty).createQueryBuilder('c');
    }

    private page(
        qb: SelectQueryBuilder<Counterparty>,
        options: PageOptions,
    ): Promise<{ items: Counterparty[]; totalItems: number }> {
        return getPageAndCount(
            qb.orderBy('c.id', 'ASC'),
            Math.min(options.take ?? 50, 200),
            options.skip ?? 0,
        );
    }
}
