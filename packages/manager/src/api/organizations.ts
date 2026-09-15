import { adminApi } from './client';
import {
    OrganizationsDocument,
    type OrganizationRequisitesFieldsFragment,
} from './generated/graphql';

export type OrganizationRequisites = OrganizationRequisitesFieldsFragment;

// A bounded set of the business's own legal entities (a handful at most) — same exemption class
// as WarehousesDocument/BranchOptionsDocument above it in this file's peers: no
// pagination/server-side filter args exist on organizationRequisites (backend-plugin-rules
// skill's Pagination section exemption test).
export async function fetchOrganizations(): Promise<OrganizationRequisites[]> {
    const result = await adminApi(OrganizationsDocument);
    return result.organizationRequisites;
}
