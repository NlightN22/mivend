import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    EntityManager,
    Index,
    IsNull,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { Contract, ContractService } from '@mivend/plugin-counterparty';
import { NumberingService } from '@mivend/plugin-numbering';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { ContractProformaInvoiceService } from '../../contract-proforma-invoice.service';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { SettlementEntryService } from '../../settlement-entry.service';

@Entity('proforma_invoice')
@Index(['counterpartyId', 'idempotencyKey'], {
    unique: true,
    where: '"idempotencyKey" IS NOT NULL',
})
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) orderId!: number | null;
    @Column({ type: 'varchar' }) number!: string;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'jsonb', default: () => "'[]'" }) lines!: unknown[];
    @Column({ type: 'int', default: 1 }) version!: number;
    @Column({ type: 'int', nullable: true }) supersededById!: number | null;
    @Column({ type: 'timestamptz', default: () => 'now()' }) issuedAt!: Date;
    @Column({ type: 'timestamptz', default: () => 'now()' }) dueDate!: Date;
    @Column({ type: 'varchar', default: 'order-placed' }) kind!: string;
    @Column({ type: 'varchar', nullable: true }) contractId!: string | null;
    @Column({ type: 'varchar', nullable: true }) contractName!: string | null;
    @Column({ type: 'varchar', nullable: true }) idempotencyKey!: string | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) organizationId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar', nullable: true }) currency!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'boolean', nullable: true }) isCustomerContract!: boolean | null;
}

@Entity('organization_requisites')
class TestOrganization {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
}

@Entity('settlement_entry')
class TestSettlementEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) organizationId!: number | null;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'int', nullable: true }) sourcePaymentId!: number | null;
    @Column({ type: 'int', nullable: true }) sourceRefundId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'boolean', default: false }) reconciled!: boolean;
    @Column({ type: 'int', nullable: true }) allocatedOrderId!: number | null;
    @Column({ type: 'int', nullable: true }) allocationAmount!: number | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

const ENTITY_MAP = new Map<unknown, unknown>([
    [ProformaInvoice, TestProformaInvoice],
    [Contract, TestContract],
    [SettlementEntry, TestSettlementEntry],
]);

let dataSource: DataSource;
let service: ContractProformaInvoiceService;
let settlement: SettlementEntryService;
let published: unknown[];
let callerCounterparty: string | null;
const { schema, extra } = testSchemaOptions('contract_proforma');
const ctx = { channel: { defaultCurrencyCode: 'RUB' } } as unknown as RequestContext;
type ManagedCtx = { __manager?: EntityManager };

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProformaInvoice, TestContract, TestOrganization, TestSettlementEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SEQUENCE mivend_number_seq_proforma_invoice`);
    const connection = {
        getRepository: (c: ManagedCtx, entity: unknown) => {
            const manager = c.__manager ?? dataSource.manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager.query(sql, params) };
            }
            const mapped = ENTITY_MAP.get(entity);
            if (!mapped) throw new Error(`Unmapped entity ${String(entity)}`);
            return manager.getRepository(mapped as typeof TestProformaInvoice);
        },
        withTransaction: (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager => work({ ...c, __manager: manager } as never)),
    } as unknown as TransactionalConnection;
    service = new ContractProformaInvoiceService(
        connection,
        { findOneByUserId: async () => undefined } as never,
        { getCounterpartyIdForUser: async () => callerCounterparty } as never,
        new ContractService(connection),
        new NumberingService(connection, { instanceNumberCode: '100' }),
        { resolveEffective: async () => ({ proformaPaymentTermDays: 5 }) } as never,
        { publish: vi.fn(async (event: unknown) => published.push(event)) } as never,
    );
    settlement = new SettlementEntryService(connection, new ProformaInvoiceService(connection));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let ownContractId: string;
let inactiveContractId: string;
let foreignContractId: string;

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE proforma_invoice, contract, organization_requisites, settlement_entry RESTART IDENTITY',
    );
    published = [];
    callerCounterparty = '1';
    await dataSource.getRepository(TestOrganization).save({ erpId: 'org-a' });
    const contract = (erpId: string, counterpartyId: string, isActive: boolean) => ({
        erpId,
        counterpartyId,
        organizationId: 'org-a',
        name: `Contract ${erpId}`,
        currency: 'RUB',
        isActive,
        isCustomerContract: true,
    });
    const saved = await dataSource
        .getRepository(TestContract)
        .save([
            contract('own', '1', true),
            contract('own-old', '1', false),
            contract('alien', '2', true),
        ]);
    [ownContractId, inactiveContractId, foreignContractId] = saved.map(c => String(c.id));
});

const issue = (
    contractId: string,
    mode: 'debt-repayment' | 'advance',
    key: string,
    amount = 6_000_000,
) => service.issue(ctx, { contractId, mode, amount, idempotencyKey: key });
const rows = () => dataSource.getRepository(TestProformaInvoice).find({ order: { id: 'ASC' } });

describe('ContractProformaInvoiceService (real Postgres)', () => {
    it('issues debt and advance proformas for an own contract with sequence numbers', async () => {
        await issue(ownContractId, 'debt-repayment', 'key-debt-0001');
        await issue(ownContractId, 'advance', 'key-adv-00001', 1_500_000);

        const [debt, advance] = await rows();
        expect(debt).toMatchObject({
            orderId: null,
            kind: 'debt-repayment',
            status: 'issued',
            organizationId: 1,
            counterpartyId: 1,
            amount: 6_000_000,
            contractId: ownContractId,
            contractName: 'Contract own',
        });
        expect(advance).toMatchObject({ kind: 'advance', amount: 1_500_000 });
        expect(debt.number).toBe('1000000001');
        expect(advance.number).toBe('1000000002');
        expect(published).toHaveLength(2);
    });

    it('rejects a foreign or inactive contract', async () => {
        await expect(issue(foreignContractId, 'advance', 'key-foreign-1')).rejects.toThrow();
        await expect(issue(inactiveContractId, 'advance', 'key-inactive')).rejects.toThrow();
        callerCounterparty = null;
        await expect(issue(ownContractId, 'advance', 'key-no-cp-01')).rejects.toThrow();
        expect(await rows()).toHaveLength(0);
    });

    it('returns one document for a repeated or concurrent idempotency key', async () => {
        const [a, b] = await Promise.all([
            issue(ownContractId, 'debt-repayment', 'key-double-01'),
            issue(ownContractId, 'debt-repayment', 'key-double-01'),
        ]);
        const c = await issue(ownContractId, 'debt-repayment', 'key-double-01');

        expect(new Set([a.id, b.id, c.id]).size).toBe(1);
        expect(await rows()).toHaveLength(1);
        expect(published).toHaveLength(1);
    });

    it('is never picked by payment allocation', async () => {
        const contractDoc = await issue(ownContractId, 'debt-repayment', 'key-alloc-001', 5000);
        const orderDoc = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 7,
            number: '1000007-01-1',
            organizationId: 1,
            counterpartyId: 1,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const capture = (proformaInvoiceId: number, id: number) =>
            dataSource.transaction(manager =>
                settlement.allocate(
                    { __manager: manager } as unknown as RequestContext,
                    {
                        id,
                        proformaInvoiceId,
                        amount: 3000,
                        currencyCode: 'RUB',
                    } as PaymentAttempt,
                ),
            );

        await capture(orderDoc.id, 1);
        await capture(Number(contractDoc.id), 2);

        const entries = dataSource.getRepository(TestSettlementEntry);
        expect(
            await entries.find({ where: { proformaInvoiceId: Number(contractDoc.id) } }),
        ).toHaveLength(0);
        expect(await entries.findOneByOrFail({ proformaInvoiceId: orderDoc.id })).toMatchObject({
            amount: 1000,
        });
        const advance = await entries.find({ where: { proformaInvoiceId: IsNull() } });
        expect(advance.reduce((sum, e) => sum + e.amount, 0)).toBe(5000);
        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: Number(contractDoc.id) });
        expect(stored.status).toBe('issued');
    });
});
