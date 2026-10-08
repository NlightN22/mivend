import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { VariantOrganizationHealthService } from '../../variant-organization-health.service';

const { schema, extra } = testSchemaOptions('variant_organization_health');
let dataSource: DataSource;
let service: VariantOrganizationHealthService;

const addVariant = (
    organizationId: number | null,
    opts: { enabled?: boolean; deleted?: boolean },
) =>
    dataSource.query(
        `INSERT INTO product_variant (enabled, "deletedAt", "customFieldsOrganizationid")
         VALUES ($1, $2, $3)`,
        [opts.enabled ?? true, opts.deleted ? new Date() : null, organizationId],
    );

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE product_variant (
        id serial PRIMARY KEY, enabled boolean, "deletedAt" timestamp,
        "customFieldsOrganizationid" int)`);
    service = new VariantOrganizationHealthService({
        rawConnection: dataSource,
    } as unknown as TransactionalConnection);
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE product_variant RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('VariantOrganizationHealthService (real SQL)', () => {
    it('counts only enabled, non-deleted variants and those among them without an organization', async () => {
        await addVariant(7, {});
        await addVariant(null, {});
        await addVariant(null, {});
        await addVariant(null, { enabled: false });
        await addVariant(null, { deleted: true });

        expect(await service.get()).toEqual({ total: 3, withoutOrganization: 2 });
    });

    it('reports zeros for an empty catalog', async () => {
        expect(await service.get()).toEqual({ total: 0, withoutOrganization: 0 });
    });
});
