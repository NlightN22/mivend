import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import { PriceTypeAccessService } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyPriceTypeResolver } from '../../counterparty.resolver';
import type { Counterparty } from '../../entities/counterparty.entity';

@Entity('price_type')
class TestPriceType {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
    @Column({ type: 'varchar' }) visibility!: string;
}

let dataSource: DataSource;
let resolver: CounterpartyPriceTypeResolver;
const { schema, extra } = testSchemaOptions('counterparty_price_type_context');

function viewerCtx(permissions: string[] = []): RequestContext {
    return {
        userHasPermissions: (required: string[]) => required.every(p => permissions.includes(p)),
    } as unknown as RequestContext;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPriceType],
        synchronize: true,
    });
    await dataSource.initialize();
    const saved = await dataSource.getRepository(TestPriceType).save([
        { code: 'price-type-branch', visibility: 'customer', externalId: null },
        { code: 'price-type-other-branch', visibility: 'customer', externalId: null },
        { code: 'price-type-purchase', visibility: 'confidential', externalId: null },
    ]);
    const access = new PriceTypeAccessService(
        { getRepository: () => dataSource.getRepository(TestPriceType) } as never,
        { getActorIdentity: async () => ({ branchId: 'branch-a' }) } as never,
        {
            getForBranch: async () => ({
                visiblePriceTypeIds: [],
                defaultPriceTypeId: String(saved[0].id),
            }),
        } as never,
    );
    resolver = new CounterpartyPriceTypeResolver(access);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const shownFor = (priceType: string, permissions: string[] = []): Promise<string | null> =>
    resolver.priceType(viewerCtx(permissions), { priceType } as Counterparty);

describe('Counterparty.priceType context path (integration, real Postgres)', () => {
    it('shows the own type from the branch list', async () => {
        expect(await shownFor('price-type-branch')).toBe('price-type-branch');
    });

    it('shows the own customer type even outside the branch list', async () => {
        expect(await shownFor('price-type-other-branch')).toBe('price-type-other-branch');
    });

    it('never shows a confidential type, even as the own type', async () => {
        expect(await shownFor('price-type-purchase')).toBeNull();
    });

    it('shows a confidential own type only with the confidential permission', async () => {
        expect(await shownFor('price-type-purchase', ['ReadConfidentialPriceTypes'])).toBe(
            'price-type-purchase',
        );
    });
});
