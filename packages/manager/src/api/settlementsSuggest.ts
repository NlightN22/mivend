import { adminApi } from './client';
import { SettlementFilterSuggestionsDocument } from './generated/graphql';

export type SettlementSuggestField = 'customer' | 'number';

// The server answers only from documents the caller may list; abort drops the stale keystroke's request.
export function settlementSuggest(
    field: SettlementSuggestField,
): (prefix: string, signal: AbortSignal) => Promise<string[]> {
    return async (prefix, signal) => {
        const data = await adminApi(
            SettlementFilterSuggestionsDocument,
            { field, prefix },
            { signal },
        );
        return data.settlementFilterSuggestions;
    };
}
