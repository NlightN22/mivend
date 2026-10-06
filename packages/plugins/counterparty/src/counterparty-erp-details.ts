export interface CounterpartyErpDetails {
    mainContractId?: string | null;
    fullName?: string | null;
    mainBankAccountId?: string | null;
    ogrnip?: string | null;
    kpp?: string | null;
    okpo?: string | null;
    legalType?: string | null;
    regionId?: string | null;
    legalFormId?: string | null;
}

const ERP_DETAIL_KEYS: readonly (keyof CounterpartyErpDetails)[] = [
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

// undefined means "not sent": the column keeps its value; null clears it.
export function definedErpDetails(fields: CounterpartyErpDetails): CounterpartyErpDetails {
    const result: CounterpartyErpDetails = {};
    for (const key of ERP_DETAIL_KEYS) {
        if (fields[key] !== undefined) result[key] = fields[key];
    }
    return result;
}
