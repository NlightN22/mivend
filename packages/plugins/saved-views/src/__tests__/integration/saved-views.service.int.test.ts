import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    CreateDateColumn,
    DataSource,
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
import { SavedViewsService } from '../../saved-views.service';

// Mirrors plugin-acquiring/plugin-documents' integration test approach: VendureEntity needs a
// bootstrapped EntityIdStrategy, so we stand in with a plain TypeORM entity against the real
// production table shape rather than instantiating the real SavedTableView class.
@Entity('saved_table_view')
@Index(['administratorId', 'pageKey'])
class TestSavedTableView {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) pageKey!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'text' }) filters!: string;
    @Column({ type: 'simple-json' }) visibleColumns!: string[];
    @CreateDateColumn() createdAt!: Date;
}

let dataSource: DataSource;
let service: SavedViewsService;

function ctxFor(userId: string): RequestContext {
    return { activeUserId: userId } as unknown as RequestContext;
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
        getRepository: () => dataSource.getRepository(TestSavedTableView),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    const administratorService = {
        findOneByUserId: async (_ctx: RequestContext, userId: string) =>
            userId === 'user-a'
                ? { id: 'admin-a' }
                : userId === 'user-b'
                  ? { id: 'admin-b' }
                  : null,
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
