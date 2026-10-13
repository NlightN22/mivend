import { create, toBinary } from '@bufbuild/protobuf';
import type { MessageInitShape } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
    SettlementBalanceChangedSchema,
    SettlementDocumentChangedSchema,
} from '@nlightn22/event-contracts';
import {
    SettlementBalance,
    SettlementBalanceService,
    SettlementDocument,
    SettlementDocumentEntry,
    SettlementDocumentService,
    SettlementOrderLink,
    SettlementPendingService,
    SettlementReferenceResolver,
} from '@mivend/plugin-settlement';
import type { KafkaMessage } from 'kafkajs';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext as ctx,
    testSchemaOptions,
} from 'shared';

import { ContractStreamHandler } from '../../../handlers/contract.handler';
import { SettlementBalanceStreamHandler } from '../../../handlers/settlement-balance.handler';
import { SettlementDocumentStreamHandler } from '../../../handlers/settlement-document.handler';
import { classifyInboundMessage } from '../../../kafka-inbound-message';

const { schema, extra } = testSchemaOptions('settlement_ingestion');
let dataSource: DataSource;
let documentHandler: SettlementDocumentStreamHandler;
let balanceHandler: SettlementBalanceStreamHandler;
let contractHandler: ContractStreamHandler;
const contractsByErpId = new Map<string, { id: number }>();

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
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
    const connection = createTestConnection(dataSource);
    const counterpartyService = { findByErpId: async () => ({ id: 5 }) };
    const contractService = {
        findByErpId: async (_c: unknown, id: string) => contractsByErpId.get(id) ?? null,
        upsertActiveState: async (_c: unknown, id: string) => {
            contractsByErpId.set(id, { id: 77 });
        },
    };
    const resolver = new SettlementReferenceResolver(
        connection,
        counterpartyService as never,
        contractService as never,
    );
    const pending = new SettlementPendingService(connection);
    documentHandler = new SettlementDocumentStreamHandler(
        new SettlementDocumentService(connection, resolver),
    );
    balanceHandler = new SettlementBalanceStreamHandler(
        new SettlementBalanceService(connection, resolver),
    );
    contractHandler = new ContractStreamHandler(
        contractService as never,
        counterpartyService as never,
        pending,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE settlement_document, settlement_balance, "order" RESTART IDENTITY CASCADE',
    );
    contractsByErpId.clear();
});

const DOC_ID = '33333333-3333-4333-8333-333333333333';
const ENVELOPE = { eventId: '11111111-1111-4111-8111-111111111111', entityId: DOC_ID };

function decode<
    S extends typeof SettlementDocumentChangedSchema | typeof SettlementBalanceChangedSchema,
>(
    stream: 'settlement-document' | 'settlement-balance',
    schemaDef: S,
    init: MessageInitShape<S>,
): Record<string, unknown> {
    const message = create(schemaDef, init);
    const classified = classifyInboundMessage(
        stream,
        schemaDef,
        {
            value: Buffer.from(toBinary(schemaDef, message)),
            offset: '1',
        } as unknown as KafkaMessage,
        0,
    );
    if (classified.kind !== 'enqueue') throw new Error('expected an enqueue');
    return classified.input.payload;
}

const documentPayload = (
    init: MessageInitShape<typeof SettlementDocumentChangedSchema> = {},
): Record<string, unknown> =>
    decode('settlement-document', SettlementDocumentChangedSchema, {
        ...ENVELOPE,
        version: '2026-10-01T10:00:00Z',
        documentType: 'Sale',
        documentTypeLabel: 'Sale',
        number: '15',
        date: timestampFromDate(new Date('2026-09-30T00:00:00Z')),
        entries: [
            {
                organizationId: 'org-1',
                counterpartyId: 'cp-1',
                contractId: 'ct-1',
                currency: 'RUB',
                amount: 3505.7,
                orderLinks: [{ orderId: 'o-1', amount: 3505.7 }],
            },
        ],
        ...init,
    });

const entries = (): Promise<SettlementDocumentEntry[]> =>
    dataSource.getRepository(SettlementDocumentEntry).find();

describe('settlement ingestion (decode -> handler -> real Postgres)', () => {
    it('stores a decoded document with minor-unit amounts; absent optionals stay absent', async () => {
        const outcome = await documentHandler.apply(ctx, DOC_ID, documentPayload());

        expect(outcome).toEqual({ kind: 'applied' });
        const [entry] = await entries();
        expect(entry).toMatchObject({ amountMinor: 350570, dueDate: null, counterpartyId: '5' });
        const [doc] = await dataSource.getRepository(SettlementDocument).find();
        expect(doc).toMatchObject({ isDeleted: false, isErpOwned: true });
        const [link] = await dataSource.getRepository(SettlementOrderLink).find();
        expect(link).toMatchObject({ orderErpId: 'o-1', orderUuid: null, orderId: null });
    });

    it('keeps the entry pending until the contract is imported, then attaches it', async () => {
        await documentHandler.apply(ctx, DOC_ID, documentPayload());
        expect((await entries())[0].contractId).toBeNull();

        await contractHandler.apply(ctx, 'ct-1', {
            name: 'Contract',
            counterpartyId: 'cp-1',
            isActive: true,
        });

        expect((await entries())[0].contractId).toBe('77');
    });

    it('redelivery of the same message is idempotent', async () => {
        const payload = documentPayload();

        await documentHandler.apply(ctx, DOC_ID, payload);
        const second = await documentHandler.apply(ctx, DOC_ID, payload);

        expect(second.kind).toBe('noop');
        expect(await entries()).toHaveLength(1);
    });

    it('a decoded tombstone voids the document', async () => {
        await documentHandler.apply(ctx, DOC_ID, documentPayload());

        await documentHandler.apply(
            ctx,
            DOC_ID,
            documentPayload({ version: '2026-10-02T10:00:00Z', isDeleted: true, entries: [] }),
        );

        const [doc] = await dataSource.getRepository(SettlementDocument).find();
        expect(doc.isDeleted).toBe(true);
    });

    it('stores a balance with a closing that disagrees with documents, and drops an older one', async () => {
        const key = 'org-1:cp-1:ct-1';
        const payload = (version: string, closing: number): Record<string, unknown> =>
            decode('settlement-balance', SettlementBalanceChangedSchema, {
                eventId: ENVELOPE.eventId,
                entityId: key,
                version,
                organizationId: 'org-1',
                counterpartyId: 'cp-1',
                contractId: 'ct-1',
                currency: 'RUB',
                openingDate: timestampFromDate(new Date('2026-01-01T00:00:00Z')),
                openingBalance: 100,
                closingBalance: closing,
            });

        await balanceHandler.apply(ctx, key, payload('2026-10-02T10:00:00Z', 0));
        const stale = await balanceHandler.apply(ctx, key, payload('2026-10-01T10:00:00Z', 999));

        expect(stale.kind).toBe('noop');
        const [balance] = await dataSource.getRepository(SettlementBalance).find();
        expect(balance).toMatchObject({ openingBalance: 10000, closingBalance: 0 });
    });
});
