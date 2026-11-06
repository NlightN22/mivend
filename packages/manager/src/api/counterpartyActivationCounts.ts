import { adminApi } from './client';
import {
    activationReadiness,
    toListOptions,
    type ActivationFilterOptions,
} from './counterpartyPortalAccess';

export type ReadinessCounts = Record<ReturnType<typeof activationReadiness> | 'all', number>;

const COUNTS_QUERY = /* GraphQL */ `
    query CounterpartyActivationCounts(
        $all: CounterpartyListOptions
        $ready: CounterpartyListOptions
        $missing: CounterpartyListOptions
        $inactive: CounterpartyListOptions
        $activated: CounterpartyListOptions
    ) {
        all: counterparties(options: $all) {
            totalItems
        }
        ready: counterparties(options: $ready) {
            totalItems
        }
        missing: counterparties(options: $missing) {
            totalItems
        }
        inactive: counterparties(options: $inactive) {
            totalItems
        }
        activated: counterparties(options: $activated) {
            totalItems
        }
    }
`;

type CountsResult = Record<string, { totalItems: number }>;

// Counts follow every active filter except readiness itself, so a chip shows what clicking it yields.
export async function fetchReadinessCounts(
    filters: Omit<ActivationFilterOptions, 'readiness'>,
): Promise<ReadinessCounts> {
    const base = { ...toListOptions(filters), take: 0 };
    const result = await adminApi<CountsResult>(COUNTS_QUERY, {
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
