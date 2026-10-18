import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type {
    EventBus,
    ListQueryBuilder,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { AdministratorActivationService } from '../../../administrator-activation.service';
import { ErpUserService } from '../../../erp-user.service';
import { UserEnrichmentService } from '../../../user-enrichment.service';

class TestAdminCustomFields {
    @Column({ name: 'customFieldsErpid', type: 'varchar', nullable: true, unique: true })
    erpId!: string | null;

    @Column({ name: 'customFieldsDepartmentid', type: 'varchar', nullable: true })
    departmentId!: string | null;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) firstName!: string;
    @Column({ type: 'varchar' }) lastName!: string;
    @Column({ type: 'varchar' }) emailAddress!: string;
    @DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column(() => TestAdminCustomFields) customFields!: TestAdminCustomFields;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn() id!: number;
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

const ctx = {} as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_erp_user_position');
let dataSource: DataSource;
let erpUserService: ErpUserService;
let service: UserEnrichmentService;

const erpUsers = () => dataSource.getRepository(TestErpUser);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestAdministrator, TestErpUser],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === Administrator
                ? dataSource.getRepository(TestAdministrator)
                : dataSource.getRepository(TestErpUser),
    } as unknown as TransactionalConnection;
    erpUserService = new ErpUserService(connection, {} as unknown as ListQueryBuilder);
    service = new UserEnrichmentService(
        connection,
        erpUserService,
        { syncFromErp: vi.fn() } as unknown as AdministratorActivationService,
        { publish: vi.fn() } as unknown as EventBus,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

afterEach(async () => {
    await erpUsers().createQueryBuilder().delete().execute();
    await dataSource.getRepository(TestAdministrator).createQueryBuilder().delete().execute();
});

describe('ERP user position (real DB, #251)', () => {
    it('stores the position on an unlinked candidate with no Administrator', async () => {
        await service.linkAndEnrich(ctx, {
            erpId: 'user-1',
            email: 'nobody@example.com',
            positionErpId: 'pos-1',
            isActive: true,
        });
        expect(await erpUsers().findOne({ where: { erpId: 'user-1' } })).toMatchObject({
            status: 'unlinked',
            positionErpId: 'pos-1',
        });
    });

    it('stores the position on the linked row, keeps it when omitted, clears it on null', async () => {
        await dataSource.getRepository(TestAdministrator).save({
            firstName: 'A',
            lastName: 'B',
            emailAddress: 'a@example.com',
            customFields: { erpId: 'user-2', departmentId: null },
        });

        await service.linkAndEnrich(ctx, { erpId: 'user-2', positionErpId: 'pos-2' });
        expect(await erpUsers().findOne({ where: { erpId: 'user-2' } })).toMatchObject({
            status: 'linked',
            positionErpId: 'pos-2',
        });

        await service.linkAndEnrich(ctx, { erpId: 'user-2' });
        expect((await erpUsers().findOneBy({ erpId: 'user-2' }))?.positionErpId).toBe('pos-2');

        await service.linkAndEnrich(ctx, { erpId: 'user-2', positionErpId: null });
        expect((await erpUsers().findOneBy({ erpId: 'user-2' }))?.positionErpId).toBeNull();
    });

    it('findPositionErpIds maps only the requested erpIds that carry a position', async () => {
        const now = new Date();
        await erpUsers().save([
            { erpId: 'u-a', positionErpId: 'pos-a', firstSeenAt: now, lastSeenAt: now },
            { erpId: 'u-b', positionErpId: null, firstSeenAt: now, lastSeenAt: now },
            { erpId: 'u-c', positionErpId: 'pos-c', firstSeenAt: now, lastSeenAt: now },
        ]);
        const map = await erpUserService.findPositionErpIds(ctx, ['u-a', 'u-b', 'u-missing']);
        expect([...map.entries()]).toEqual([['u-a', 'pos-a']]);
    });

    it('setPositionIfExists never creates a row for an unseen erpId', async () => {
        await erpUserService.setPositionIfExists(ctx, 'u-unseen', 'pos-1');
        expect(await erpUsers().count()).toBe(0);
    });
});
