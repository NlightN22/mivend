import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, PrimaryGeneratedColumn } from 'typeorm';
import { UserInputError } from '@vendure/core';
import type { ProcessContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { LegalNameAbbreviation } from '../../entities/legal-name-abbreviation.entity';
import { LegalNameAbbreviationService } from '../../legal-name-abbreviation.service';
import { abbreviateLegalName } from '../../qr-payment/legal-name-abbreviation';

const { schema, extra } = testSchemaOptions('legal_name_abbreviation');
let dataSource: DataSource;
let service: LegalNameAbbreviationService;
const ctx = testRequestContext;

// VendureEntity's id column exists only after bootstrap registers an EntityIdStrategy.
PrimaryGeneratedColumn()(LegalNameAbbreviation.prototype, 'id');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [LegalNameAbbreviation],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new LegalNameAbbreviationService(
        createTestConnection(dataSource),
        {} as never,
        { isWorker: false } as ProcessContext,
    );
});

beforeEach(async () => {
    await dataSource.getRepository(LegalNameAbbreviation).clear();
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('LegalNameAbbreviationService (integration, real Postgres)', () => {
    it('assigns an immutable uuid on create and keeps it on update', async () => {
        const created = await service.create(ctx, { phrase: 'Фонд', abbreviation: 'Ф' });
        const updated = await service.update(ctx, created.id, {
            phrase: 'Фонд развития',
            abbreviation: 'ФР',
        });
        expect(created.uuid).toMatch(/^[0-9a-f-]{36}$/);
        expect(updated.uuid).toBe(created.uuid);
        expect(updated.abbreviation).toBe('ФР');
    });

    it('rejects a duplicate phrase regardless of case and spacing', async () => {
        await service.create(ctx, { phrase: 'Акционерное общество', abbreviation: 'АО' });
        await expect(
            service.create(ctx, { phrase: ' АКЦИОНЕРНОЕ  ОБЩЕСТВО ', abbreviation: 'X' }),
        ).rejects.toBeInstanceOf(UserInputError);
        expect(await dataSource.getRepository(LegalNameAbbreviation).count()).toBe(1);
    });

    it('rejects an update that collides with another row', async () => {
        await service.create(ctx, { phrase: 'Фонд', abbreviation: 'Ф' });
        const other = await service.create(ctx, { phrase: 'Союз', abbreviation: 'С' });
        await expect(
            service.update(ctx, other.id, { phrase: 'фонд', abbreviation: 'С' }),
        ).rejects.toBeInstanceOf(UserInputError);
    });

    it('rejects invalid input before touching the table', async () => {
        await expect(
            service.create(ctx, { phrase: 'Фонд', abbreviation: 'А|Б' }),
        ).rejects.toBeInstanceOf(UserInputError);
        expect(await dataSource.getRepository(LegalNameAbbreviation).count()).toBe(0);
    });

    it('lets exactly one of two concurrent creates of the same phrase win', async () => {
        const results = await Promise.allSettled([
            service.create(ctx, { phrase: 'Союз', abbreviation: 'С1' }),
            service.create(ctx, { phrase: 'союз', abbreviation: 'С2' }),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await dataSource.getRepository(LegalNameAbbreviation).count()).toBe(1);
    });

    it('deletes a row and reports a missing one', async () => {
        const row = await service.create(ctx, { phrase: 'Фонд', abbreviation: 'Ф' });
        await service.delete(ctx, row.id);
        await expect(service.delete(ctx, row.id)).rejects.toThrow();
    });

    describe('provisionDefaults', () => {
        it('fills an empty table and the loaded rules shorten a legal name', async () => {
            expect(await service.provisionDefaults(ctx)).toBeGreaterThan(0);
            const rules = await service.findRules(ctx);
            expect(abbreviateLegalName('Общество с ограниченной ответственностью "А"', rules)).toBe(
                'ООО "А"',
            );
        });

        it('does not touch a table staff already edited, and is idempotent', async () => {
            await service.provisionDefaults(ctx);
            const rows = await dataSource.getRepository(LegalNameAbbreviation).find();
            const llc = rows.find(r => r.abbreviation === 'ООО');
            await service.update(ctx, llc!.id, {
                phrase: 'Общество с ограниченной ответственностью',
                abbreviation: 'О.О.О.',
            });
            const removed = rows.find(r => r.abbreviation === 'ЗАО');
            await service.delete(ctx, removed!.id);

            expect(await service.provisionDefaults(ctx)).toBe(0);
            const after = await service.findRules(ctx);
            expect(after.find(r => r.abbreviation === 'О.О.О.')).toBeDefined();
            expect(after.find(r => r.abbreviation === 'ЗАО')).toBeUndefined();
            expect(after).toHaveLength(rows.length - 1);
        });

        it('survives two concurrent provisioning runs on an empty table', async () => {
            await Promise.all([service.provisionDefaults(ctx), service.provisionDefaults(ctx)]);
            const phrases = (await service.findRules(ctx)).map(r => r.phrase);
            expect(new Set(phrases).size).toBe(phrases.length);
        });
    });
});
