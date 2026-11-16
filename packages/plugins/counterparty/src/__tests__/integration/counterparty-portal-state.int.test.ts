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
import { loadPortalStates } from '../../counterparty-portal-state.sql';

// Hand-rolled tables with only the columns the portal state reads (see counterparty-activation-filter).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'int', nullable: true }) userId!: number | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('user')
class TestUser {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: false }) verified!: boolean;
    @Column({ type: 'timestamp', nullable: true }) lastLogin!: Date | null;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('authentication_method')
class TestAuthenticationMethod {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) userId!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', default: '' }) passwordHash!: string;
}

const { schema, extra } = testSchemaOptions('counterparty_portal_state');
let dataSource: DataSource;
let service: CounterpartyService;
let scopeKind: 'all' | 'department';
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCustomer, TestUser, TestAuthenticationMethod],
        synchronize: true,
    });
    await dataSource.initialize();
    const accessScope = {
        resolveCounterpartyScope: vi.fn(async () =>
            scopeKind === 'all' ? { kind: 'all' } : { kind: 'department', branchId: 'branch-a' },
        ),
        managerClause: vi.fn(() => null),
    };
    service = new CounterpartyService(
        {
            getRepository: () => dataSource.getRepository(TestCounterparty),
        } as unknown as TransactionalConnection,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        accessScope as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    scopeKind = 'all';
    await dataSource.query(
        'TRUNCATE authentication_method, "user", customer, counterparty RESTART IDENTITY',
    );
});

interface Login {
    verified?: boolean;
    password?: boolean;
    signedIn?: boolean;
    customerDeleted?: boolean;
    userDeleted?: boolean;
}

async function counterparty(shortName: string, branchId = 'branch-b'): Promise<number> {
    const saved = await dataSource
        .getRepository(TestCounterparty)
        .save({ erpId: shortName, legalName: shortName, shortName, branchId });
    return saved.id;
}

async function login(counterpartyId: number, l: Login): Promise<void> {
    const user = await dataSource.getRepository(TestUser).save({
        verified: l.verified ?? false,
        lastLogin: l.signedIn ? new Date() : null,
        deletedAt: l.userDeleted ? new Date() : null,
    });
    await dataSource.getRepository(TestAuthenticationMethod).save({
        userId: user.id,
        type: 'NativeAuthenticationMethod',
        passwordHash: l.password ? 'hash' : '',
    });
    await dataSource.getRepository(TestCustomer).save({
        customFieldsCounterpartyid: String(counterpartyId),
        userId: user.id,
        deletedAt: l.customerDeleted ? new Date() : null,
    });
}

async function seedAllStates(): Promise<void> {
    await counterparty('no-login');
    await login(await counterparty('invited-new'), {});
    await login(await counterparty('invited-unverified'), { password: true });
    await login(await counterparty('invited-no-password'), { verified: true });
    await login(await counterparty('verified'), { verified: true, password: true });
    await login(await counterparty('active'), { verified: true, password: true, signedIn: true });
}

const names = async (
    options: Parameters<CounterpartyService['findVisiblePage']>[1],
): Promise<string[]> =>
    (await service.findVisiblePage(ctx, { ...options, take: 50 })).items
        .map(c => c.shortName)
        .sort();

const stateFilter = (...values: string[]) => ({
    portalState: values.length === 1 ? { eq: values[0] } : { in: values },
});

describe('counterparty portal state (real Postgres, #375)', () => {
    it('computes each state from the live login', async () => {
        await seedAllStates();
        const ids = (await dataSource.getRepository(TestCounterparty).find()).map(c =>
            String(c.id),
        );
        const states = await loadPortalStates(
            { getRepository: () => dataSource.getRepository(TestCounterparty) } as never,
            ctx,
            ids,
        );
        const byName = Object.fromEntries(
            (await dataSource.getRepository(TestCounterparty).find()).map(c => [
                c.shortName,
                states.get(String(c.id)),
            ]),
        );
        expect(byName).toEqual({
            'no-login': 'none',
            'invited-new': 'invited',
            'invited-unverified': 'invited',
            'invited-no-password': 'invited',
            verified: 'verified',
            active: 'active',
        });
    });

    it.each([
        ['none', ['no-login']],
        ['invited', ['invited-new', 'invited-no-password', 'invited-unverified']],
        ['verified', ['verified']],
        ['active', ['active']],
    ])('filters by %s', async (state, expected) => {
        await seedAllStates();
        expect(await names({ filter: stateFilter(state) })).toEqual(expected);
    });

    it('filters by several states at once and by not-equal', async () => {
        await seedAllStates();
        expect(await names({ filter: stateFilter('none', 'active') })).toEqual([
            'active',
            'no-login',
        ]);
        expect(await names({ filter: { portalState: { notEq: 'invited' } } })).toEqual([
            'active',
            'no-login',
            'verified',
        ]);
    });

    it('the states partition the visible rows, so view counts add up', async () => {
        await seedAllStates();
        const counts = await Promise.all(
            ['none', 'invited', 'verified', 'active'].map(
                async s =>
                    (await service.findVisiblePage(ctx, { filter: stateFilter(s), take: 0 }))
                        .totalItems,
            ),
        );
        expect(counts).toEqual([1, 3, 1, 1]);
        expect((await service.findVisiblePage(ctx, { take: 0 })).totalItems).toBe(6);
    });

    it('sorts none, invited, verified, active in either direction', async () => {
        await seedAllStates();
        const sorted = async (dir: 'ASC' | 'DESC') =>
            (
                await service.findVisiblePage(ctx, { sort: { portalState: dir }, take: 50 })
            ).items.map(c => c.shortName);
        const asc = await sorted('ASC');
        expect(asc[0]).toBe('no-login');
        expect(asc[asc.length - 1]).toBe('active');
        expect((await sorted('DESC'))[0]).toBe('active');
    });

    it('a revoked login reads as none, whichever of customer and user was deleted', async () => {
        await login(await counterparty('revoked'), {
            verified: true,
            password: true,
            customerDeleted: true,
            userDeleted: true,
        });
        await login(await counterparty('customer-gone'), {
            verified: true,
            password: true,
            customerDeleted: true,
        });
        await login(await counterparty('user-gone'), {
            verified: true,
            password: true,
            userDeleted: true,
        });
        expect(await names({ filter: stateFilter('none') })).toEqual([
            'customer-gone',
            'revoked',
            'user-gone',
        ]);
    });

    it('with a revoked and a live login the live one decides', async () => {
        const id = await counterparty('regranted');
        await login(id, {
            verified: true,
            password: true,
            signedIn: true,
            customerDeleted: true,
            userDeleted: true,
        });
        await login(id, {});
        expect(await names({ filter: stateFilter('invited') })).toEqual(['regranted']);
    });

    it('a signed-in account counts as active even without a stored password hash', async () => {
        await login(await counterparty('sso'), { verified: true, signedIn: true });
        expect(await names({ filter: stateFilter('active') })).toEqual(['sso']);
    });

    it('a counterparty outside the caller scope is absent from the list and the counts', async () => {
        await login(await counterparty('mine', 'branch-a'), {
            verified: true,
            password: true,
            signedIn: true,
        });
        await login(await counterparty('theirs', 'branch-b'), {
            verified: true,
            password: true,
            signedIn: true,
        });
        scopeKind = 'department';
        expect(await names({ filter: stateFilter('active') })).toEqual(['mine']);
        expect(
            (await service.findVisiblePage(ctx, { filter: stateFilter('active'), take: 0 }))
                .totalItems,
        ).toBe(1);
    });

    it('an unknown state value matches nothing', async () => {
        await seedAllStates();
        expect(await names({ filter: stateFilter('bogus') })).toEqual([]);
    });
});
