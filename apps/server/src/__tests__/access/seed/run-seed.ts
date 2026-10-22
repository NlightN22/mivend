import { login } from '../harness/graphql';
import { seedDocuments } from './document-seed';
import { seedMasterData } from './erp-import-seed';
import { seedPortalCustomers } from './portal-customer-seed';
import { seedPriceTypes } from './price-type-seed';
import { seedOrders } from './orders-seed';
import { seedRelations } from './relations-seed';
import { seedSettlements } from './settlement-seed';
import { readSeedIds, type SeedIds } from './seed-ids';
import { seedStaff } from './staff-seed';

export const SUPERADMIN = { username: 'superadmin', password: 'access-superadmin' };

export async function runAccessSeed(baseUrl: string, importToken: string): Promise<SeedIds> {
    const superadmin = await login(baseUrl, 'admin-api', SUPERADMIN.username, SUPERADMIN.password);
    const target = { baseUrl, token: importToken };
    await seedMasterData(target);
    await seedStaff(target, superadmin);
    const ids = await readSeedIds(baseUrl, superadmin);
    await seedRelations(baseUrl, superadmin, ids);
    await seedPortalCustomers(target);
    const ordering = await seedOrders(target, superadmin, ids.points);
    await seedPriceTypes(target, superadmin);
    await seedSettlements(target);
    await seedDocuments(target, superadmin, ids.counterparties);
    return { ...ids, ordering };
}
