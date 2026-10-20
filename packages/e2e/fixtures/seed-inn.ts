export const INN_TWIN_A = { erpId: 'e2e-cnt-inn-a', shortName: 'E2E INN Twin A' };
export const INN_TWIN_B = { erpId: 'e2e-cnt-inn-b', shortName: 'E2E INN Twin B' };
export const INN_UNIQUE = { erpId: 'e2e-cnt-inn-c', shortName: 'E2E INN Unique' };
export const INN_MISSING = { erpId: 'e2e-cnt-inn-d', shortName: 'E2E INN Missing' };
export const INN_TWIN_A_CUSTOMER_EMAIL = 'e2e-inn-a@test.example';

function innCounterparty(
    who: { erpId: string; shortName: string },
    inn: string | null,
    contact: number,
): { type: 'counterparty'; data: Record<string, unknown> } {
    return {
        type: 'counterparty',
        data: {
            erpId: who.erpId,
            legalName: `${who.shortName} LLC`,
            shortName: who.shortName,
            inn,
            phone: `+7 900 000-01-0${contact}`,
            officialEmail: `${who.erpId}@test.example`,
            creditLimit: 10000,
            creditBalance: 0,
            paymentDelayDays: 7,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
        },
    };
}

// Twins carry one inn in two formats; A is already bound to a portal customer, B and the
// missing-inn row are the portal-binding refusals (#225).
export const innSeedRecords = [
    innCounterparty(INN_TWIN_A, '77 000-00011', 1),
    innCounterparty(INN_TWIN_B, '7700000011', 2),
    innCounterparty(INN_UNIQUE, '7700000012', 3),
    innCounterparty(INN_MISSING, null, 4),
    {
        type: 'customer' as const,
        data: {
            email: INN_TWIN_A_CUSTOMER_EMAIL,
            firstName: 'Inn',
            lastName: 'Twin',
            password: 'E2eTest123!',
        },
    },
    {
        type: 'customerCounterparty' as const,
        data: { customerEmail: INN_TWIN_A_CUSTOMER_EMAIL, counterpartyErpId: INN_TWIN_A.erpId },
    },
];
