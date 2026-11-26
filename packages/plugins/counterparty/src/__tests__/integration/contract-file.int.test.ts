import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn, type EntityManager } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContractFileService } from '../../contract-file/contract-file.service';
import { UNSCANNED_ACTIVE_CONTRACT_SQL } from '../../contract-file/contract-file-sql';
import type { CounterpartyService } from '../../counterparty.service';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy, so hand-rolled tables stand in.
@Entity('contract')
class Contract {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) organizationId!: string;
    @Column({ type: 'varchar' }) priceTypeId!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'boolean', nullable: true }) isCustomerContract!: boolean | null;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar' }) contractKind!: string;
    @Column({ type: 'varchar' }) contractType!: string;
}

@Entity('contract_file')
class ContractFile {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'int' }) contractId!: number;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'int' }) assetId!: number;
    @Column({ type: 'varchar' }) fileName!: string;
    @Column({ type: 'varchar', nullable: true }) uploadedByAdministratorId!: string | null;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) shortName!: string;
}

let dataSource: DataSource;
let service: ContractFileService;
let nextAssetId = 100;
const deletedAssets: number[] = [];
const visible = vi.fn(async (): Promise<unknown> => ({}));
const assets = {
    create: vi.fn(async (_ctx: unknown, input: { file: Promise<{ filename: string }> }) => ({
        id: nextAssetId++,
        name: (await input.file).filename,
    })),
    delete: vi.fn(async (_ctx: unknown, ids: number[]) => {
        deletedAssets.push(...ids);
        return { result: 'DELETED' };
    }),
};
const ctx = {} as RequestContext;
const TABLES: Record<string, unknown> = { Contract, ContractFile };

// Maps the production entity classes the service asks for onto the hand-rolled ones.
function connectionOver(source: DataSource): TransactionalConnection {
    const manager = (c: { em?: EntityManager }): EntityManager => c.em ?? source.manager;
    return {
        withTransaction: (c: { em?: EntityManager }, work: (c: unknown) => Promise<unknown>) =>
            c.em ? work({ em: c.em }) : source.transaction(em => work({ em })),
        getRepository: (c: { em?: EntityManager }, entity: { name: string }) =>
            TABLES[entity.name]
                ? manager(c).getRepository(TABLES[entity.name] as never)
                : { query: (sql: string, params?: unknown[]) => manager(c).query(sql, params) },
    } as unknown as TransactionalConnection;
}
const { schema, extra } = testSchemaOptions('contract_file');

function upload(
    kind: string,
    contractId: string,
    filename = 'scan.pdf',
): ReturnType<ContractFileService['upload']> {
    return service.upload(ctx, { contractId, kind, file: Promise.resolve({ filename }) });
}

async function seedContract(
    counterpartyId: number,
    fields: Partial<Contract> = {},
): Promise<Contract> {
    return dataSource.getRepository(Contract).save(
        dataSource.getRepository(Contract).create({
            erpId: `k-${Math.random()}`,
            counterpartyId: String(counterpartyId),
            organizationId: 'org',
            priceTypeId: 'pt',
            contractKind: 'customer',
            contractType: 'sale',
            isActive: true,
            isCustomerContract: true,
            name: 'Contract',
            ...fields,
        }),
    );
}

async function unscannedCounterparties(): Promise<number[]> {
    const rows: Array<{ id: number }> = await dataSource.query(
        `SELECT c.id FROM counterparty c WHERE ${UNSCANNED_ACTIVE_CONTRACT_SQL} ORDER BY c.id`,
    );
    return rows.map(r => r.id);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, Contract, ContractFile],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new ContractFileService(
        connectionOver(dataSource),
        { findOneVisible: visible } as unknown as CounterpartyService,
        assets as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    visible.mockResolvedValue({});
    deletedAssets.length = 0;
    await dataSource.query('TRUNCATE contract_file, contract, counterparty RESTART IDENTITY');
});

describe('contract scan requirement filter', () => {
    it('flags only counterparties with an active customer contract lacking a scan', async () => {
        const [a, b, c, d, e] = await dataSource
            .getRepository(TestCounterparty)
            .save(['A', 'B', 'C', 'D', 'E'].map(shortName => ({ shortName })));
        await seedContract(a.id);
        const scanned = await seedContract(b.id);
        await seedContract(c.id, { isActive: false });
        await seedContract(d.id, { isCustomerContract: false });
        const poaOnly = await seedContract(e.id);
        await upload('scan', String(scanned.id), 'b.pdf');
        await upload('power-of-attorney-scan', String(poaOnly.id));
        expect(await unscannedCounterparties()).toEqual([a.id, e.id]);
    });
});

describe('ContractFileService', () => {
    it('keeps one scan per contract when scans are uploaded concurrently', async () => {
        const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
        const contract = await seedContract(cp.id);
        await Promise.all(
            Array.from({ length: 5 }, (_, i) => upload('scan', String(contract.id), `s${i}.pdf`)),
        );
        const rows = await dataSource.getRepository(ContractFile).find();
        expect(rows.filter(r => r.kind === 'scan')).toHaveLength(1);
        expect(deletedAssets).toHaveLength(4);
        expect(rows[0].assetId).not.toBe(deletedAssets[0]);
    });

    it('accumulates files of other kinds and keeps the original file name', async () => {
        const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
        const contract = await seedContract(cp.id);
        await upload('other', String(contract.id), 'a.pdf');
        await upload('other', String(contract.id), 'b.pdf');
        const rows = await dataSource.getRepository(ContractFile).find({ order: { id: 'ASC' } });
        expect(rows.map(r => r.fileName)).toEqual(['a.pdf', 'b.pdf']);
        expect(deletedAssets).toEqual([]);
    });

    it('refuses a contract of a counterparty the caller does not see, writing nothing', async () => {
        const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
        const contract = await seedContract(cp.id);
        visible.mockResolvedValue(null);
        assets.create.mockClear();
        await expect(upload('scan', String(contract.id))).rejects.toThrow('Contract not found');
        expect(await dataSource.getRepository(ContractFile).count()).toBe(0);
        expect(assets.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown kind', async () => {
        const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
        const contract = await seedContract(cp.id);
        await expect(upload('passport', String(contract.id))).rejects.toThrow('Unknown');
    });

    it('removes the file and its asset once, a repeat answers false', async () => {
        const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
        const contract = await seedContract(cp.id);
        const saved = await upload('scan', String(contract.id));
        expect(await service.remove(ctx, saved.uuid)).toBe(true);
        expect(await service.remove(ctx, saved.uuid)).toBe(false);
        expect(deletedAssets).toEqual([saved.assetId]);
    });
});
