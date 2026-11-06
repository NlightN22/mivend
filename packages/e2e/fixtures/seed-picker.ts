// More active counterparties than the old 500-row picker cap, so the target sorts beyond it by name.
export const PICKER_FILLER_COUNT = 510;
export const PICKER_TARGET = { erpId: 'e2e-cnt-picker-a', shortName: 'Zzz Picker Target' };
export const PICKER_NO_PORTAL = { erpId: 'e2e-cnt-picker-b', shortName: 'Zzz Picker No Portal' };
export const PICKER_CUSTOMER_EMAIL = 'e2e-picker@test.example';

function pickerCounterparty(
    erpId: string,
    shortName: string,
    inn: string,
): { type: 'counterparty'; data: Record<string, unknown> } {
    return {
        type: 'counterparty',
        data: {
            erpId,
            legalName: `${shortName} LLC`,
            shortName,
            inn,
            creditLimit: 10000,
            creditBalance: 0,
            paymentDelayDays: 7,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
        },
    };
}

export const pickerSeedRecords = [
    ...Array.from({ length: PICKER_FILLER_COUNT }, (_, i) =>
        pickerCounterparty(
            `e2e-cnt-picker-f${i}`,
            `Zza Picker Filler ${String(i).padStart(4, '0')}`,
            `52${String(i).padStart(8, '0')}`,
        ),
    ),
    pickerCounterparty(PICKER_TARGET.erpId, PICKER_TARGET.shortName, '5300000001'),
    pickerCounterparty(PICKER_NO_PORTAL.erpId, PICKER_NO_PORTAL.shortName, '5300000002'),
    {
        type: 'customer' as const,
        data: {
            email: PICKER_CUSTOMER_EMAIL,
            firstName: 'Picker',
            lastName: 'Target',
            password: 'E2eTest123!',
        },
    },
    {
        type: 'customerCounterparty' as const,
        data: { customerEmail: PICKER_CUSTOMER_EMAIL, counterpartyErpId: PICKER_TARGET.erpId },
    },
];
