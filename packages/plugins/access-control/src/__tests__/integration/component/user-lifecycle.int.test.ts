import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type {
    EventBus,
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Administrator, User } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { AdministratorActivationService } from '../../../administrator-activation.service';
import { ErpUserService } from '../../../erp-user.service';
import { UserEnrichmentService } from '../../../user-enrichment.service';

// Vendure's real Administrator/User need bootstrap()'s EntityIdStrategy; use mirror tables.
// AdministratorService.softDelete is stubbed (heavy DI graph); the stub does the same DB write.

// Must be a real TypeORM embedded column, not a getter/setter: the query builder needs
// its metadata to resolve `where: { customFields: { erpId } }`.
class TestAdminCustomFields {
    @Column({ name: 'customFieldsErpid', type: 'varchar', nullable: true, unique: true })
    erpId!: string | null;

    @Column({ name: 'customFieldsDepartmentid', type: 'varchar', nullable: true })
    departmentId!: string | null;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) firstName!: string;
    @Column({ type: 'varchar' }) lastName!: string;
    @Column({ type: 'varchar' }) emailAddress!: string;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;

    @Column({ type: 'int', nullable: true })
    userId!: number | null;

    @Column(() => TestAdminCustomFields)
    customFields!: TestAdminCustomFields;

    @OneToOne(() => TestUser)
    @JoinColumn({ name: 'userId' })
    user?: TestUser;
}

@Entity('user')
class TestUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) identifier!: string;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
    @Column({ type: 'varchar', nullable: true }) email!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) positionErpId!: string | null;
    @Column({ type: 'timestamp' }) firstSeenAt!: Date;
    @Column({ type: 'timestamp' }) lastSeenAt!: Date;
    @Column({ type: 'varchar', default: 'unlinked' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) administratorId!: string | null;
    @Column({ type: 'boolean', nullable: true }) active!: boolean | null;
}

const mockCtx = {} as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_user_lifecycle');

let dataSource: DataSource;

function makeConnectionShim(): TransactionalConnection {
    return {
        getRepository: (_ctx: unknown, entity: unknown) => {
            if (entity === Administrator) return dataSource.getRepository(TestAdministrator);
            if (entity === User) return dataSource.getRepository(TestUser);
            return dataSource.getRepository(TestErpUser);
        },
    } as unknown as TransactionalConnection;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestAdministrator, TestUser, TestErpUser],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

afterEach(async () => {
    // Plain DELETE, not TRUNCATE: Postgres rejects truncating a FK-referenced table alone.
    // Delete order matters: administrator references user, so it goes first.
    await dataSource.getRepository(TestErpUser).createQueryBuilder().delete().execute();
    await dataSource.getRepository(TestAdministrator).createQueryBuilder().delete().execute();
    await dataSource.getRepository(TestUser).createQueryBuilder().delete().execute();
});

describe('UserEnrichmentService.linkAndEnrich (real DB)', () => {
    let erpUserService: ErpUserService;
    let service: UserEnrichmentService;
    let eventBus: { publish: ReturnType<typeof vi.fn> };

    beforeAll(() => {
        const connection = makeConnectionShim();
        erpUserService = new ErpUserService(
            connection,
            {} as unknown as ListQueryBuilder, // only findAllPaginated needs this; unused here
        );
        eventBus = { publish: vi.fn() };
        service = new UserEnrichmentService(
            connection,
            erpUserService,
            { syncFromErp: vi.fn() } as unknown as AdministratorActivationService,
            eventBus as unknown as EventBus,
        );
    });

    it('creates a real, unlinked ErpUser row for an active, unlinked user with no email', async () => {
        await service.linkAndEnrich(mockCtx, {
            erpId: 'user-active-1',
            fullName: 'Active Person',
            isActive: true,
        });

        const row = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-active-1' } });
        expect(row).toMatchObject({
            erpId: 'user-active-1',
            fullName: 'Active Person',
            status: 'unlinked',
        });
    });

    // Row must be kept, never deleted; active:false excludes it from the Pending list
    // and from the 'Create Administrator' action.
    it('creates the ErpUser row flagged active:false for an inactive/deleted, unlinked user — never surfaced as a create-candidate', async () => {
        const result = await service.linkAndEnrich(mockCtx, {
            erpId: 'user-inactive-1',
            fullName: 'Deleted Person',
            isActive: false,
        });

        expect(result).toBeNull();
        const row = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-inactive-1' } });
        expect(row).toMatchObject({ erpId: 'user-inactive-1', status: 'unlinked', active: false });
    });

    it('keeps (never deletes) the ErpUser row once the ERP reports the same user inactive, just flips active:false', async () => {
        await service.linkAndEnrich(mockCtx, { erpId: 'user-flip-1', isActive: true });
        const beforeRow = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-flip-1' } });
        expect(beforeRow).toMatchObject({ active: true });

        await service.linkAndEnrich(mockCtx, { erpId: 'user-flip-1', isActive: false });

        const afterRow = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-flip-1' } });
        expect(afterRow).not.toBeNull();
        expect(afterRow).toMatchObject({ erpId: 'user-flip-1', active: false });
    });

    it('upserts, not duplicates, the same erpId processed twice (real unique constraint)', async () => {
        await service.linkAndEnrich(mockCtx, {
            erpId: 'user-repeat-1',
            fullName: 'First',
            isActive: true,
        });
        await service.linkAndEnrich(mockCtx, {
            erpId: 'user-repeat-1',
            fullName: 'Second',
            isActive: true,
        });

        const rows = await dataSource
            .getRepository(TestErpUser)
            .find({ where: { erpId: 'user-repeat-1' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].fullName).toBe('Second');
    });

    it('links by email match, writes customFields.erpId for real, and flips (never deletes) the ErpUser row to linked', async () => {
        const admin = await dataSource
            .getRepository(TestAdministrator)
            .save({ firstName: 'A', lastName: 'B', emailAddress: 'match@example.com' });
        await dataSource.getRepository(TestErpUser).save({
            erpId: 'user-match-1',
            email: 'match@example.com',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            status: 'unlinked',
        });

        const result = await service.linkAndEnrich(mockCtx, {
            erpId: 'user-match-1',
            email: 'match@example.com',
        });

        expect(result).not.toBeNull();
        const reloaded = await dataSource
            .getRepository(TestAdministrator)
            .findOne({ where: { id: admin.id } });
        expect(reloaded?.customFields?.erpId).toBe('user-match-1');
        const erpUserRow = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-match-1' } });
        expect(erpUserRow).not.toBeNull();
        expect(erpUserRow).toMatchObject({
            status: 'linked',
            administratorId: String(admin.id),
        });
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('flips to linked even when no ErpUser row existed yet (immediate email-match on first sight)', async () => {
        const admin = await dataSource
            .getRepository(TestAdministrator)
            .save({ firstName: 'A', lastName: 'B', emailAddress: 'first-sight@example.com' });

        await service.linkAndEnrich(mockCtx, {
            erpId: 'user-first-sight-1',
            email: 'first-sight@example.com',
        });

        const erpUserRow = await dataSource
            .getRepository(TestErpUser)
            .findOne({ where: { erpId: 'user-first-sight-1' } });
        expect(erpUserRow).toMatchObject({ status: 'linked', administratorId: String(admin.id) });
    });
});

describe('AdministratorActivationService.setActive (real DB)', () => {
    let service: AdministratorActivationService;
    let softDelete: Mock<[ctx: unknown, id: number], Promise<void>>;

    beforeAll(() => {
        const connection = makeConnectionShim();
        // Stub for AdministratorService.softDelete: performs the same real DB write,
        // so reads through the shimmed connection observe genuine state.
        softDelete = vi.fn(async (_ctx: unknown, id: number) => {
            const admin = await dataSource
                .getRepository(TestAdministrator)
                .findOne({ where: { id } });
            await dataSource.getRepository(TestAdministrator).update(id, { deletedAt: new Date() });
            if (admin?.userId) {
                await dataSource
                    .getRepository(TestUser)
                    .update(admin.userId, { deletedAt: new Date() });
            }
        });
        service = new AdministratorActivationService(
            connection,
            { softDelete } as unknown as import('@vendure/core').AdministratorService,
            {} as unknown as ListQueryBuilder, // only findDeactivated needs this; unused here
        );
    });

    async function seedActiveAdminWithUser(): Promise<{ adminId: number; userId: number }> {
        const user = await dataSource.getRepository(TestUser).save({ identifier: 'u@example.com' });
        const admin = await dataSource.getRepository(TestAdministrator).save({
            firstName: 'A',
            lastName: 'B',
            emailAddress: 'u@example.com',
            userId: user.id,
        });
        return { adminId: admin.id, userId: user.id };
    }

    it('deactivate: sets deletedAt on both Administrator and User rows for real', async () => {
        const { adminId, userId } = await seedActiveAdminWithUser();

        await service.setActive(mockCtx, adminId, false);

        const admin = await dataSource
            .getRepository(TestAdministrator)
            .findOne({ where: { id: adminId }, withDeleted: true });
        const user = await dataSource
            .getRepository(TestUser)
            .findOne({ where: { id: userId }, withDeleted: true });
        expect(admin?.deletedAt).not.toBeNull();
        expect(user?.deletedAt).not.toBeNull();
    });

    it('reactivate: clears deletedAt on both Administrator and User rows for real (no stub involved)', async () => {
        const { adminId, userId } = await seedActiveAdminWithUser();
        await service.setActive(mockCtx, adminId, false);

        await service.setActive(mockCtx, adminId, true);

        const admin = await dataSource
            .getRepository(TestAdministrator)
            .findOne({ where: { id: adminId }, withDeleted: true });
        const user = await dataSource
            .getRepository(TestUser)
            .findOne({ where: { id: userId }, withDeleted: true });
        expect(admin?.deletedAt).toBeNull();
        expect(user?.deletedAt).toBeNull();
    });

    it('deactivating twice is idempotent — softDelete is not called a second time, row stays deactivated', async () => {
        const { adminId } = await seedActiveAdminWithUser();

        await service.setActive(mockCtx, adminId, false);
        softDelete.mockClear();
        await service.setActive(mockCtx, adminId, false);

        expect(softDelete).not.toHaveBeenCalled();
        const admin = await dataSource
            .getRepository(TestAdministrator)
            .findOne({ where: { id: adminId }, withDeleted: true });
        expect(admin?.deletedAt).not.toBeNull();
    });
});
