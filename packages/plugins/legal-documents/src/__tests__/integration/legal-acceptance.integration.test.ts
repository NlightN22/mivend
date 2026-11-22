import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LegalAcceptance } from '../../entities/legal-acceptance.entity';
import { LegalDocumentVersion } from '../../entities/legal-document-version.entity';
import { LegalDocumentsService } from '../../legal-documents.service';
import { LegalPublisherService } from '../../legal-publisher.service';
import type { LegalDocumentsOptions } from '../../types';

const requisites = {
    platformName: 'Portal',
    operatorName: 'Operator',
    operatorStatus: 'Status',
    contactEmail: 'legal@example.com',
    portalUrl: 'https://portal.example.com',
    jurisdiction: 'Country',
};
const options: LegalDocumentsOptions = { requisites, fallbackLocale: 'ru' };
const ctxOf = (userId: number | null): RequestContext =>
    ({
        activeUserId: userId,
        apiType: 'shop',
        req: {
            headers: { origin: 'https://shop.example.com', 'user-agent': 'test-agent' },
            ip: '10.0.0.1',
        },
    }) as unknown as RequestContext;

// The real entities extend VendureEntity, whose id column needs Vendure's runtime id strategy.
@Entity('legal_acceptance')
class AcceptanceRow {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'int' }) customerId!: number;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'int' }) version!: number;
    @Column({ type: 'boolean' }) accepted!: boolean;
    @Column({ type: 'varchar' }) locale!: string;
    @Column({ type: 'varchar' }) portal!: string;
    @Column({ type: 'varchar' }) ip!: string;
    @Column({ type: 'varchar' }) userAgent!: string;
    @Column({ type: 'varchar', nullable: true }) contactEmail!: string | null;
    @Column({ type: 'varchar', nullable: true }) contactPhone!: string | null;
    @Column({ type: 'boolean', default: false }) emailVerified!: boolean;
}

@Entity('legal_document_version')
@Index(['kind', 'version', 'locale'], { unique: true })
class VersionRow {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'int' }) version!: number;
    @Column({ type: 'varchar' }) locale!: string;
    @Column({ type: 'varchar' }) title!: string;
    @Column({ type: 'text' }) template!: string;
    @Column({ type: 'text' }) body!: string;
    @Column({ type: 'timestamptz' }) effectiveDate!: Date;
    @Column({ type: 'boolean' }) requiresReacceptance!: boolean;
}

const { schema, extra } = testSchemaOptions('legal_acceptance');
let dataSource: DataSource;
let service: LegalDocumentsService;
let publisher: LegalPublisherService;
let connection: TransactionalConnection;
let contacts: { emailAddress: string; phoneNumber: string | null };
let verified: boolean;

const rows = (customerId: number): Promise<AcceptanceRow[]> =>
    dataSource.getRepository(AcceptanceRow).find({ where: { customerId }, order: { id: 'ASC' } });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra,
        entities: [AcceptanceRow, VersionRow],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const tables = new Map<unknown, unknown>([
        [LegalAcceptance, AcceptanceRow],
        [LegalDocumentVersion, VersionRow],
    ]);
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(ctx, (tables.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
    const customers = {
        findOneByUserId: async (_ctx: unknown, id: number) => ({ id, ...contacts }),
        findOne: async (_ctx: unknown, id: number) => ({ id, ...contacts, user: { verified } }),
    };
    const users = { getUserById: async () => ({ verified }) };
    service = new LegalDocumentsService(connection, customers as never, users as never, options);
    publisher = new LegalPublisherService(connection, {} as never, options);
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});
beforeEach(async () => {
    contacts = { emailAddress: 'Buyer@Example.com', phoneNumber: '+70000000000' };
    verified = true;
    await dataSource.query('TRUNCATE legal_acceptance, legal_document_version RESTART IDENTITY');
    await publisher.publishMissing(ctxOf(null));
});

const accept = (
    userId: number,
    accepted = true,
    kind = 'agreement',
): ReturnType<LegalDocumentsService['accept']> =>
    service.accept(ctxOf(userId), [{ kind, version: 1, accepted }], 'ru');

describe('publishing', () => {
    it('is idempotent and does not republish an existing version', async () => {
        expect(await publisher.publishMissing(ctxOf(null))).toBe(0);
        expect(await dataSource.getRepository(VersionRow).count()).toBe(8);
    });

    it('publishes nothing while a requisite is missing', async () => {
        await dataSource.query('TRUNCATE legal_document_version RESTART IDENTITY');
        const blocked = new LegalPublisherService(connection, {} as never, {
            ...options,
            requisites: { ...requisites, contactEmail: '' },
        });
        expect(await blocked.publishMissing(ctxOf(null))).toBe(0);
        expect(await dataSource.getRepository(VersionRow).count()).toBe(0);
    });

    it('stores the text with the requisites substituted', async () => {
        const doc = await service.currentDocument(ctxOf(null), 'agreement', 'en');
        expect(doc?.locale).toBe('en');
        expect(doc?.body).toContain('Operator');
        expect(doc?.body).not.toContain('{{');
        expect((await service.currentDocument(ctxOf(null), 'agreement', 'de'))?.locale).toBe('ru');
    });
});

describe('acceptance log', () => {
    it('records an acceptance once per user, document and version', async () => {
        await accept(7);
        await accept(7);
        const stored = await rows(7);
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({
            kind: 'agreement',
            version: 1,
            accepted: true,
            portal: 'shop.example.com',
            ip: '10.0.0.1',
            userAgent: 'test-agent',
        });
    });

    it('records one row when the same acceptance is submitted concurrently', async () => {
        await Promise.all([accept(8), accept(8), accept(8), accept(8)]);
        expect(await rows(8)).toHaveLength(1);
    });

    it('keeps each customer to their own rows', async () => {
        await accept(1);
        const other = await service.statuses(ctxOf(2));
        expect(other.find(s => s.kind === 'agreement')?.pending).toBe(true);
        expect((await service.history(ctxOf(2))).totalItems).toBe(0);
    });

    it('appends a new row for a withdrawal instead of editing', async () => {
        await accept(9, true, 'marketing-consent');
        await accept(9, false, 'marketing-consent');
        const stored = await rows(9);
        expect(stored.map(r => r.accepted)).toEqual([true, false]);
        const status = (await service.statuses(ctxOf(9))).find(s => s.kind === 'marketing-consent');
        expect(status).toMatchObject({ accepted: false, pending: false });
    });

    it('rejects a stale version, the policy, and declining a required document', async () => {
        const stale = service.accept(ctxOf(3), [{ kind: 'agreement', version: 0, accepted: true }]);
        await expect(stale).rejects.toThrow(/not current/);
        await expect(accept(3, true, 'policy')).rejects.toThrow(/cannot be accepted/);
        await expect(accept(3, false, 'agreement')).rejects.toThrow(/required/);
        expect(await rows(3)).toHaveLength(0);
    });

    it('records nothing for a caller that is not a customer', async () => {
        expect(
            await service.accept(ctxOf(null), [{ kind: 'agreement', version: 1, accepted: true }]),
        ).toEqual([]);
        expect(await dataSource.getRepository(AcceptanceRow).count()).toBe(0);
    });
});

describe('contacts of a marketing consent', () => {
    const marketing = (
        userId: number,
        accepted = true,
    ): ReturnType<LegalDocumentsService['accept']> =>
        service.accept(ctxOf(userId), [{ kind: 'marketing-consent', version: 1, accepted }], 'ru');

    it('records the e-mail, phone and its confirmation next to the answer', async () => {
        await marketing(1);
        expect((await rows(1))[0]).toMatchObject({
            contactEmail: 'buyer@example.com',
            contactPhone: '+70000000000',
            emailVerified: true,
        });
    });

    it('allows advertising only for the confirmed e-mail the consent was given for', async () => {
        await marketing(1);
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(true);
        contacts = { ...contacts, emailAddress: 'new@example.com' };
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
        contacts = { ...contacts, emailAddress: 'BUYER@example.com' };
        verified = false;
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
    });

    it('stops advertising after a withdrawal and with no answer at all', async () => {
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
        await marketing(1);
        await marketing(1, false);
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
    });
});
