import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { Brackets, type SelectQueryBuilder } from 'typeorm';
import { clampSkip, clampTake, likeTerm, type ListFilter } from 'shared';
import { CustomPermission } from '@mivend/plugin-access-control';

import { CounterpartyService } from '../counterparty.service';
import { ContractPowerOfAttorneyErp } from '../entities/contract-power-of-attorney-erp.entity';
import {
    applyPowerOfAttorneyFilter,
    applyPowerOfAttorneySort,
    STATUS_SQL,
    type PowerOfAttorneyListInput,
} from './power-of-attorney-list-query';
import type {
    PowerOfAttorneyListItem,
    PowerOfAttorneyPage,
    PowerOfAttorneyStatus,
} from './power-of-attorney-list.types';

const MAX_SEARCH_LENGTH = 200;

type Raw = Record<string, unknown>;
const text = (v: unknown): string | null => (v == null ? null : String(v));

// Staff read of the ERP powers of attorney, scoped by the contract's local counterparty;
// rows of a deleted contract are returned only to holders of ReadDeletedContractPowerOfAttorney.
@Injectable()
export class PowerOfAttorneyListService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterparties: CounterpartyService,
    ) {}

    async findVisible(
        ctx: RequestContext,
        input: PowerOfAttorneyListInput = {},
    ): Promise<PowerOfAttorneyPage> {
        const take = clampTake(input.take ?? undefined);
        const qb = await this.baseQuery(ctx, input.search, input.filter);
        const totalItems = await qb.getCount();
        if (take === 0) return { items: [], totalItems };
        applyPowerOfAttorneySort(qb, input.sort);
        const rows = await qb
            .select('"t"."id"', 'id')
            .addSelect('"t"."number"', 'number')
            .addSelect('"t"."holderName"', 'holderName')
            .addSelect('"t"."issueDate"', 'validFrom')
            .addSelect('"t"."validUntil"', 'validUntil')
            .addSelect(STATUS_SQL, 'status')
            .addSelect('"t"."scanId"', 'scanId')
            .addSelect('"t"."isDeleted"', 'contractDeleted')
            .addSelect('"ct"."id"', 'contractId')
            .addSelect('"ct"."name"', 'contractName')
            .addSelect('"cp"."id"', 'counterpartyId')
            .addSelect('"cp"."shortName"', 'counterpartyName')
            .offset(clampSkip(input.skip ?? undefined))
            .limit(take)
            .getRawMany<Raw>();
        return { items: rows.map(toItem), totalItems };
    }

    async countForCounterparty(ctx: RequestContext, counterpartyId: string): Promise<number> {
        const qb = await this.baseQuery(ctx, null, { counterpartyId: { eq: counterpartyId } });
        return qb.getCount();
    }

    private async baseQuery(
        ctx: RequestContext,
        search: string | null | undefined,
        filter: ListFilter | null | undefined,
    ): Promise<SelectQueryBuilder<object>> {
        const qb: SelectQueryBuilder<object> = this.connection
            .getRepository(ctx, ContractPowerOfAttorneyErp)
            .createQueryBuilder('t')
            .leftJoin('contract', 'ct', '"ct"."erpId" = "t"."contractId"')
            .leftJoin('counterparty', 'cp', 'CAST("cp"."id" AS text) = "ct"."counterpartyId"');
        if (
            !ctx.userHasPermissions([
                CustomPermission.ReadDeletedContractPowerOfAttorney.Permission,
            ])
        ) {
            qb.where('NOT "t"."isDeleted"');
        }
        const visible = await this.counterparties.visibleIdsSql(ctx);
        if (visible) qb.andWhere(`"ct"."counterpartyId" IN (${visible.sql})`, visible.params);
        const term = search?.trim();
        if (term) {
            if (term.length > MAX_SEARCH_LENGTH) {
                throw new UserInputError(`Search is limited to ${MAX_SEARCH_LENGTH} characters`);
            }
            qb.andWhere(
                new Brackets(b => {
                    b.where('"t"."number" ILIKE :poaTerm')
                        .orWhere('"t"."holderName" ILIKE :poaTerm')
                        .orWhere('"cp"."shortName" ILIKE :poaTerm')
                        .orWhere('"cp"."legalName" ILIKE :poaTerm')
                        .orWhere('"cp"."inn" ILIKE :poaTerm');
                }),
                { poaTerm: likeTerm(term) },
            );
        }
        applyPowerOfAttorneyFilter(qb, filter);
        return qb;
    }
}

export function toItem(r: Raw): PowerOfAttorneyListItem {
    const date = (v: unknown): Date | null => (v == null ? null : new Date(v as string));
    return {
        id: String(r.id),
        number: String(r.number),
        holderName: String(r.holderName),
        validFrom: date(r.validFrom),
        validUntil: date(r.validUntil),
        status: r.status as PowerOfAttorneyStatus,
        scanId: text(r.scanId),
        hasScan: r.scanId != null,
        contractId: text(r.contractId),
        contractName: text(r.contractName),
        counterpartyId: text(r.counterpartyId),
        counterpartyName: text(r.counterpartyName),
        contractDeleted: r.contractDeleted === true,
    };
}
