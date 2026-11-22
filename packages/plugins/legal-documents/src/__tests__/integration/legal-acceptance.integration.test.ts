import { Column, DataSource, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EmailConfirmationService } from '../../email-confirmation.service';
import { EmailConfirmation } from '../../entities/email-confirmation.entity';
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
    serviceProviders: 'Service A, Service B',
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

@Entity('email_confirmation')
class ConfirmationRow {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'int', unique: true }) customerId!: number;
    @Column({ type: 'varchar', nullable: true }) confirmedEmail!: string | null;
    @Column({ type: 'varchar', nullable: true }) pendingEmail!: string | null;
    @Column({ type: 'varchar', nullable: true }) token!: string | null;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('customer')
class CustomerRow {
    @PrimaryColumn({ type: 'int' }) id!: number;
    @Column({ type: 'varchar' }) emailAddress!: string;
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
let confirmations: EmailConfirmationService;

const rows = (customerId: number): Promise<AcceptanceRow[]> =>
    dataSource.getRepository(AcceptanceRow).find({ where: { customerId }, order: { id: 'ASC' } });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra,
        entities: [AcceptanceRow, VersionRow, ConfirmationRow, CustomerRow],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const tables = new Map<unknown, unknown>([
        [LegalAcceptance, AcceptanceRow],
        [LegalDocumentVersion, VersionRow],
        [EmailConfirmation, ConfirmationRow],
    ]);
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(ctx, (tables.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
    const customers = {
        findOneByUserId: async (_ctx: unknown, id: number) => ({ id, ...contacts }),
        findOne: async (_ctx: unknown, id: number) => ({ id, ...contacts }),
    };
    confirmations = new EmailConfirmationService(connection);
    service = new LegalDocumentsService(connection, customers as never, confirmations, options);
    publisher = new LegalPublisherService(connection, {} as never, options);
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});
beforeEach(async () => {
    contacts = { emailAddress: 'Buyer@Example.com', phoneNumber: '+70000000000' };
    await dataSource.query(
        'TRUNCATE legal_acceptance, legal_document_version, email_confirmation, customer RESTART IDENTITY',
    );
    await publisher.publishMissing(ctxOf(null));
    await confirmations.markConfirmed(ctxOf(null), 1, 'buyer@example.com');
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
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(true);
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 2)).toBe(false);
    });

    it('stops advertising after a withdrawal and with no answer at all', async () => {
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
        await marketing(1);
        await marketing(1, false);
        expect(await service.mayAdvertiseByEmail(ctxOf(null), 1)).toBe(false);
    });
});

const setAddress = async (id: number, email: string): Promise<void> => {
    await dataSource.query(
        `INSERT INTO customer (id, "emailAddress") VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET "emailAddress" = $2`,
        [id, email],
    );
};

describe('e-mail confirmation', () => {
    const ctx = ctxOf(null);
    const request = async (id: number, email: string): Promise<string | null> => {
        await setAddress(id, email);
        return confirmations.requestConfirmation(ctx, id, email);
    };
    const stored = (id: number): Promise<ConfirmationRow | null> =>
        dataSource.getRepository(ConfirmationRow).findOneBy({ customerId: id });

    it('leaves an unchanged confirmed customer confirmed and sends no link', async () => {
        expect(await confirmations.isConfirmed(ctx, 1, ' Buyer@Example.com ')).toBe(true);
        expect(await request(1, 'buyer@example.com')).toBeNull();
    });

    it('treats a staff-changed address as unconfirmed until the link is followed', async () => {
        const token = await request(1, 'new@example.com');
        expect(token).toMatch(/^[0-9a-f]{64}$/);
        expect(await confirmations.isConfirmed(ctx, 1, 'new@example.com')).toBe(false);
        expect(await request(1, 'new@example.com')).toBeNull();
        expect(await confirmations.confirmByToken(ctx, token as string)).toEqual({
            customerId: 1,
            confirmedEmail: 'new@example.com',
        });
        expect(await confirmations.isConfirmed(ctx, 1, 'new@example.com')).toBe(true);
        expect(await stored(1)).toMatchObject({ pendingEmail: null, token: null });
    });

    it('spends a link once and replaces it when the address changes again', async () => {
        const first = (await request(1, 'a@example.com')) as string;
        const second = (await request(1, 'b@example.com')) as string;
        expect(await confirmations.confirmByToken(ctx, first)).toBeNull();
        expect(await confirmations.confirmByToken(ctx, second)).not.toBeNull();
        expect(await confirmations.confirmByToken(ctx, second)).toBeNull();
        expect(await confirmations.confirmByToken(ctx, '')).toBeNull();
        expect(await confirmations.isConfirmed(ctx, 1, 'a@example.com')).toBe(false);
    });

    it('drops the pending link when the address goes back, so an old link cannot confirm', async () => {
        const old = (await request(1, 'b@example.com')) as string;
        expect(await request(1, 'buyer@example.com')).toBeNull();
        expect(await stored(1)).toMatchObject({ pendingEmail: null, token: null });
        expect(await confirmations.confirmByToken(ctx, old)).toBeNull();
        expect(await confirmations.isConfirmed(ctx, 1, 'buyer@example.com')).toBe(true);
    });

    it('refuses a link for an address the customer no longer has', async () => {
        const old = (await request(1, 'b@example.com')) as string;
        await setAddress(1, 'buyer@example.com');
        expect(await confirmations.confirmByToken(ctx, old)).toBeNull();
        expect(await confirmations.isConfirmed(ctx, 1, 'b@example.com')).toBe(false);
    });

    it('stores only a hash of the link token', async () => {
        const token = (await request(1, 'b@example.com')) as string;
        expect((await stored(1))?.token).not.toBe(token);
    });

    it('creates one link when the same change is requested concurrently', async () => {
        const results = await Promise.all([1, 2, 3, 4].map(() => request(5, 'c@example.com')));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await dataSource.getRepository(ConfirmationRow).countBy({ customerId: 5 })).toBe(1);
    });

    it('feeds the legal gate: a changed address needs the link and a new consent', async () => {
        await service.accept(ctxOf(1), [{ kind: 'marketing-consent', version: 1, accepted: true }]);
        contacts = { ...contacts, emailAddress: 'new@example.com' };
        const token = (await request(1, 'new@example.com')) as string;
        await service.accept(ctxOf(1), [
            { kind: 'marketing-consent', version: 1, accepted: false },
        ]);
        await service.accept(ctxOf(1), [{ kind: 'marketing-consent', version: 1, accepted: true }]);
        expect((await rows(1)).at(-1)?.emailVerified).toBe(false);
        expect(await service.mayAdvertiseByEmail(ctx, 1)).toBe(false);
        await confirmations.confirmByToken(ctx, token);
        await service.accept(ctxOf(1), [
            { kind: 'marketing-consent', version: 1, accepted: false },
        ]);
        await service.accept(ctxOf(1), [{ kind: 'marketing-consent', version: 1, accepted: true }]);
        expect((await rows(1)).at(-1)?.emailVerified).toBe(true);
        expect(await service.mayAdvertiseByEmail(ctx, 1)).toBe(true);
    });
});
