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
import type { ListQueryBuilder, RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator, User } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { AdministratorActivationService } from '../../../administrator-activation.service';
import { PendingErpUserService } from '../../../pending-erp-user.service';
import { UserEnrichmentService } from '../../../user-enrichment.service';

// Real end-to-end chain for issue #119's own scenario request: a 1C user arrives (active or
// inactive), gets queued as a PendingErpUser candidate (or not), and — once linked — gets
// deactivated/reactivated for real. `user-enrichment.service.test.ts`/`administrator-activation.
// service.test.ts` already prove the *decision logic* against a fully mocked repo; this file
// proves what mocks can't: the real Postgres writes (PendingErpUser's unique-erpId-backed
// upsert, Administrator.customFields.erpId's embedded-column write, deletedAt actually landing on
// both Administrator and User rows).
//
// Administrator/User are real @vendure/core VendureEntity classes — they rely on an
// EntityIdStrategy registered during a full Vendure bootstrap() to generate their primary column,
// so (same constraint as counterparty.access-scope.test.ts/documents.service.int.test.ts) this
// hand-rolls TypeORM entities mirroring their production shape and shims TransactionalConnection
// to route the REAL classes (used by import identity, not by structural TypeORM metadata) to
// these mirror tables — the real service code under test is otherwise untouched.
//
// AdministratorService.softDelete (the real mechanism AdministratorActivationService.syncFromErp/
// setActive delegates to for the *deactivate* half) is a heavy Vendure-core service with its own
// deep DI graph (password hashing, native auth methods) that this repo has no precedent for
// constructing outside a full app bootstrap anywhere — substituted here with a stub that performs
// the same real DB write softDelete is documented (backend-plugin-rules skill, Decision 1 of
// issue #119) to perform, so the *observable* DB state our own downstream code reacts to is still
// real. The *reactivate* half needs no such stub — AdministratorActivationService's own
// `reactivate` private method writes directly via the shimmed repos, exercised unmodified.
// Deliberately NOT covered here: AdministratorProvisioningService.createFromPending (needs real
// AdministratorService.create + UserService.setPasswordResetToken, the same class of heavy,
// no-precedent dependency) and the real Vendure login/password-reset mechanics themselves — see
// this session's own test-design report for the full reasoning.

// A real TypeORM embedded column (not a plain getter/setter) — the real service code both
// mutates `admin.customFields.erpId` as a plain property AND queries `where: { customFields: {
// erpId } }` through TypeORM's own query builder, which requires genuine embedded-column
// metadata to resolve, not just a same-shaped JS object.
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

@Entity('pending_erp_user')
class TestPendingErpUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
    @Column({ type: 'varchar', nullable: true }) email!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'timestamp' }) firstSeenAt!: Date;
    @Column({ type: 'timestamp' }) lastSeenAt!: Date;
}

const mockCtx = {} as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_user_lifecycle');

let dataSource: DataSource;

function makeConnectionShim(): TransactionalConnection {
    return {
        getRepository: (_ctx: unknown, entity: unknown) => {
            if (entity === Administrator) return dataSource.getRepository(TestAdministrator);
            if (entity === User) return dataSource.getRepository(TestUser);
            return dataSource.getRepository(TestPendingErpUser);
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
        entities: [TestAdministrator, TestUser, TestPendingErpUser],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

afterEach(async () => {
    // Plain DELETE, not `.clear()` (TRUNCATE) — Postgres refuses to TRUNCATE a table referenced
    // by a FK unless every referencing table is truncated in the same statement. FK order:
    // administrator references user, so it's deleted first.
    await dataSource.getRepository(TestPendingErpUser).createQueryBuilder().delete().execute();
    await dataSource.getRepository(TestAdministrator).createQueryBuilder().delete().execute();
    await dataSource.getRepository(TestUser).createQueryBuilder().delete().execute();
});

describe('UserEnrichmentService.linkAndEnrich (real DB)', () => {
    let pendingErpUserService: PendingErpUserService;
    let service: UserEnrichmentService;

    beforeAll(() => {
        const connection = makeConnectionShim();
        pendingErpUserService = new PendingErpUserService(
            connection,
            {} as unknown as ListQueryBuilder, // only findAllPaginated needs this; unused here
        );
        service = new UserEnrichmentService(connection, pendingErpUserService, {
            syncFromErp: vi.fn(),
        } as unknown as AdministratorActivationService);
    });

    it('creates a real PendingErpUser row for an active, unlinked user with no email', async () => {
        await service.linkAndEnrich(mockCtx, {
            erpId: 'user-active-1',
            fullName: 'Active Person',
            isActive: true,
        });

        const row = await dataSource
            .getRepository(TestPendingErpUser)
            .findOne({ where: { erpId: 'user-active-1' } });
        expect(row).toMatchObject({ erpId: 'user-active-1', fullName: 'Active Person' });
    });

    it('never creates a PendingErpUser row for an inactive/deleted, unlinked user', async () => {
        const result = await service.linkAndEnrich(mockCtx, {
            erpId: 'user-inactive-1',
            fullName: 'Deleted Person',
            isActive: false,
        });

        expect(result).toBeNull();
        const row = await dataSource
            .getRepository(TestPendingErpUser)
            .findOne({ where: { erpId: 'user-inactive-1' } });
        expect(row).toBeNull();
    });

    it('deletes an already-queued PendingErpUser row once 1C reports the same user inactive', async () => {
        await service.linkAndEnrich(mockCtx, { erpId: 'user-flip-1', isActive: true });
        expect(
            await dataSource
                .getRepository(TestPendingErpUser)
                .findOne({ where: { erpId: 'user-flip-1' } }),
        ).not.toBeNull();

        await service.linkAndEnrich(mockCtx, { erpId: 'user-flip-1', isActive: false });

        expect(
            await dataSource
                .getRepository(TestPendingErpUser)
                .findOne({ where: { erpId: 'user-flip-1' } }),
        ).toBeNull();
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
            .getRepository(TestPendingErpUser)
            .find({ where: { erpId: 'user-repeat-1' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].fullName).toBe('Second');
    });

    it('links by email match, writes customFields.erpId for real, and removes the pending row', async () => {
        const admin = await dataSource
            .getRepository(TestAdministrator)
            .save({ firstName: 'A', lastName: 'B', emailAddress: 'match@example.com' });
        await dataSource.getRepository(TestPendingErpUser).save({
            erpId: 'user-match-1',
            email: 'match@example.com',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
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
        expect(
            await dataSource
                .getRepository(TestPendingErpUser)
                .findOne({ where: { erpId: 'user-match-1' } }),
        ).toBeNull();
    });
});

describe('AdministratorActivationService.setActive (real DB)', () => {
    let service: AdministratorActivationService;
    let softDelete: Mock<[ctx: unknown, id: number], Promise<void>>;

    beforeAll(() => {
        const connection = makeConnectionShim();
        // Stands in for the real AdministratorService.softDelete (see file header) — performs
        // the same real write it's documented to perform, so downstream reads through this same
        // shimmed connection observe genuine DB state.
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
