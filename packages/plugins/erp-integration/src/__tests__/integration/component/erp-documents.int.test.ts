import {
    CustomerClaimErp,
    CustomerClaimGoodsLineErp,
    CustomerClaimServiceLineErp,
    ERP_DOCUMENT_ENTITIES,
    ErpDocumentWriter,
    OrderChangeResultErp,
} from '@mivend/plugin-erp-order';
import { ContractPowerOfAttorneyErp, PowerOfAttorneyErpService } from '@mivend/plugin-counterparty';
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

import { CustomerClaimStreamHandler } from '../../../handlers/customer-claim.handler';
import { OrderChangeResultStreamHandler } from '../../../handlers/order-change-result.handler';

const { schema, extra } = testSchemaOptions('erp_documents');
let dataSource: DataSource;
let claims: CustomerClaimStreamHandler;
let results: OrderChangeResultStreamHandler;
let powers: PowerOfAttorneyErpService;

const claim = (version: string, extra: Record<string, unknown> = {}) => ({
    version,
    number: '100',
    orderId: 'order-not-synced',
    totalAmount: 10,
    goods: [
        { lineNumber: 1, productId: 'p1', quantity: 1, price: 5, amount: 5 },
        { lineNumber: 2, productId: 'p2', quantity: 1, price: 5, amount: 5 },
    ],
    services: [{ lineNumber: 1, content: 'delivery', quantity: 1, price: 0, amount: 0 }],
    ...extra,
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [...ERP_DOCUMENT_ENTITIES, ContractPowerOfAttorneyErp],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = createTestConnection(dataSource);
    const writer = new ErpDocumentWriter(connection);
    claims = new CustomerClaimStreamHandler(writer);
    results = new OrderChangeResultStreamHandler(writer);
    powers = new PowerOfAttorneyErpService(connection);
});

beforeEach(async () => {
    for (const entity of [...ERP_DOCUMENT_ENTITIES, ContractPowerOfAttorneyErp]) {
        await dataSource.getRepository(entity).clear();
    }
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ERP document tables', () => {
    it('stores a claim whose order is unknown and replays the same version as a noop', async () => {
        expect((await claims.apply(ctx, 'claim-1', claim('1'))).kind).toBe('applied');
        expect((await claims.apply(ctx, 'claim-1', claim('1'))).kind).toBe('noop');

        const rows = await dataSource.getRepository(CustomerClaimErp).find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ orderId: 'order-not-synced', totalAmountMinor: 1000 });
        expect(await dataSource.getRepository(CustomerClaimGoodsLineErp).count()).toBe(2);
    });

    it('replaces header and lines on a newer version and ignores an older one', async () => {
        await claims.apply(ctx, 'claim-1', claim('2'));
        await claims.apply(ctx, 'claim-1', claim('3', { number: '101', goods: [], services: [] }));
        const older = await claims.apply(ctx, 'claim-1', claim('1', { number: '99' }));

        expect(older.kind).toBe('noop');
        const [row] = await dataSource.getRepository(CustomerClaimErp).find();
        expect(row.number).toBe('101');
        expect(await dataSource.getRepository(CustomerClaimGoodsLineErp).count()).toBe(0);
        expect(await dataSource.getRepository(CustomerClaimServiceLineErp).count()).toBe(0);
    });

    it('keeps data on a tombstone, ignores a tombstone of an unknown claim, and a same-version delayed upsert cannot resurrect it', async () => {
        expect((await claims.apply(ctx, 'ghost', { version: '1', isDeleted: true })).kind).toBe(
            'noop',
        );
        expect(await dataSource.getRepository(CustomerClaimErp).count()).toBe(0);

        await claims.apply(ctx, 'claim-1', claim('1'));
        await claims.apply(ctx, 'claim-1', { version: '2', isDeleted: true });
        await claims.apply(ctx, 'claim-1', claim('2'));

        const [row] = await dataSource.getRepository(CustomerClaimErp).find();
        expect(row).toMatchObject({ isDeleted: true, number: '100' });
        expect(await dataSource.getRepository(CustomerClaimGoodsLineErp).count()).toBe(2);
    });

    it('concurrent delivery of two versions of one claim leaves one row with the newest lines', async () => {
        await Promise.all([
            claims.apply(ctx, 'claim-1', claim('1')),
            claims.apply(
                ctx,
                'claim-1',
                claim('2', { goods: [{ lineNumber: 1, productId: 'p9' }] }),
            ),
            claims.apply(ctx, 'claim-1', claim('1')),
        ]);
        expect(await dataSource.getRepository(CustomerClaimErp).count()).toBe(1);
        const lines = await dataSource.getRepository(CustomerClaimGoodsLineErp).find();
        expect(lines.map(l => l.productId)).toEqual(['p9']);
    });

    it('stores an order change result as history keyed by its ERP id', async () => {
        const payload = {
            version: '1',
            status: 'rejected',
            orderEntityId: 'o-1',
            requestEntityId: 'r-1',
        };
        await results.apply(ctx, 'res-1', payload);
        await results.apply(ctx, 'res-1', payload);
        const rows = await dataSource.getRepository(OrderChangeResultErp).find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ orderId: 'o-1', requestId: 'r-1', status: 'rejected' });
    });
});

describe('contract powers of attorney', () => {
    const item = (number: string) => ({
        externalId: null,
        number,
        holderName: 'Holder',
        issueDate: null,
        validUntil: null,
        scanId: 'scan',
    });
    const replace = (items: ReturnType<typeof item>[], isDeleted = false) =>
        powers.replaceForContract(ctx, {
            contractId: 'contract-1',
            counterpartyId: 'cp-1',
            organizationId: null,
            isDeleted,
            items,
        });

    it('replaces the list as a whole, clears it on an empty list and flags it on a tombstone', async () => {
        const repo = dataSource.getRepository(ContractPowerOfAttorneyErp);
        await replace([item('1'), item('2')]);
        await replace([item('3')]);
        expect((await repo.find()).map(r => r.number)).toEqual(['3']);

        await powers.markContractDeleted(ctx, 'contract-1');
        expect((await repo.find())[0].isDeleted).toBe(true);

        await replace([]);
        expect(await repo.count()).toBe(0);
    });

    it('concurrent replacements never duplicate rows', async () => {
        await Promise.all([replace([item('1'), item('2')]), replace([item('1'), item('2')])]);
        expect(await dataSource.getRepository(ContractPowerOfAttorneyErp).count()).toBe(2);
    });
});
