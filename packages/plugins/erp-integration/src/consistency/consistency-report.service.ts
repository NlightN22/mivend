import { Injectable } from '@nestjs/common';
import { PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { ConsistencyReport } from './consistency-report.entity';
import { ConsistencySourceState } from './consistency-source-state.entity';

export interface ConsistencyReportListOptions {
    take?: number;
    skip?: number;
    source?: string;
    status?: 'open' | 'resolved';
    type?: string;
    severity?: string;
    entityType?: string;
}

export interface ConsistencySourceView extends ConsistencySourceState {
    localOpenByType: Record<string, number>;
    localOpenBySeverity: Record<string, number>;
}

const MAX_TAKE = 100;
const FILTER_COLUMNS = ['source', 'status', 'type', 'severity', 'entityType'] as const;

@Injectable()
export class ConsistencyReportService {
    constructor(private readonly connection: TransactionalConnection) {}

    async list(
        ctx: RequestContext,
        options: ConsistencyReportListOptions = {},
    ): Promise<PaginatedList<ConsistencyReport>> {
        const qb = this.connection
            .getRepository(ctx, ConsistencyReport)
            .createQueryBuilder('report')
            .orderBy('report.lastDetectedAt', 'DESC')
            .addOrderBy('report.id', 'DESC')
            .take(Math.min(options.take ?? 20, MAX_TAKE))
            .skip(options.skip ?? 0);
        for (const column of FILTER_COLUMNS) {
            const value = options[column];
            if (value) qb.andWhere(`report.${column} = :${column}`, { [column]: value });
        }
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async sources(ctx: RequestContext): Promise<ConsistencySourceView[]> {
        const states = await this.connection
            .getRepository(ctx, ConsistencySourceState)
            .find({ order: { source: 'ASC' } });
        const counts = await ctxQuery<
            Array<{ source: string; type: string; severity: string; n: number }>
        >(
            this.connection,
            ctx,
            `SELECT source, type, severity, count(*)::int AS n FROM consistency_report
              WHERE status = 'open' GROUP BY source, type, severity`,
        );
        return states.map(state => {
            const view = state as ConsistencySourceView;
            view.localOpenByType = {};
            view.localOpenBySeverity = {};
            for (const row of counts.filter(c => c.source === state.source)) {
                view.localOpenByType[row.type] = (view.localOpenByType[row.type] ?? 0) + row.n;
                view.localOpenBySeverity[row.severity] =
                    (view.localOpenBySeverity[row.severity] ?? 0) + row.n;
            }
            return view;
        });
    }
}
