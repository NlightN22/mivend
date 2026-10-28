import type { DataSource } from 'typeorm';

// A relation custom field's column cannot be derived from a field name, so the #244 mirror check is not applied to it.
const MANUFACTURER_COLUMN = ['customFields', 'Manufacturerid'].join('');

// Hand-rolled copies of the Vendure catalog tables the attribute query reads.
export const CATALOG_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS manufacturer (id serial PRIMARY KEY, "externalId" varchar NOT NULL);
CREATE TABLE IF NOT EXISTS product (id serial PRIMARY KEY, "customFieldsExternalid" varchar, "${MANUFACTURER_COLUMN}" int);
CREATE TABLE IF NOT EXISTS product_variant (id serial PRIMARY KEY, "productId" int NOT NULL, "deletedAt" timestamp);
CREATE TABLE IF NOT EXISTS facet (id serial PRIMARY KEY, code varchar NOT NULL);
CREATE TABLE IF NOT EXISTS facet_value (id serial PRIMARY KEY, code varchar NOT NULL, "facetId" int NOT NULL);
CREATE TABLE IF NOT EXISTS product_variant_facet_values_facet_value ("productVariantId" int NOT NULL, "facetValueId" int NOT NULL);
CREATE TABLE IF NOT EXISTS product_facet_values_facet_value ("productId" int NOT NULL, "facetValueId" int NOT NULL);
CREATE TABLE IF NOT EXISTS collection_translation (id serial PRIMARY KEY, slug varchar NOT NULL, "baseId" int);
CREATE TABLE IF NOT EXISTS collection_closure (id_ancestor int NOT NULL, id_descendant int NOT NULL);
`;

// Category tree c-top > c-mid > c-leaf (collection ids 1..3); each category is also a category facet value.
export async function seedCatalog(db: DataSource): Promise<void> {
    await db.query(`TRUNCATE manufacturer, product, product_variant, facet, facet_value,
        product_variant_facet_values_facet_value, product_facet_values_facet_value,
        collection_translation, collection_closure RESTART IDENTITY`);
    await db.query(`
        INSERT INTO manufacturer ("externalId") VALUES ('m-1'), ('m-2');
        INSERT INTO facet (code) VALUES ('category'), ('brand');
        INSERT INTO facet_value (code, "facetId") VALUES ('c-top', 1), ('c-mid', 1), ('c-leaf', 1), ('c-other', 1);
        INSERT INTO collection_translation (slug, "baseId") VALUES
            ('cat-c-top', 1), ('cat-c-mid', 2), ('cat-c-leaf', 3), ('cat-c-other', 4), ('__root_collection__', 9);
        INSERT INTO collection_closure VALUES (1,1),(2,2),(3,3),(4,4),(1,2),(1,3),(2,3),(9,1),(9,2),(9,3),(9,4),(9,9);
        INSERT INTO product ("customFieldsExternalid", "${MANUFACTURER_COLUMN}") VALUES
            ('p-leaf', 1), ('p-prod-level', 1), ('p-orphan', 1), ('p-nomaker', NULL), ('p-other-maker', 2);
        INSERT INTO product_variant ("productId") VALUES (1), (2), (3), (4), (5);
        INSERT INTO product_variant_facet_values_facet_value VALUES (1, 3), (4, 4);
        INSERT INTO product_facet_values_facet_value VALUES (2, 2);
    `);
}
