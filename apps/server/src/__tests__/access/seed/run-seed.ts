import { login } from '../harness/graphql';
import { seedMasterData } from './erp-import-seed';
import { seedOrders } from './orders-seed';
import { seedRelations } from './relations-seed';
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
    return { ...ids, ordering: await seedOrders(target, superadmin, ids.points) };
}
