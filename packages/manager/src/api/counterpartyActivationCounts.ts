import { adminApi } from './client';
import { CounterpartyActivationCountsDocument } from './generated/graphql';
import type { CounterpartyFilterParameter } from './generated/graphql';
import type { Readiness } from '../components/bulk-operations/activationReadiness';

export type ReadinessCounts = Record<Readiness | 'all', number>;

export interface ReadinessCountBase {
    search?: string;
    filter?: CounterpartyFilterParameter;
}

// Counts follow the search and the builder conditions, not the chip itself, so a chip shows what clicking it yields.
export async function fetchReadinessCounts(filters: ReadinessCountBase): Promise<ReadinessCounts> {
    const base = { search: filters.search || undefined, filter: filters.filter, take: 0 };
    const result = await adminApi(CounterpartyActivationCountsDocument, {
        all: base,
        ready: { ...base, readiness: 'ready' },
        missing: { ...base, readiness: 'missing-data' },
        duplicate: { ...base, readiness: 'inn-duplicate' },
        inactive: { ...base, readiness: 'erp-inactive' },
        activated: { ...base, readiness: 'activated' },
    });
    return {
        all: result.all.totalItems,
        ready: result.ready.totalItems,
        'missing-data': result.missing.totalItems,
        'inn-duplicate': result.duplicate.totalItems,
        'erp-inactive': result.inactive.totalItems,
        activated: result.activated.totalItems,
    };
}
