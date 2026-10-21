import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntitySchema, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import type { AccessScope } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ReservationReconciliationIssue } from '../../entities/reservation-reconciliation-issue.entity';
import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';

@Entity('reservation_reconciliation_issue')
class TestIssue {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) issueType!: string;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar', nullable: true }) productVariantId!: string | null;
    @Column({ type: 'int', nullable: true }) localQuantity!: number | null;
    @Column({ type: 'int', nullable: true }) erpQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) externalProductId!: string | null;
    @Column({ type: 'varchar' }) orderEntityId!: string;
    @Column({ type: 'timestamp' }) detectedAt!: Date;
    @Column({ type: 'varchar', default: 'open' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) resolution!: string | null;
}

@Entity('order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ name: 'customFieldsCounterpartyid', type: 'varchar', nullable: true })
    counterpartyId!: string | null;
    @Column({ name: 'customFieldsTradingpointid', type: 'varchar', nullable: true })
    tradingPointId!: string | null;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
}

const counterpartySchema = new EntitySchema({
    name: 'counterparty',
    target: Counterparty,
    columns: {
        id: { type: Number, primary: true, generated: true },
        erpId: { type: String },
        assignedManagerId: { type: String, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

const { schema, extra } = testSchemaOptions('reservation_recon_scope');
let dataSource: DataSource;
let service: ReservationReconciliationIssueService;
let scope: AccessScope;
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestIssue, TestOrder, TestTeamMember, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE trading_point (id serial, "servicingBranchId" varchar)`);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === ReservationReconciliationIssue
                ? dataSource.getRepository(TestIssue)
                : dataSource.getRepository(entity as never),
    } as unknown as TransactionalConnection;
    const accessScope = new AccessScopeService({} as never, {} as never, {} as never);
    accessScope.resolveOrderScope = async () => scope;
    service = new ReservationReconciliationIssueService(connection, {} as never, accessScope, {
        getGlobalDefaultBranchId: async () => 'branch-a',
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE reservation_reconciliation_issue, "order", counterparty, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    const cp = async (erpId: string, manager: string, branch: string | null): Promise<string> => {
        const [row]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "branchId") VALUES ($1, $2, $3) RETURNING id`,
            [erpId, manager, branch],
        );
        return String(row.id);
    };
    const orders: Array<[string, string]> = [
        ['issue-granted', await cp('cp-1', 'm-1', 'branch-b')],
        ['issue-other', await cp('cp-2', 'm-2', 'branch-b')],
        ['issue-branchless', await cp('cp-3', 'm-3', null)],
    ];
    for (const [orderEntityId, counterpartyId] of orders) {
        const saved = await dataSource.getRepository(TestOrder).save({ counterpartyId });
        await dataSource.getRepository(TestIssue).save({
            issueType: 'QUANTITY_MISMATCH',
            orderId: String(saved.id),
            orderEntityId,
            detectedAt: new Date(),
        });
    }
});

const open = async (): Promise<string[]> =>
    (await service.findOpen(ctx)).items.map(i => i.orderEntityId).sort();

describe('reservation reconciliation scope SQL with grants (#123, real Postgres)', () => {
    it('shows branch (incl. default-branch) and granted-manager issues, hides the rest', async () => {
        scope = { kind: 'department', branchId: 'branch-a', grantedManagerIds: ['m-1'] };
        expect(await open()).toEqual(['issue-branchless', 'issue-granted']);
    });

    it('an empty grant set (expired or revoked) shows only the default-branch issue', async () => {
        scope = { kind: 'department', branchId: 'branch-a', grantedManagerIds: [] };
        expect(await open()).toEqual(['issue-branchless']);
    });

    it('an own-scoped caller sees exactly the granted manager', async () => {
        scope = { kind: 'own', administratorId: 'x', grantedManagerIds: ['m-2'] };
        expect(await open()).toEqual(['issue-other']);
    });
});
