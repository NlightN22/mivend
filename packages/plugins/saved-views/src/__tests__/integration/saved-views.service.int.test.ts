import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    CreateDateColumn,
    DataSource,
    EntityManager,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { SavedTableView } from '../../entities/saved-table-view.entity';
import { SavedViewsService } from '../../saved-views.service';

// VendureEntity needs a bootstrapped EntityIdStrategy, so tests use a plain TypeORM entity
// on the real production table shape instead of instantiating SavedTableView.
@Entity('saved_table_view')
@Index(['administratorId', 'pageKey'])
@Index(['pageKey'], { unique: true, where: '"isDefault" = true' })
class TestSavedTableView {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) pageKey!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'text' }) filters!: string;
    @Column({ type: 'simple-json' }) visibleColumns!: string[];
    @Column({ type: 'varchar', default: 'PERSONAL' }) scope!: string;
    @Column({ type: 'boolean', default: false }) isDefault!: boolean;
    @CreateDateColumn() createdAt!: Date;
}

interface TestCtx {
    activeUserId: string;
    canManage: boolean;
    manager?: EntityManager;
    userHasPermissions: () => boolean;
}

let dataSource: DataSource;
let service: SavedViewsService;

function ctxFor(userId: string, canManage = false): RequestContext {
    return {
        activeUserId: userId,
        userHasPermissions: () => canManage,
    } as unknown as RequestContext;
}

const { schema, extra } = testSchemaOptions('saved_views_service');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestSavedTableView],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: (ctx: TestCtx, entity: unknown) => {
            const manager = ctx.manager ?? dataSource.manager;
            return entity === SavedTableView
                ? manager.getRepository(TestSavedTableView)
                : { query: (sql: string, params: unknown[]) => manager.query(sql, params) };
        },
        withTransaction: (ctx: TestCtx, work: (tx: TestCtx) => Promise<unknown>) =>
            dataSource.transaction(manager => work({ ...ctx, manager })),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    const administratorService = {
        findOneByUserId: async (_ctx: RequestContext, userId: string) =>
            userId.startsWith('user-') ? { id: userId.replace('user-', 'admin-') } : null,
    } as unknown as AdministratorService;

    service = new SavedViewsService(connectionShim, administratorService);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestSavedTableView).clear();
});

const base = { pageKey: 'orders', filters: '{}', visibleColumns: ['code'] };
const idOf = (v: SavedTableView): string => String((v as unknown as { id: number }).id);
const defaultsOf = async (pageKey = 'orders'): Promise<number> =>
    dataSource.getRepository(TestSavedTableView).countBy({ pageKey, isDefault: true });

describe('SavedViewsService (integration, real Postgres)', () => {
    it('persists a saved view and returns it from myTableViews for its own administrator', async () => {
        await service.save(ctxFor('user-a'), {
            pageKey: 'orders',
            name: 'My processing orders',
            filters: '{"state":"PaymentAuthorized"}',
            visibleColumns: ['code', 'customer', 'state'],
        });

        const views = await service.findForCurrentAdministrator(ctxFor('user-a'), 'orders');
        expect(views).toHaveLength(1);
        expect(views[0].name).toBe('My processing orders');
    });

    it('never shows one administrator a saved view created by another', async () => {
        await service.save(ctxFor('user-a'), {
            pageKey: 'orders',
            name: 'Admin A view',
            filters: '{}',
            visibleColumns: ['code'],
        });

        const viewsForB = await service.findForCurrentAdministrator(ctxFor('user-b'), 'orders');
        expect(viewsForB).toHaveLength(0);
    });

    it('does not let another administrator delete a view they do not own', async () => {
        const created = await service.save(ctxFor('user-a'), {
            pageKey: 'orders',
            name: 'Admin A view',
            filters: '{}',
            visibleColumns: ['code'],
        });

        const deletedByB = await service.delete(
            ctxFor('user-b'),
            String((created as unknown as { id: number }).id),
        );
        expect(deletedByB).toBe(false);

        const stillThere = await service.findForCurrentAdministrator(ctxFor('user-a'), 'orders');
        expect(stillThere).toHaveLength(1);

        const deletedByA = await service.delete(
            ctxFor('user-a'),
            String((created as unknown as { id: number }).id),
        );
        expect(deletedByA).toBe(true);
    });
});

describe('shared table views (integration, real Postgres)', () => {
    it('lets an administrator without the permission neither create nor change a shared view', async () => {
        await expect(
            service.save(ctxFor('user-a'), { ...base, name: 'Team', scope: 'SHARED' }),
        ).rejects.toThrow();
        const shared = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'Team',
            scope: 'SHARED',
        });
        await expect(
            service.update(ctxFor('user-a'), { id: idOf(shared), name: 'x' }),
        ).rejects.toThrow();
        await expect(service.delete(ctxFor('user-a'), idOf(shared))).rejects.toThrow();
        await expect(service.setDefault(ctxFor('user-a'), idOf(shared), true)).rejects.toThrow();
        const [row] = await service.findForCurrentAdministrator(ctxFor('user-a'), 'orders');
        expect(row.name).toBe('Team');
    });

    it('shows a shared view to every administrator but a personal view only to its owner', async () => {
        await service.save(ctxFor('user-m', true), { ...base, name: 'Team', scope: 'SHARED' });
        await service.save(ctxFor('user-m', true), { ...base, name: 'Mine' });
        const forA = await service.findForCurrentAdministrator(ctxFor('user-a'), 'orders');
        expect(forA.map(v => v.name)).toEqual(['Team']);
        const forM = await service.findForCurrentAdministrator(ctxFor('user-m', true), 'orders');
        expect(forM.map(v => v.name).sort()).toEqual(['Mine', 'Team']);
        const otherList = await service.findForCurrentAdministrator(ctxFor('user-a'), 'products');
        expect(otherList).toHaveLength(0);
    });

    it('sets a new team default atomically, clearing the previous one', async () => {
        const first = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'One',
            scope: 'SHARED',
        });
        const second = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'Two',
            scope: 'SHARED',
        });
        await service.setDefault(ctxFor('user-m', true), idOf(first), true);
        await service.setDefault(ctxFor('user-m', true), idOf(second), true);
        const rows = await dataSource.getRepository(TestSavedTableView).findBy({ isDefault: true });
        expect(rows.map(r => r.name)).toEqual(['Two']);
        await service.setDefault(ctxFor('user-m', true), idOf(second), false);
        expect(await defaultsOf()).toBe(0);
    });

    it('keeps the default of one list untouched when another list gets its own', async () => {
        const orders = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'O',
            scope: 'SHARED',
        });
        const products = await service.save(ctxFor('user-m', true), {
            ...base,
            pageKey: 'products',
            name: 'P',
            scope: 'SHARED',
        });
        await service.setDefault(ctxFor('user-m', true), idOf(orders), true);
        await service.setDefault(ctxFor('user-m', true), idOf(products), true);
        expect(await defaultsOf('orders')).toBe(1);
        expect(await defaultsOf('products')).toBe(1);
    });

    it('never makes a personal view a default', async () => {
        const mine = await service.save(ctxFor('user-m', true), { ...base, name: 'Mine' });
        expect(await service.setDefault(ctxFor('user-m', true), idOf(mine), true)).toBeNull();
        expect(await defaultsOf()).toBe(0);
    });

    it('leaves exactly one default when several managers set a default concurrently', async () => {
        const views = await Promise.all(
            ['A', 'B', 'C', 'D'].map(name =>
                service.save(ctxFor('user-m', true), { ...base, name, scope: 'SHARED' }),
            ),
        );
        await Promise.all(
            views.map(v => service.setDefault(ctxFor('user-m', true), idOf(v), true)),
        );
        expect(await defaultsOf()).toBe(1);
    });

    it('updates name and state in one call and keeps the view id and default flag', async () => {
        const shared = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'Team',
            scope: 'SHARED',
        });
        await service.setDefault(ctxFor('user-m', true), idOf(shared), true);
        const updated = await service.update(ctxFor('user-m', true), {
            id: idOf(shared),
            name: 'Team v2',
            filters: '{"a":1}',
        });
        expect(updated).toMatchObject({ name: 'Team v2', filters: '{"a":1}', isDefault: true });
        expect(idOf(updated as SavedTableView)).toBe(idOf(shared));
    });

    it('does not let another administrator update a personal view they do not own', async () => {
        const mine = await service.save(ctxFor('user-a'), { ...base, name: 'Mine' });
        expect(
            await service.update(ctxFor('user-b'), { id: idOf(mine), name: 'Hijack' }),
        ).toBeNull();
        const [row] = await service.findForCurrentAdministrator(ctxFor('user-a'), 'orders');
        expect(row.name).toBe('Mine');
    });

    it('lets a manager delete a shared view, which also drops its default', async () => {
        const shared = await service.save(ctxFor('user-m', true), {
            ...base,
            name: 'Team',
            scope: 'SHARED',
        });
        await service.setDefault(ctxFor('user-m', true), idOf(shared), true);
        expect(await service.delete(ctxFor('user-m', true), idOf(shared))).toBe(true);
        expect(await defaultsOf()).toBe(0);
    });
});
