import type { SelectQueryBuilder } from 'typeorm';

import { Counterparty } from './entities/counterparty.entity';

export async function summarizeCounterparties(qb: SelectQueryBuilder<Counterparty>): Promise<{
    totalCount: number;
    activeCount: number;
    totalCreditBalance: number;
    highUsageCount: number;
}> {
    // Aggregate-only query, no GROUP BY — baseVisibleQb's ORDER BY shortName would be invalid
    // here (Postgres requires an ORDER BY column to be aggregated or grouped), so clear it.
    const raw = await qb
        .orderBy()
        .select('COUNT(*)', 'totalCount')
        .addSelect('COUNT(*) FILTER (WHERE c.isActive)', 'activeCount')
        .addSelect('COALESCE(SUM(c.creditBalance), 0)', 'totalCreditBalance')
        .addSelect(
            // TypeORM's alias replacement silently skips c.creditBalance::float, so camelCase columns need quotes
            // Without quotes Postgres fails with 42703; mocks don't catch this, integration tests do
            'COUNT(*) FILTER (WHERE c."creditLimit" > 0 AND c."creditBalance"::float / c."creditLimit" >= 0.8)',
            'highUsageCount',
        )
        .getRawOne<{
            totalCount: string;
            activeCount: string;
            totalCreditBalance: string;
            highUsageCount: string;
        }>();
    return {
        totalCount: Number(raw?.totalCount ?? 0),
        activeCount: Number(raw?.activeCount ?? 0),
        totalCreditBalance: Number(raw?.totalCreditBalance ?? 0),
        highUsageCount: Number(raw?.highUsageCount ?? 0),
    };
}

export function selectHighUsage(
    qb: SelectQueryBuilder<Counterparty>,
    limit: number,
): Promise<Counterparty[]> {
    // Quoted column names: TypeORM's alias replacement silently breaks on c.creditBalance::float
    // Unquoted camelCase columns fail in Postgres (42703).
    return qb
        .orderBy()
        .andWhere('c."creditLimit" > 0')
        .andWhere('c."creditBalance"::float / c."creditLimit" >= 0.8')
        .orderBy('c."creditBalance"::float / c."creditLimit"', 'DESC')
        .take(limit)
        .getMany();
}
