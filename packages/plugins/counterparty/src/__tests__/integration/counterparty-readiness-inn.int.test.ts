import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { PORTAL_READINESS } from '../../counterparty-readiness-filter';

// Vendure's VendureEntity needs bootstrap(), so hand-rolled tables stand in for the real entities.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('contact_point')
class TestContactPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'boolean', default: true }) isUsable!: boolean;
}

@Entity('counterparty_contact_point')
class TestCounterpartyContactPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @Column({ type: 'uuid' }) counterpartyId!: string;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

let dataSource: DataSource;
let service: CounterpartyService;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('counterparty_readiness_inn');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCustomer, TestContactPoint, TestCounterpartyContactPoint],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new CounterpartyService(
        { getRepository: () => dataSource.getRepository(TestCounterparty) } as unknown as TransactionalConnection,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        {
            resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })),
            managerClause: vi.fn(() => null),
        } as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE counterparty_contact_point, contact_point, customer RESTART IDENTITY',
    );
    await dataSource.getRepository(TestCounterparty).clear();
});

async function add(
    erpId: string,
    inn: string | null,
    opts: { active?: boolean; live?: boolean; deleted?: boolean } = {},
): Promise<void> {
    const repo = dataSource.getRepository(TestCounterparty);
    const row = await repo.save({
        erpId,
        legalName: erpId,
        shortName: erpId,
        inn,
        phone: '+10000000',
        officialEmail: 'a@example.test',
        isActive: opts.active ?? true,
    });
    if (opts.live || opts.deleted) {
        await dataSource.getRepository(TestCustomer).save({
            customFieldsCounterpartyid: row.id,
            deletedAt: opts.deleted ? new Date() : null,
        });
    }
}

async function byReadiness(readiness: string): Promise<string[]> {
    const page = await service.findVisiblePage(mockCtx, { readiness, take: 50 });
    return page.items.map(c => c.erpId).sort();
}

async function ownStatus(erpId: string): Promise<string> {
    const row = await dataSource.getRepository(TestCounterparty).findOneByOrFail({ erpId });
    return service.getPortalReadiness(mockCtx, row.id);
}

describe('portal readiness covers INN like the activation executor', () => {
    it('a missing or digit-less INN is missing data, not ready', async () => {
        await add('no-inn', null);
        await add('blank-inn', '');
        await add('dash-inn', ' - ');
        await add('good', '7700000001');
        expect(await byReadiness('ready')).toEqual(['good']);
        expect(await byReadiness('missing-data')).toEqual(['blank-inn', 'dash-inn', 'no-inn']);
    });

    it('a duplicate counts only when the other holder is active and has a live Customer', async () => {
        await add('holder', '77-000 00002', { live: true });
        await add('candidate', '7700000002');
        await add('other-inactive-holder', '7700000003', { active: false, live: true });
        await add('candidate-inactive-holder', '7700000003');
        await add('other-no-customer', '7700000004');
        await add('candidate-no-customer', '7700000004');
        await add('other-deleted-customer', '7700000005', { deleted: true });
        await add('candidate-deleted-customer', '7700000005');
        expect(await byReadiness('inn-duplicate')).toEqual(['candidate']);
        expect((await byReadiness('ready')).sort()).toEqual([
            'candidate-deleted-customer',
            'candidate-inactive-holder',
            'candidate-no-customer',
            'other-deleted-customer',
            'other-no-customer',
        ]);
    });

    it('activated wins over a duplicate, inactive wins over missing INN, missing data over duplicate', async () => {
        await add('holder', '7700000006', { live: true });
        await add('also-linked', '7700000006', { live: true });
        await add('inactive-no-inn', null, { active: false });
        await dataSource.getRepository(TestCounterparty).save({
            erpId: 'no-phone-dup',
            legalName: 'x',
            shortName: 'x',
            inn: '7700000006',
            phone: '',
            officialEmail: 'a@example.test',
        });
        expect(await byReadiness('activated')).toEqual(['also-linked', 'holder']);
        expect(await byReadiness('erp-inactive')).toEqual(['inactive-no-inn']);
        expect(await byReadiness('missing-data')).toEqual(['no-phone-dup']);
        expect(await byReadiness('inn-duplicate')).toEqual([]);
    });

    it('the per-row value equals the filter that selects the row, and counts equal list sizes', async () => {
        await add('holder', '7700000007', { live: true });
        await add('dup', '7700000007');
        await add('ok', '7700000008');
        await add('no-inn', null);
        await add('off', '7700000009', { active: false });
        let total = 0;
        for (const readiness of PORTAL_READINESS) {
            const page = await service.findVisiblePage(mockCtx, { readiness, take: 0 });
            const erpIds = await byReadiness(readiness);
            expect(page.totalItems).toBe(erpIds.length);
            for (const erpId of erpIds) expect(await ownStatus(erpId)).toBe(readiness);
            total += page.totalItems;
        }
        expect(total).toBe(5);
    });
});
