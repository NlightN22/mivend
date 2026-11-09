import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import {
    applyCounterpartyFilterParameter,
    type CounterpartyFilterParameter,
} from './counterparty-filter-engine';
import type { CounterpartyService } from './counterparty.service';

const MATCHING_KEYS = ['search', 'readiness', 'filter'];

// The same three inputs the activation list sends; each is validated by the list's own whitelists.
export interface CounterpartyMatching {
    search?: string;
    readiness?: string;
    filter?: CounterpartyFilterParameter;
}

export function parseCounterpartyMatching(raw: Record<string, unknown>): CounterpartyMatching {
    const unknown = Object.keys(raw).filter(k => !MATCHING_KEYS.includes(k));
    if (unknown.length) throw new UserInputError(`Unknown selection field: ${unknown[0]}`);
    const { search, readiness, filter } = raw;
    if (search != null && (typeof search !== 'string' || search.length > 200)) {
        throw new UserInputError('Invalid search');
    }
    if (readiness != null && typeof readiness !== 'string') {
        throw new UserInputError('Invalid readiness');
    }
    if (filter != null && (typeof filter !== 'object' || Array.isArray(filter))) {
        throw new UserInputError('Invalid filter');
    }
    return {
        search: (search as string | undefined) || undefined,
        readiness: (readiness as string | undefined) || undefined,
        filter: (filter as CounterpartyFilterParameter | undefined) ?? undefined,
    };
}

// Visible counterparties (scope applied first) that the list filter matches, ids ascending, at most `limit`.
export async function resolveCounterpartyIds(
    service: CounterpartyService,
    ctx: RequestContext,
    matching: CounterpartyMatching,
    limit: number,
): Promise<string[]> {
    const qb = await service.visibleFilteredQb(ctx, {
        search: matching.search,
        readiness: matching.readiness,
    });
    applyCounterpartyFilterParameter(qb, matching.filter);
    const rows = await qb
        .select('c.id', 'id')
        .orderBy('c.id', 'ASC')
        .limit(limit)
        .getRawMany<{ id: number | string }>();
    return rows.map(r => String(r.id));
}
