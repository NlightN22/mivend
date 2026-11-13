import { adminApi } from './client';
import { CustomerFilterSuggestionsDocument } from './generated/graphql';

export type CustomerSuggestField = 'shortName' | 'inn';

// The server answers only from counterparties the caller may list; abort drops the stale keystroke's request.
export function customerSuggest(
    field: CustomerSuggestField,
): (prefix: string, signal: AbortSignal) => Promise<string[]> {
    return async (prefix, signal) => {
        const data = await adminApi(
            CustomerFilterSuggestionsDocument,
            { field, prefix },
            { signal },
        );
        return data.counterpartyFilterSuggestions;
    };
}
