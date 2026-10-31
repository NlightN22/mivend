import { adminGql } from '../../helpers/api';
import { seedCategoryTree } from './categories';
import { seedGrants } from './grants';
import { readVisIds, type VisIds } from './ids';
import { importClients, importEmployees, importStructure, importWidgetProducts } from './import';
import { seedOrders } from './orders';
import { seedRelations } from './relations';
import { seedStaff } from './staff';

// Branches A/B, staff per role and scope, and every client variant of the #263 browser checks.
export async function seedVisibility(superadmin: string): Promise<VisIds> {
    const orgs = await adminGql<{ organizationRequisites: { id: string; erpId: string }[] }>(
        `{ organizationRequisites { id erpId } }`,
        undefined,
        superadmin,
    );
    const org = orgs.data.organizationRequisites.find(o => o.erpId === 'org-001');
    if (!org)
        throw new Error(
            'Organization org-001 is missing; the e2e stack seed (seed-erp.mjs) did not run',
        );
    await importStructure();
    await seedStaff(superadmin);
    await importEmployees();
    await importClients(Number(org.id));
    await seedCategoryTree(superadmin, Number(org.id));
    await importWidgetProducts(Number(org.id));
    const ids = await readVisIds(superadmin);
    await seedRelations(superadmin, ids);
    await seedOrders(superadmin, ids);
    await seedGrants(superadmin);
    return ids;
}
