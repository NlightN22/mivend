import { RequestContext, TransactionalConnection } from '@vendure/core';

import { DiscountGrant } from './discount-grant.entity';
import { RULE_PRICE_TYPE_ALLOWED_SQL } from './discount-grant.types';
import { EXPIRING_SOON_DAYS } from './discount-registry.service';

// Same 'active' definition and price type filter as DiscountGrantService.findForCounterparty({ status: 'active' }),
// for many counterparties at once: company-wide grants count for everyone, scoped ones per counterparty.
export async function activeGrantCounts(
    connection: TransactionalConnection,
    ctx: RequestContext,
    counterpartyIds: string[],
    allowedPriceTypeCodes: string[] | undefined,
): Promise<Map<string, number>> {
    const ids = [...new Set(counterpartyIds)];
    const counts = new Map<string, number>(ids.map(id => [id, 0]));
    if (ids.length === 0) return counts;
    const soon = new Date(Date.now() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const repo = connection.getRepository(ctx, DiscountGrant);
    const allowed = {
        allowedPriceTypeCodes: allowedPriceTypeCodes?.length ? allowedPriceTypeCodes : [''],
    };

    const companyWide = repo
        .createQueryBuilder('grant')
        .where('grant.scopeType = :all', { all: 'all' })
        .andWhere('grant.validTo >= :soon', { soon });
    const scoped = repo
        .createQueryBuilder('grant')
        .innerJoin('grant.counterparties', 'counterparty')
        .select('counterparty.id', 'counterpartyId')
        .addSelect('COUNT(grant.id)', 'count')
        .where('grant.scopeType <> :all', { all: 'all' })
        .andWhere('counterparty.id IN (:...ids)', { ids })
        .andWhere('grant.validTo >= :soon', { soon })
        .groupBy('counterparty.id');
    if (allowedPriceTypeCodes) {
        companyWide.andWhere(RULE_PRICE_TYPE_ALLOWED_SQL, allowed);
        scoped.andWhere(RULE_PRICE_TYPE_ALLOWED_SQL, allowed);
    }

    const [wide, rows] = await Promise.all([
        companyWide.getCount(),
        // unbounded-ok: grouped by counterparty id of the ids passed in
        scoped.getRawMany<{ counterpartyId: string | number; count: string }>(),
    ]);
    for (const id of ids) counts.set(id, wide);
    for (const row of rows) {
        const key = String(row.counterpartyId);
        counts.set(key, (counts.get(key) ?? 0) + Number(row.count));
    }
    return counts;
}
