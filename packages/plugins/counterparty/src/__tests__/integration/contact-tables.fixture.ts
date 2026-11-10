import type { DataSource } from 'typeorm';

// The readiness filter reads the contact storage; hand-rolled counterparty tables need these two beside them.
export async function createContactTables(
    dataSource: DataSource,
    counterpartyIdType: 'int' | 'uuid',
): Promise<void> {
    await dataSource.query(`CREATE TABLE contact_point (id serial PRIMARY KEY, type varchar,
        "normalizedValue" varchar, "isUsable" boolean DEFAULT true)`);
    await dataSource.query(`CREATE TABLE counterparty_contact_point (id serial PRIMARY KEY,
        "contactPointId" int, "counterpartyId" ${counterpartyIdType}, "isPrimary" boolean DEFAULT false)`);
}
