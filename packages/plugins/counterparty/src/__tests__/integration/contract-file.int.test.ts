import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn, type EntityManager } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContractFileService } from '../../contract-file/contract-file.service';
import { ContractFileStorageService } from '../../contract-file/contract-file-storage.service';
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
    @Column({ type: 'varchar' }) fileName!: string;
    @Column({ type: 'varchar' }) mimeType!: string;
    @Column({ type: 'int' }) sizeBytes!: number;
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
let dir: string;
const visible = vi.fn(async (): Promise<unknown> => ({}));
const ctx = {} as RequestContext;
const TABLES: Record<string, unknown> = { Contract, ContractFile };
const { schema, extra } = testSchemaOptions('contract_file');

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

function upload(
    kind: string,
    contractId: string,
    filename = 'scan.pdf',
    mimetype = 'application/pdf',
    content: Buffer = Buffer.from(`%PDF-1.4 ${filename}`),
): ReturnType<ContractFileService['upload']> {
    const file = {
        filename,
        mimetype,
        createReadStream: () => Readable.from([content]),
    };
    return service.upload(ctx, { contractId, kind, file: Promise.resolve(file) });
}

const filesOnDisk = (): string[] => (existsSync(dir) ? readdirSync(dir) : []);

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

async function oneContract(): Promise<Contract> {
    const [cp] = await dataSource.getRepository(TestCounterparty).save([{ shortName: 'A' }]);
    return seedContract(cp.id);
}

async function unscannedCounterparties(): Promise<number[]> {
    const rows: Array<{ id: number }> = await dataSource.query(
        `SELECT c.id FROM counterparty c WHERE ${UNSCANNED_ACTIVE_CONTRACT_SQL} ORDER BY c.id`,
    );
    return rows.map(r => r.id);
}

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'contract-files-'));
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
        new ContractFileStorageService({ dir }),
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
    rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
    visible.mockResolvedValue({});
    rmSync(dir, { recursive: true, force: true });
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
    it('keeps one scan row and one file per contract when scans are uploaded concurrently', async () => {
        const contract = await oneContract();
        await Promise.all(
            Array.from({ length: 5 }, (_, i) => upload('scan', String(contract.id), `s${i}.pdf`)),
        );
        const rows = await dataSource.getRepository(ContractFile).find();
        expect(rows).toHaveLength(1);
        expect(filesOnDisk()).toEqual([rows[0].uuid]);
    });

    it('accumulates files of other kinds and keeps the original file name', async () => {
        const contract = await oneContract();
        await upload('other', String(contract.id), 'a.pdf');
        await upload('other', String(contract.id), 'b.pdf');
        const rows = await dataSource.getRepository(ContractFile).find({ order: { id: 'ASC' } });
        expect(rows.map(r => r.fileName)).toEqual(['a.pdf', 'b.pdf']);
        expect(filesOnDisk()).toHaveLength(2);
    });

    it('replacing the scan removes the previous file from disk', async () => {
        const contract = await oneContract();
        const first = await upload('scan', String(contract.id), 'first.pdf');
        const second = await upload('scan', String(contract.id), 'second.pdf');
        expect(filesOnDisk()).toEqual([second.uuid]);
        expect(filesOnDisk()).not.toContain(first.uuid);
    });

    it('refuses a contract of a counterparty the caller does not see, writing nothing', async () => {
        const contract = await oneContract();
        visible.mockResolvedValue(null);
        await expect(upload('scan', String(contract.id))).rejects.toThrow('Contract not found');
        expect(await dataSource.getRepository(ContractFile).count()).toBe(0);
        expect(filesOnDisk()).toEqual([]);
    });

    it('rejects an unknown kind and a non-PDF, non-image file without writing', async () => {
        const contract = await oneContract();
        await expect(upload('passport', String(contract.id))).rejects.toThrow('Unknown');
        await expect(
            upload('other', String(contract.id), 'x.pdf', 'application/pdf', Buffer.from('<html>')),
        ).rejects.toThrow('PDF');
        expect(filesOnDisk()).toEqual([]);
    });

    it('stores the type found in the content, not the declared one', async () => {
        const contract = await oneContract();
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
        await upload('other', String(contract.id), 'pic.pdf', 'application/pdf', png);
        const [row] = await dataSource.getRepository(ContractFile).find();
        expect(row.mimeType).toBe('image/png');
    });

    it('removes the row and the file once, a repeat answers false', async () => {
        const contract = await oneContract();
        const saved = await upload('scan', String(contract.id));
        expect(await service.remove(ctx, saved.uuid)).toBe(true);
        expect(await service.remove(ctx, saved.uuid)).toBe(false);
        expect(filesOnDisk()).toEqual([]);
        expect(await dataSource.getRepository(ContractFile).count()).toBe(0);
    });

    it('leaves no orphan file when the database write fails', async () => {
        const contract = await oneContract();
        await dataSource.query('ALTER TABLE contract_file RENAME TO contract_file_off');
        try {
            await expect(upload('scan', String(contract.id))).rejects.toThrow();
        } finally {
            await dataSource.query('ALTER TABLE contract_file_off RENAME TO contract_file');
        }
        expect(filesOnDisk()).toEqual([]);
    });
});
