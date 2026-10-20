import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';

import { Counterparty } from '../entities/counterparty.entity';

const MAX_TAKE = 100;

// Counterparties no branch rule resolved (#65): invisible to branch-scoped roles until sorted out.
@Injectable()
export class UnsortedCounterpartyService {
    constructor(private connection: TransactionalConnection) {}

    async findPage(
        ctx: RequestContext,
        options?: { take?: number; skip?: number; search?: string },
    ): Promise<PaginatedList<Counterparty>> {
        const qb = this.connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .where('c.branchId IS NULL')
            .andWhere('c.isActive = true');
        if (options?.search?.trim()) {
            qb.andWhere(
                '(c.shortName ILIKE :term OR c.legalName ILIKE :term OR c.inn ILIKE :term)',
                { term: `%${options.search.trim()}%` },
            );
        }
        const [items, totalItems] = await qb
            .orderBy('c.shortName', 'ASC')
            .addOrderBy('c.id', 'ASC')
            .take(Math.min(options?.take ?? 25, MAX_TAKE))
            .skip(options?.skip ?? 0)
            .getManyAndCount();
        return { items, totalItems };
    }
}
