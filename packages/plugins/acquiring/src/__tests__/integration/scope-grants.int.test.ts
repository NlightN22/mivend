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

import { PaymentReconciliationIssue } from '../../entities/payment-reconciliation-issue.entity';
import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentReconciliationIssueService } from '../../payment-reconciliation-issue.service';
import { ProformaInvoiceVisibilityService } from '../../proforma-invoice-visibility.service';

@Entity('payment_reconciliation_issue')
class TestIssue {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) issueType!: string;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'timestamp' }) detectedAt!: Date;
    @Column({ type: 'varchar', default: 'open' }) status!: string;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
}

const invoiceSchema = new EntitySchema({
    name: 'proforma_invoice',
    target: ProformaInvoice,
    columns: {
        id: { type: Number, primary: true, generated: true },
        counterpartyId: { type: Number },
        orderId: { type: Number, nullable: true },
        branchId: { type: String, nullable: true },
    },
});

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

const { schema, extra } = testSchemaOptions('acquiring_scope_grants');
let dataSource: DataSource;
let visibility: ProformaInvoiceVisibilityService;
let issues: PaymentReconciliationIssueService;
let scope: AccessScope;
const ctx = {} as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestIssue, TestTeamMember, invoiceSchema, counterpartySchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE trading_point (id serial, "servicingBranchId" varchar)`);
    await dataSource.query(
        `CREATE TABLE "order" (id serial PRIMARY KEY, "customFieldsTradingpointid" varchar)`,
    );
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === PaymentReconciliationIssue
                ? dataSource.getRepository(TestIssue)
                : dataSource.getRepository(entity as never),
    } as unknown as TransactionalConnection;
    const accessScope = new AccessScopeService({} as never, {} as never, {} as never);
    accessScope.resolveProformaInvoiceScope = async () => scope;
    visibility = new ProformaInvoiceVisibilityService(connection, accessScope, {
        getGlobalDefaultBranchId: async () => null,
    } as never);
    issues = new PaymentReconciliationIssueService(connection, {} as never, visibility);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE payment_reconciliation_issue, proforma_invoice, counterparty, counterparty_team_member RESTART IDENTITY CASCADE',
    );
    const invoice = async (manager: string, branchId: string | null): Promise<number> => {
        const [cp]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO counterparty ("erpId", "assignedManagerId", "branchId") VALUES ($1, $2, $3) RETURNING id`,
            [`cp-${manager}`, manager, branchId],
        );
        const [inv]: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO proforma_invoice ("counterpartyId", "branchId") VALUES ($1, $2) RETURNING id`,
            [cp.id, branchId],
        );
        await dataSource.getRepository(TestIssue).save({
            issueType: 'AMOUNT_MISMATCH',
            proformaInvoiceId: inv.id,
            detectedAt: new Date(),
        });
        return inv.id;
    };
    await invoice('m-1', 'branch-b');
    await invoice('m-2', 'branch-b');
    await invoice('m-3', 'branch-a');
});

async function scopedInvoiceBranches(): Promise<Array<string | null>> {
    const qb = dataSource
        .getRepository(ProformaInvoice)
        .createQueryBuilder('proformaInvoice')
        .leftJoin(
            Counterparty,
            'counterparty',
            'counterparty.id::text = "proformaInvoice"."counterpartyId"::text',
        );
    visibility.applyScope(qb, { ...scope, defaultBranchId: null });
    return (await qb.orderBy('proformaInvoice.id').getMany()).map(i => i.branchId);
}

const openIssueInvoices = async (): Promise<number[]> =>
    (await issues.findOpen(ctx)).items.map(i => i.proformaInvoiceId as number).sort();

describe('proforma invoice and payment scope SQL with grants (#123, real Postgres)', () => {
    it('a branch-scoped caller gets the branch plus the granted manager, nothing else', async () => {
        scope = { kind: 'department', branchId: 'branch-a', grantedManagerIds: ['m-1'] };
        expect(await scopedInvoiceBranches()).toEqual(['branch-b', 'branch-a']);
        expect(await openIssueInvoices()).toEqual([1, 3]);
    });

    it('without a grant (none, expired or revoked) only the branch rows remain', async () => {
        scope = { kind: 'department', branchId: 'branch-a', grantedManagerIds: [] };
        expect(await scopedInvoiceBranches()).toEqual(['branch-a']);
        expect(await openIssueInvoices()).toEqual([3]);
    });

    it('an own-scoped caller sees exactly the granted manager', async () => {
        scope = { kind: 'own', administratorId: 'x', grantedManagerIds: ['m-2'] };
        expect(await scopedInvoiceBranches()).toEqual(['branch-b']);
        expect(await openIssueInvoices()).toEqual([2]);
    });
});
