import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import { CounterpartyContactErp } from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';
import type { TransactionalConnection } from '@vendure/core';
import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { ProductGroupErp } from '../../../entities/product-group-erp.entity';
import { CounterpartyContactStreamHandler } from '../../../handlers/counterparty-contact.handler';
import { ProductGroupStreamHandler } from '../../../handlers/product-group.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}

const { schema, extra } = testSchemaOptions('erp_mirrors');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let seq = 0;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            IntegrationInboxEvent,
            CounterpartyContactErp,
            ProductGroupErp,
            TestCounterparty,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(createTestConnection(dataSource));
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE integration_inbox_event, counterparty_contact_erp, product_group_erp, counterparty RESTART IDENTITY`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function deliver(
    stream: 'counterparty-contact' | 'product-group',
    version: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (entity === Counterparty ? TestCounterparty : entity) as never),
    } as unknown as TransactionalConnection;
    const handler =
        stream === 'product-group'
            ? new ProductGroupStreamHandler(connection)
            : new CounterpartyContactStreamHandler(
                  connection,
                  { upsert: vi.fn().mockResolvedValue(1), deactivate: vi.fn() } as never,
                  { replaceErpPoints: vi.fn() } as never,
              );
    seq += 1;
    await inbox.enqueue(testRequestContext, {
        stream,
        entityId: 'e-1',
        version,
        sourceEventId: `evt-${seq}`,
        payload,
    });
    await makeInboxProcessor(
        dataSource,
        inbox,
        vi.fn((c: RequestContext, id: string, p: Record<string, unknown>) =>
            handler.apply(c, id, p),
        ),
    ).processPendingBatch();
}

const contacts = (): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(
        `SELECT "erpId", "counterpartyId", name, "contactInfos", "isActive", "isDeleted" FROM counterparty_contact_erp`,
    );

describe('ERP mirrors through the inbox (real Postgres)', () => {
    it('stores a contact whose counterparty never arrived and stays one row on redelivery', async () => {
        const payload = { counterpartyId: 'cp-missing', name: 'Contact A', isActive: true };
        await deliver('counterparty-contact', '1', payload);
        await deliver('counterparty-contact', '1', payload);

        expect(await contacts()).toEqual([
            {
                erpId: 'e-1',
                counterpartyId: 'cp-missing',
                name: 'Contact A',
                contactInfos: '[]',
                isActive: true,
                isDeleted: false,
            },
        ]);
        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(rows.every(r => r.status === 'processed')).toBe(true);
    });

    it('ignores an older version that arrives after a newer one', async () => {
        await deliver('counterparty-contact', '2', {
            counterpartyId: 'cp-1',
            name: 'New',
            isActive: true,
        });
        await deliver('counterparty-contact', '1', {
            counterpartyId: 'cp-1',
            name: 'Old',
            isActive: true,
        });

        expect((await contacts()).map(r => r.name)).toEqual(['New']);
    });

    it('a tombstone keeps the row and its values, flagged deleted', async () => {
        await deliver('product-group', '1', {
            name: 'Goods',
            code: '01',
            parentId: 'pg-gone',
            isActive: true,
        });
        await deliver('product-group', '2', { isDeleted: true });

        const rows = await dataSource.query(
            `SELECT name, code, "parentId", "isActive", "isDeleted" FROM product_group_erp`,
        );
        expect(rows).toEqual([
            { name: 'Goods', code: '01', parentId: 'pg-gone', isActive: false, isDeleted: true },
        ]);
    });
});
