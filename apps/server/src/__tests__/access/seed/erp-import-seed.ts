import {
    BRANCHES,
    COUNTERPARTIES,
    CUSTOMER_PASSWORD,
    CUSTOMERS,
    DEPARTMENTS,
    counterpartyErpId,
    counterpartyName,
    customerEmail,
} from './fixture-plan';

export interface ImportTarget {
    baseUrl: string;
    token: string;
}

async function postBatch(target: ImportTarget, type: string, records: object[]): Promise<void> {
    const response = await fetch(`${target.baseUrl}/erp/import/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${target.token}` },
        body: JSON.stringify({
            exchangeId: `access-seed-${type}`,
            records: records.map(data => ({ type, data })),
        }),
    });
    const body = (await response.json()) as { failed?: number };
    if (!response.ok || (body.failed ?? 0) > 0)
        throw new Error(`erp-import ${type} failed: ${JSON.stringify(body)}`);
}

const contractErpId = (erpId: string): string => `${erpId}-contract`;

export async function seedMasterData(target: ImportTarget): Promise<void> {
    await postBatch(target, 'department', [
        { erpId: DEPARTMENTS.root, name: 'Access root department' },
        { erpId: DEPARTMENTS.a, name: 'Access department A', parentErpId: DEPARTMENTS.root },
        { erpId: DEPARTMENTS.b, name: 'Access department B', parentErpId: DEPARTMENTS.root },
    ]);
    await postBatch(target, 'branch', [
        { erpId: BRANCHES.a, name: 'Access branch A' },
        { erpId: BRANCHES.b, name: 'Access branch B' },
    ]);
    await postBatch(target, 'departmentBranch', [
        { departmentErpId: DEPARTMENTS.a, branchErpId: BRANCHES.a },
        { departmentErpId: DEPARTMENTS.b, branchErpId: BRANCHES.b },
    ]);
    await postBatch(target, 'organizationRequisites', [
        {
            erpId: 'access-org',
            legalName: 'Access test seller',
            inn: '000000000010',
            legalAddress: 'Test address 1',
        },
    ]);
    const counterparties = COUNTERPARTIES.map(c => counterpartyErpId(c.key));
    await postBatch(
        target,
        'counterparty',
        COUNTERPARTIES.map((c, index) => ({
            erpId: counterpartyErpId(c.key),
            inn: `00000000${index + 10}`,
            legalName: `${counterpartyName(c.key)} LLC`,
            shortName: counterpartyName(c.key),
            creditLimit: 100000,
            creditBalance: 0,
            paymentDelayDays: 0,
            priceType: 'RETAIL',
            isActive: true,
            departmentId: c.department,
            mainContractErpId: contractErpId(counterpartyErpId(c.key)),
        })),
    );
    await postBatch(
        target,
        'contract',
        counterparties.map(erpId => ({
            erpId: contractErpId(erpId),
            counterpartyErpId: erpId,
            name: `Main contract ${erpId}`,
            organizationId: 'access-org',
            priceTypeId: 'RETAIL',
            isActive: true,
        })),
    );
    await postBatch(
        target,
        'tradingPoint',
        counterparties.map(erpId => ({
            erpId: `${erpId}-point`,
            counterpartyErpId: erpId,
            name: `Point of ${erpId}`,
            address: 'Test street 1',
            isActive: true,
        })),
    );
    await postBatch(
        target,
        'document',
        counterparties.map((erpId, index) => ({
            erpId: `${erpId}-document`,
            type: 'reconciliation',
            counterpartyErpId: erpId,
            number: `90${index + 1}`,
            issueDate: '2026-01-15T00:00:00.000Z',
            amount: 1000,
            currencyCode: 'RUB',
        })),
    );
    await postBatch(
        target,
        'customer',
        CUSTOMERS.map(c => ({
            email: customerEmail(c.key),
            firstName: 'Access',
            lastName: c.key,
            password: CUSTOMER_PASSWORD,
        })),
    );
    await postBatch(
        target,
        'customerCounterparty',
        CUSTOMERS.map(c => ({
            customerEmail: customerEmail(c.key),
            counterpartyErpId: counterpartyErpId(c.counterparty),
        })),
    );
}
