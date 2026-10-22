import { adminGql } from '../../helpers/api';
import { ensureGrants } from './grants';
import { readVisIds, type VisIds } from './ids';
import { importClients, importEmployees, importStructure } from './import';
import { ensureOrders } from './orders';
import { ensureRelations } from './relations';
import { ensureStaff } from './staff';

// Branches A/B, staff per role and scope, and every client variant of the #263 browser checks.
export async function seedVisibility(superadmin: string): Promise<VisIds> {
    const orgs = await adminGql<{ organizationRequisites: { id: string; erpId: string }[] }>(
        `{ organizationRequisites { id erpId } }`,
        undefined,
        superadmin,
    );
    const org = orgs.data.organizationRequisites.find(o => o.erpId === 'org-001');
    if (!org) throw new Error('Organization org-001 is missing; run make seed');
    await importStructure();
    await ensureStaff(superadmin);
    await importEmployees();
    await importClients(Number(org.id));
    const ids = await readVisIds(superadmin);
    await ensureRelations(superadmin, ids);
    await ensureOrders(superadmin, ids);
    await ensureGrants(superadmin);
    return ids;
}
