import { Client } from 'pg';

import { testDbConnection } from '../harness/test-database';
import {
    CUSTOMERS,
    ERP_CLAIM_DELETED,
    ERP_CLAIM_NUMBERS,
    ERP_CLAIM_UNKNOWN_COUNTERPARTY,
    counterpartyErpId,
} from './fixture-plan';

// The claim stream is Kafka-only, so the rows are inserted directly; throwaway access DB only.
export async function seedErpDocuments(database: string): Promise<void> {
    const client = new Client({ ...testDbConnection(), database });
    await client.connect();
    try {
        const rows: [string, string, boolean][] = [
            ...CUSTOMERS.map(
                c =>
                    [ERP_CLAIM_NUMBERS[c.key], counterpartyErpId(c.counterparty), false] as [
                        string,
                        string,
                        boolean,
                    ],
            ),
            [ERP_CLAIM_DELETED, counterpartyErpId(CUSTOMERS[0].counterparty), true],
            [ERP_CLAIM_UNKNOWN_COUNTERPARTY, 'access-cp-unknown', false],
        ];
        for (const [number, counterpartyId, isDeleted] of rows)
            await client.query(
                `INSERT INTO customer_claim_erp ("erpId", "sourceVersion", number, "counterpartyId", "isDeleted")
                 VALUES ($1, '1', $2, $3, $4)`,
                [`access-claim-${number}`, number, counterpartyId, isDeleted],
            );
    } finally {
        await client.end();
    }
}
