import { adminApi } from './client';
import { CounterpartyOverdueDocument, type CounterpartyOverdueQuery } from './generated/graphql';

export type CounterpartyOverdue = NonNullable<CounterpartyOverdueQuery['counterpartyOverdue']>;

// Null without the credit right or for a counterparty outside the caller's scope.
export async function fetchCounterpartyOverdue(
    counterpartyId: string,
): Promise<CounterpartyOverdue | null> {
    return (await adminApi(CounterpartyOverdueDocument, { counterpartyId })).counterpartyOverdue;
}
