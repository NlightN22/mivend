export const LONG_FIELDS_CP = {
    erpId: 'e2e-cnt-long-a',
    shortName: 'Длиннофамильный Тестовый Контрагент Иванович (розн.)',
    erpGroupLabel: 'd65d72eb-a651-11ef-8708-a0583378c0ee',
};

// Real counterparties carry long names and an opaque id as the ERP group label; the card must not outgrow a phone screen.
export const longFieldsSeedRecords = [
    {
        type: 'counterparty' as const,
        data: {
            erpId: LONG_FIELDS_CP.erpId,
            legalName: `${LONG_FIELDS_CP.shortName} (legal)`,
            shortName: LONG_FIELDS_CP.shortName,
            inn: null,
            phone: '+7 900 000-01-09',
            officialEmail: `${LONG_FIELDS_CP.erpId}@test.example`,
            creditLimit: 0,
            creditBalance: 0,
            paymentDelayDays: 0,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
            erpGroupLabel: LONG_FIELDS_CP.erpGroupLabel,
        },
    },
];
