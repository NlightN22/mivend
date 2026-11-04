import {
    Column,
    DataSource,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { DiscountRule } from '../../discount-rule.entity';
import { DiscountGrant } from '../../discount-grant.entity';
import { ProductVariant, type RequestContext, type TransactionalConnection } from '@vendure/core';
import { createTestConnection } from 'shared';

import { CatalogPricingService } from '../../catalog-pricing.service';
import { DiscountRuleService } from '../../discount-rule.service';
import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { PromoDiscountRuleService } from '../../promo-discount-rule.service';
import { PriceEntryService } from '../../price-entry.service';
import { PriceResolutionService } from '../../price-resolution.service';

import {
    TestFacet,
    TestFacetValue,
    TestFacetValueTranslation,
    TestManufacturer,
} from './variant-relations-harness';
import {
    SETUP_ENTITIES,
    TestProduct as TestSetupProduct,
    TestRecipient,
    TestSetup,
    resetSetupTables,
} from './discount-setup-harness';

export class CatalogProductFields {
    @Column({ type: 'varchar', name: 'externalid', nullable: true })
    externalId!: string | null;
    @ManyToOne(() => TestManufacturer, { nullable: true }) manufacturer!: TestManufacturer | null;
}

@Entity('product')
export class CatalogProduct {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => CatalogProductFields) customFields!: CatalogProductFields;
    @ManyToMany(() => TestFacetValue)
    @JoinTable({ name: 'product_facet_values' })
    facetValues!: TestFacetValue[];
}

export class CatalogVariantFields {
    @Column({ type: 'float', name: 'weight', nullable: true }) weight!: number | null;
    @Column({ type: 'varchar', name: 'organizationid', nullable: true })
    organizationid!: string | null;
}

@Entity('product_variant')
export class CatalogVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => CatalogVariantFields) customFields!: CatalogVariantFields;
    @ManyToOne(() => CatalogProduct) product!: CatalogProduct;
    @ManyToMany(() => TestFacetValue)
    @JoinTable({ name: 'product_variant_facet_values' })
    facetValues!: TestFacetValue[];
}

@Entity('discount_rule')
export class CatalogRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'float', nullable: true }) minWeightKg!: number | null;
    @Column({ type: 'bigint', nullable: true }) minAmount!: number | null;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) triggerProductErpId!: string | null;
    @Column({ type: 'float', nullable: true }) triggerQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) giftProductErpId!: string | null;
    @Column({ type: 'float', nullable: true }) giftQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) operationKind!: string | null;
}

export const CATALOG_ENTITIES = [
    TestFacet,
    TestFacetValue,
    TestFacetValueTranslation,
    TestManufacturer,
    CatalogProduct,
    CatalogVariant,
    CatalogRule,
    ...SETUP_ENTITIES.filter(e => e.name !== 'TestPriceType'),
];

export interface Grant {
    discountRuleId: string;
    scopeType: 'all' | 'customer';
    counterparties: Array<{ id: string }>;
}

export const grants: Grant[] = [];
export const stubCalls = { count: 0 };

export function catalogConnection(dataSource: DataSource): TransactionalConnection {
    const base = createTestConnection(dataSource);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: RequestContext, entity: unknown) => {
            if (entity === DiscountGrant) {
                return {
                    find: async ({ where }: { where: { discountRuleId: { value: string[] } } }) => {
                        stubCalls.count++;
                        return grants.filter(g =>
                            where.discountRuleId.value.includes(g.discountRuleId),
                        );
                    },
                };
            }
            const mapped =
                entity === ProductVariant
                    ? CatalogVariant
                    : entity === DiscountRule
                      ? CatalogRule
                      : (entity as never);
            return base.getRepository(ctx, mapped);
        },
    } as unknown as TransactionalConnection;
}

export const WHOLESALE = 'WHOLESALE';
export const RETAIL = 'RETAIL';
export const PLAIN_CTX = (userId?: number): RequestContext =>
    ({ languageCode: 'en', activeUserId: userId }) as unknown as RequestContext;

export async function createCatalogTables(ds: DataSource): Promise<void> {
    await ds.query(`CREATE TABLE price_type (id serial PRIMARY KEY, code varchar, "externalId" varchar,
        "isActive" boolean DEFAULT true, "isPurchase" boolean DEFAULT false)`);
    await ds.query(
        `CREATE TABLE customer (id serial PRIMARY KEY, "userId" int, "customFieldsCounterpartyid" varchar)`,
    );
    await ds.query(`CREATE TABLE counterparty (id serial PRIMARY KEY, "mainContractId" varchar)`);
    await ds.query(
        `CREATE TABLE contract ("erpId" varchar, "isActive" boolean, "priceTypeId" varchar)`,
    );
    await ds.query(`CREATE TABLE customer_price_type ("customerId" varchar, "priceTypeId" int)`);
    await ds.query(`CREATE TABLE product_variant_price_entry (id serial PRIMARY KEY,
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        "productExternalId" varchar NOT NULL, "priceTypeCode" varchar NOT NULL, price bigint NOT NULL)`);
}

// Customer 1 (user 1): customer_price_type WHOLESALE. Customer 2 (user 2): main contract RETAIL. Customer 3 (user 3): no price type, falls back to the branch default RETAIL.
export async function seedCatalog(ds: DataSource, count: number): Promise<string[]> {
    await ds.query(
        `TRUNCATE price_type, customer, counterparty, contract, customer_price_type, product_variant_price_entry, discount_rule, product_variant_facet_values, product_variant, product_facet_values, product, facet_value_translation, facet_value, facet, manufacturer RESTART IDENTITY CASCADE`,
    );
    await resetSetupTables(ds);
    grants.length = 0;
    await ds.query(
        `INSERT INTO price_type (code, "externalId") VALUES ('${WHOLESALE}', 'pt-w'), ('${RETAIL}', 'pt-r')`,
    );
    await ds.query(`INSERT INTO counterparty ("mainContractId") VALUES (NULL), ('ct-2'), (NULL)`);
    await ds.query(
        `INSERT INTO customer ("userId", "customFieldsCounterpartyid") VALUES (1, '1'), (2, '2'), (3, '3')`,
    );
    await ds.query(`INSERT INTO customer_price_type ("customerId", "priceTypeId") VALUES ('1', 1)`);
    await ds.query(
        `INSERT INTO contract ("erpId", "isActive", "priceTypeId") VALUES ('ct-2', true, 'pt-r')`,
    );

    const facet = await ds.getRepository(TestFacet).save({ code: 'category' });
    const fvs = [];
    for (const code of ['cat-a', 'cat-b']) {
        const fv = await ds.getRepository(TestFacetValue).save({ code, facet });
        await ds
            .getRepository(TestFacetValueTranslation)
            .save({ languageCode: 'en', name: code, base: fv });
        fvs.push(fv);
    }
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
        const product = await ds.getRepository(CatalogProduct).save({
            customFields: { externalId: `erp-${i}`, manufacturer: null },
            facetValues: [fvs[i % 2]],
        });
        const variant = await ds.getRepository(CatalogVariant).save({
            customFields: { weight: 2, organizationid: i % 5 === 0 ? null : 'org' },
            product,
            facetValues: [],
        });
        ids.push(String(variant.id));
    }
    await ds.query(`INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", price)
        SELECT p."customFieldsExternalid", '${WHOLESALE}', 10000 + p.id FROM product p WHERE p.id % 10 <> 0`);
    await ds.query(`INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode", price)
        SELECT p."customFieldsExternalid", '${RETAIL}', 12000 + p.id FROM product p WHERE p.id % 7 <> 0 AND p.id % 10 <> 0`);

    const now = new Date(Date.now() - 86_400_000);
    const later = new Date(Date.now() + 86_400_000 * 30);
    const rules = ds.getRepository(CatalogRule);
    const flatA = await rules.save({
        priceTypeCode: WHOLESALE,
        facetCode: 'category',
        facetValueCode: 'cat-a',
        percent: 5,
        validFrom: now,
        validTo: later,
    });
    await rules.save({
        priceTypeCode: WHOLESALE,
        facetCode: 'category',
        facetValueCode: 'cat-b',
        percent: 8,
        validFrom: now,
        validTo: later,
        minWeightKg: 10,
    });
    const scoped = await rules.save({
        priceTypeCode: RETAIL,
        facetCode: 'category',
        facetValueCode: 'cat-a',
        percent: 3,
        validFrom: now,
        validTo: later,
    });
    grants.push({ discountRuleId: String(flatA.id), scopeType: 'all', counterparties: [] });
    grants.push({
        discountRuleId: String(scoped.id),
        scopeType: 'customer',
        counterparties: [{ id: '3' }],
    });

    const setup = await ds.getRepository(TestSetup).save({
        erpId: 'setup-1',
        percent: 12,
        validFrom: now,
        validTo: later,
        sourceVersion: '1',
        contentHash: 'h',
    });
    await ds
        .getRepository(TestRecipient)
        .save({ setupId: setup.id, counterpartyErpId: 'cp-2', contractErpId: '' });
    for (let i = 1; i <= Math.min(count, 12); i++) {
        await ds
            .getRepository(TestSetupProduct)
            .save({ setupId: setup.id, productErpId: `erp-${i}`, percent: null });
    }
    return ids;
}

export interface CatalogServices {
    connection: TransactionalConnection;
    priceEntry: PriceEntryService;
    resolution: PriceResolutionService;
    catalog: CatalogPricingService;
}

// Customer lookups are stubbed (and counted in stubCalls): user N is customer N, branch default price type 2.
export function buildCatalogServices(
    ds: DataSource,
    connection: TransactionalConnection = catalogConnection(ds),
): CatalogServices {
    const priceEntry = new PriceEntryService(connection);
    const setupRules = new DiscountSetupRulesService(connection);
    const resolution = new PriceResolutionService(
        priceEntry,
        new DiscountRuleService(connection, {} as never),
        connection,
        {
            findOneByUserId: async (_c: unknown, userId: number) => {
                stubCalls.count++;
                return { id: userId };
            },
        } as never,
        {
            getForCustomer: async (_c: unknown, id: string) => {
                stubCalls.count++;
                return { id, erpId: `cp-${id}`, branchId: null };
            },
        } as never,
        {
            resolveEffective: async () => {
                stubCalls.count++;
                return { defaultPriceTypeId: '2' };
            },
        } as never,
        new PromoDiscountRuleService(connection),
        setupRules,
    );
    const catalog = new CatalogPricingService(resolution, priceEntry, setupRules, connection);
    return { connection, priceEntry, resolution, catalog };
}
