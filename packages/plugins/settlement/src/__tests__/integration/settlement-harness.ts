import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { SettlementBalance } from '../../entities/settlement-balance.entity';
import { SettlementDocumentEntry } from '../../entities/settlement-document-entry.entity';
import { SettlementDocument } from '../../entities/settlement-document.entity';
import { SettlementOrderLink } from '../../entities/settlement-order-link.entity';
import { SettlementBalanceService } from '../../settlement-balance.service';
import { SettlementDocumentService } from '../../settlement-document.service';
import { SettlementPendingService } from '../../settlement-pending.service';
import { SettlementReferenceResolver } from '../../settlement-reference-resolver';
import { SettlementReconcileService } from '../../settlement-reconcile.service';
import { SettlementRetentionService } from '../../settlement-retention.service';
import type { SettlementDocumentInput } from '../../types';

export const ctx = {} as RequestContext;

export interface Harness {
    dataSource: DataSource;
    schema: string;
    counterparties: Map<string, number>;
    contracts: Map<string, number>;
    lookupDelayMs: { value: number };
    documents: SettlementDocumentService;
    balances: SettlementBalanceService;
    pending: SettlementPendingService;
    retention: SettlementRetentionService;
    reconcile: SettlementReconcileService;
}

export async function createHarness(tag: string): Promise<Harness> {
    const { schema, extra } = testSchemaOptions(tag);
    await createTestSchema(schema);
    const dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            SettlementDocument,
            SettlementDocumentEntry,
            SettlementOrderLink,
            SettlementBalance,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE "order" (id serial primary key, state varchar,
            "customFieldsErporderid" varchar, "customFieldsUuid" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE payment_attempt (id serial primary key, "orderId" int, "paymentStatus" varchar)`,
    );

    const counterparties = new Map<string, number>();
    const contracts = new Map<string, number>();
    const connection = createTestConnection(dataSource);
    const lookupDelayMs = { value: 0 };
    const slowLookup = async (
        map: Map<string, number>,
        id: string,
    ): Promise<{ id: number } | null> => {
        const found = lookup(map, id);
        if (lookupDelayMs.value > 0) {
            await new Promise(resolve => setTimeout(resolve, lookupDelayMs.value));
        }
        return found;
    };
    const resolver = new SettlementReferenceResolver(
        connection,
        { findByErpId: (_c: unknown, id: string) => slowLookup(counterparties, id) } as never,
        { findByErpId: (_c: unknown, id: string) => slowLookup(contracts, id) } as never,
    );
    const pending = new SettlementPendingService(connection);
    return {
        dataSource,
        schema,
        counterparties,
        contracts,
        lookupDelayMs,
        documents: new SettlementDocumentService(connection, resolver),
        balances: new SettlementBalanceService(connection, resolver),
        pending,
        reconcile: new SettlementReconcileService(
            connection,
            resolver,
            pending,
            { isWorker: false } as never,
            {} as never,
        ),
        retention: new SettlementRetentionService(connection, {
            getSettings: async () => ({ customFields: { settlementRetentionMonths: 12 } }),
        } as never),
    };
}

const lookup = (map: Map<string, number>, id: string): { id: number } | null =>
    map.has(id) ? { id: map.get(id) as number } : null;

export function documentInput(
    erpId: string,
    over: Partial<SettlementDocumentInput> = {},
): SettlementDocumentInput {
    return {
        erpId,
        version: '2026-10-01T10:00:00Z',
        isDeleted: false,
        documentType: 'Sale',
        documentTypeLabel: 'Sale',
        number: '7',
        date: new Date('2026-09-01T00:00:00Z'),
        entries: [
            {
                organizationErpId: 'org-1',
                counterpartyErpId: 'cp-1',
                contractErpId: 'ct-1',
                currency: 'RUB',
                amount: 100.5,
                dueDate: null,
                orderLinks: [],
            },
        ],
        ...over,
    };
}
