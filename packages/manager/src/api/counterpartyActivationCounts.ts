import { adminApi } from './client';
import { CounterpartyActivationCountsDocument } from './generated/graphql';
import {
    activationReadiness,
    toListOptions,
    type ActivationFilterOptions,
} from './counterpartyPortalAccess';

export type ReadinessCounts = Record<ReturnType<typeof activationReadiness> | 'all', number>;

// Counts follow every active filter except readiness itself, so a chip shows what clicking it yields.
export async function fetchReadinessCounts(
    filters: Omit<ActivationFilterOptions, 'readiness'>,
): Promise<ReadinessCounts> {
    const base = { ...toListOptions(filters), take: 0 };
    const result = await adminApi(CounterpartyActivationCountsDocument, {
        all: base,
        ready: { ...base, readiness: 'ready' },
        missing: { ...base, readiness: 'missing-data' },
        inactive: { ...base, readiness: 'erp-inactive' },
        activated: { ...base, readiness: 'activated' },
    });
    return {
        all: result.all.totalItems,
        ready: result.ready.totalItems,
        'missing-data': result.missing.totalItems,
        'erp-inactive': result.inactive.totalItems,
        activated: result.activated.totalItems,
    };
}
