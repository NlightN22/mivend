import { adminApi } from './client';
import { CounterpartyMetricsDocument, type CounterpartyMetricsQuery } from './generated/graphql';

export type CounterpartyMetrics = NonNullable<CounterpartyMetricsQuery['counterpartyMetrics']>;
export type ContractBalance = CounterpartyMetrics['contractBalances'][number];

// Null without the credit right or for a counterparty outside the caller's scope.
export async function fetchCounterpartyMetrics(
    counterpartyId: string,
): Promise<CounterpartyMetrics | null> {
    return (await adminApi(CounterpartyMetricsDocument, { counterpartyId })).counterpartyMetrics;
}
