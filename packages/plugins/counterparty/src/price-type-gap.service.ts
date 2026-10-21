import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';

import { CounterpartyService } from './counterparty.service';
import { Contract } from './entities/contract.entity';

const MAX_TAKE = 100;

export const PORTAL_COUNTERPARTY_SQL = `EXISTS (SELECT 1 FROM customer cu WHERE cu."customFieldsCounterpartyid"::text = c.id::text)`;

export const UNRESOLVED_PRICE_TYPE_SQL = `NOT EXISTS (SELECT 1 FROM contract mco
    JOIN price_type mpt ON mpt."externalId" = mco."priceTypeId" AND mpt."isActive" = true
    WHERE mco."erpId" = c."mainContractId" AND mco."isActive" = true)`;

export type PriceTypeGapReason =
    | 'no-main-contract'
    | 'contract-not-found'
    | 'contract-inactive'
    | 'price-type-not-synced';

export interface PriceTypeGapRow {
    id: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    mainContractId: string | null;
    reason: PriceTypeGapReason;
}

// Mirrors mainContractPriceTypeIdSql: a portal counterparty whose main contract chain does not end at an active PriceType.
@Injectable()
export class PriceTypeGapService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
    ) {}

    async findPage(
        ctx: RequestContext,
        options?: { take?: number; skip?: number; search?: string },
    ): Promise<PaginatedList<PriceTypeGapRow>> {
        const qb = await this.counterpartyService.visibleFilteredQb(ctx, {});
        qb.andWhere('c.isActive = true')
            .andWhere(PORTAL_COUNTERPARTY_SQL)
            .andWhere(UNRESOLVED_PRICE_TYPE_SQL);
        if (options?.search?.trim()) {
            qb.andWhere(
                '(c.shortName ILIKE :term OR c.legalName ILIKE :term OR c.inn ILIKE :term)',
                { term: `%${options.search.trim().replace(/[\\%_]/g, '\\$&')}%` },
            );
        }
        const [counterparties, totalItems] = await qb
            .orderBy('c.shortName', 'ASC')
            .addOrderBy('c.id', 'ASC')
            .take(Math.min(Math.max(options?.take ?? 25, 1), MAX_TAKE))
            .skip(Math.max(options?.skip ?? 0, 0))
            .getManyAndCount();

        const contractIds = counterparties.flatMap(c =>
            c.mainContractId ? [c.mainContractId] : [],
        );
        const contracts = contractIds.length
            ? await this.connection
                  .getRepository(ctx, Contract)
                  .createQueryBuilder('k')
                  .where('k.erpId IN (:...contractIds)', { contractIds })
                  .getMany()
            : [];
        const contractByErpId = new Map(contracts.map(k => [k.erpId, k]));

        const items = counterparties.map(c => ({
            id: String(c.id),
            shortName: c.shortName,
            legalName: c.legalName,
            inn: c.inn,
            mainContractId: c.mainContractId,
            reason: priceTypeGapReason(c.mainContractId, contractByErpId),
        }));
        return { items, totalItems };
    }
}

export function priceTypeGapReason(
    mainContractId: string | null,
    contractByErpId: Map<string, Pick<Contract, 'isActive'>>,
): PriceTypeGapReason {
    if (!mainContractId) return 'no-main-contract';
    const contract = contractByErpId.get(mainContractId);
    if (!contract) return 'contract-not-found';
    return contract.isActive ? 'price-type-not-synced' : 'contract-inactive';
}
