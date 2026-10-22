import { postBatch, type ImportTarget } from './erp-import-seed';
import {
    CUSTOMER_CONTRACTS,
    CUSTOMERS,
    SETTLEMENT_NUMBERS,
    SETTLEMENT_TYPES,
    counterpartyErpId,
    type SettlementCategory,
} from './fixture-plan';

const CATEGORIES: SettlementCategory[] = ['sale', 'payment'];

// A sale and a payment document plus a balance on each customer's sale contract.
export async function seedSettlements(target: ImportTarget): Promise<void> {
    await postBatch(
        target,
        'settlementDocumentType',
        CATEGORIES.map((category, i) => ({
            documentType: SETTLEMENT_TYPES[category],
            version: '1',
            label: `Access ${category}`,
            category,
            customerVisible: true,
            sortOrder: i,
        })),
    );
    const accounts = CUSTOMERS.map(c => ({
        customer: c.key,
        counterpartyErpId: counterpartyErpId(c.counterparty),
        contractErpId: CUSTOMER_CONTRACTS[c.counterparty]!,
        organizationErpId: 'access-org',
    }));
    await postBatch(
        target,
        'settlementDocument',
        accounts.flatMap(a =>
            CATEGORIES.map(category => ({
                erpId: `access-settlement-${a.customer}-${category}`,
                version: '1',
                documentType: SETTLEMENT_TYPES[category],
                documentTypeLabel: `Access ${category}`,
                number: SETTLEMENT_NUMBERS[a.customer][category],
                date: '2026-02-01T00:00:00.000Z',
                entries: [
                    {
                        organizationErpId: a.organizationErpId,
                        counterpartyErpId: a.counterpartyErpId,
                        contractErpId: a.contractErpId,
                        currency: 'RUB',
                        amount: category === 'sale' ? 500 : -200,
                    },
                ],
            })),
        ),
    );
    await postBatch(
        target,
        'settlementBalance',
        accounts.map(a => ({
            key: `access-balance-${a.customer}`,
            version: '1',
            organizationErpId: a.organizationErpId,
            counterpartyErpId: a.counterpartyErpId,
            contractErpId: a.contractErpId,
            currency: 'RUB',
            openingDate: '2026-01-01T00:00:00.000Z',
            openingBalance: 0,
            closingBalance: 300,
        })),
    );
}
