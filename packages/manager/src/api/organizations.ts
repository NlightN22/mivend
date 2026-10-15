import { adminApi } from './client';
import {
    OrganizationsDocument,
    type OrganizationRequisitesFieldsFragment,
} from './generated/graphql';

export type OrganizationRequisites = OrganizationRequisitesFieldsFragment;

// Bounded set (a handful of legal entities): pagination and server-side filters are not needed
export async function fetchOrganizations(): Promise<OrganizationRequisites[]> {
    const result = await adminApi(OrganizationsDocument);
    return result.organizationRequisites;
}
