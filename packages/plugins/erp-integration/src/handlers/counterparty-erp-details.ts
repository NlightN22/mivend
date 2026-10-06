import type { CounterpartyErpDetails } from '@mivend/plugin-counterparty';

const KEYS: readonly (keyof CounterpartyErpDetails)[] = [
    'mainContractId',
    'fullName',
    'mainBankAccountId',
    'ogrnip',
    'kpp',
    'okpo',
    'legalType',
    'regionId',
    'legalFormId',
];

// Omitted key = not sent: the stored value is kept, same as the other optional scalars.
export function optionalErpDetails(payload: Record<string, unknown>): CounterpartyErpDetails {
    const result: CounterpartyErpDetails = {};
    for (const key of KEYS) {
        if (key in payload) result[key] = (payload[key] as string | null) ?? null;
    }
    return result;
}
