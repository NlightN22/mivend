import { postBatch, type ImportTarget } from './erp-import-seed';
import {
    CUSTOMER_PASSWORD,
    DEPARTMENTS,
    GAP_CLIENTS,
    gapClientName,
    type GapClientPlan,
} from './fixture-plan';

const contractOf = (erpId: string): string => `${erpId}-contract`;
export const gapCustomerEmail = (erpId: string): string => `${erpId}@access.test`;

function mainContract(c: GapClientPlan): string | null {
    return c.reason === 'no-main-contract' ? null : contractOf(c.erpId);
}

// Each reason in price-type-gap.service.ts, built from import records only; each client has a portal customer.
export async function seedGapClients(target: ImportTarget): Promise<void> {
    await postBatch(
        target,
        'counterparty',
        GAP_CLIENTS.map((c, index) => ({
            erpId: c.erpId,
            inn: `00000009${index + 10}`,
            legalName: `${gapClientName(c.erpId)} LLC`,
            shortName: gapClientName(c.erpId),
            creditLimit: 0,
            creditBalance: 0,
            paymentDelayDays: 0,
            priceType: 'RETAIL',
            isActive: true,
            departmentId: DEPARTMENTS[c.branch],
            mainContractErpId: mainContract(c),
        })),
        'gap-counterparty',
    );
    await postBatch(
        target,
        'contract',
        GAP_CLIENTS.filter(
            c => c.reason === 'contract-inactive' || c.reason === 'price-type-not-synced',
        ).map(c => ({
            erpId: contractOf(c.erpId),
            counterpartyErpId: c.erpId,
            name: `Main contract ${c.erpId}`,
            organizationId: 'access-org',
            priceTypeId: 'access-pt-never-synced',
            isActive: c.reason !== 'contract-inactive',
        })),
        'gap-contract',
    );
    await postBatch(
        target,
        'customer',
        GAP_CLIENTS.map(c => ({
            email: gapCustomerEmail(c.erpId),
            firstName: 'Access',
            lastName: c.erpId,
            password: CUSTOMER_PASSWORD,
        })),
        'gap-customer',
    );
    await postBatch(
        target,
        'customerCounterparty',
        GAP_CLIENTS.map(c => ({
            customerEmail: gapCustomerEmail(c.erpId),
            counterpartyErpId: c.erpId,
        })),
        'gap-customer-counterparty',
    );
}
