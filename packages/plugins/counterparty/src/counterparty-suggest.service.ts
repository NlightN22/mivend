import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { applySuggest, clampSuggestLimit, dedupeSuggestions } from 'shared';

import { counterpartySuggestPrefix, counterpartySuggestSpec } from './counterparty-list-query';
import { CounterpartyService } from './counterparty.service';

// Typeahead for the list filter: only values of counterparties the caller's own list can show.
@Injectable()
export class CounterpartySuggestService {
    constructor(private readonly counterparties: CounterpartyService) {}

    async suggest(
        ctx: RequestContext,
        field: string,
        prefix: string,
        limit?: number | null,
    ): Promise<string[]> {
        const spec = counterpartySuggestSpec(field);
        const text = counterpartySuggestPrefix(prefix);
        if (text === null) return [];
        const take = clampSuggestLimit(limit);
        const qb = await this.counterparties.visibleFilteredQb(ctx, {});
        applySuggest(qb, spec, text, take);
        const rows = await qb
            .limit(spec.repeats ? take * 2 : take)
            .getRawMany<{ value: string | null }>();
        return dedupeSuggestions(rows, take);
    }
}
