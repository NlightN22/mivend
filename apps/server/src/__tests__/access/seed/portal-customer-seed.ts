import { postBatch, type ImportTarget } from './erp-import-seed';
import { CUSTOMER_PASSWORD, PORTAL_CUSTOMERS, counterpartyErpId } from './fixture-plan';

export async function seedPortalCustomers(target: ImportTarget): Promise<void> {
    await postBatch(
        target,
        'customer',
        PORTAL_CUSTOMERS.map(c => ({
            email: c.email,
            firstName: 'Access',
            lastName: c.counterparty,
            password: CUSTOMER_PASSWORD,
        })),
        'portal-customer',
    );
    await postBatch(
        target,
        'customerCounterparty',
        PORTAL_CUSTOMERS.map(c => ({
            customerEmail: c.email,
            counterpartyErpId: counterpartyErpId(c.counterparty),
        })),
        'portal-customer-counterparty',
    );
}
