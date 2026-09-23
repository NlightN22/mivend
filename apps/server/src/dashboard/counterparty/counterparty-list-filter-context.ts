import { createContext, MutableRefObject, useContext } from 'react';

import type { CounterpartyListFilterInput } from './counterparty-list-variables.js';

// ListPage's own context exposes only refetch, so the page shares its last-sent filter itself.
export const CounterpartyListFilterContext =
    createContext<MutableRefObject<CounterpartyListFilterInput> | null>(null);

export function useCounterpartyListFilter(): CounterpartyListFilterInput {
    return useContext(CounterpartyListFilterContext)?.current ?? {};
}
