import { OrganizationRequisites } from './entities/organization-requisites.entity';

export const REQUIRED_REQUISITE_FIELDS = [
    'legalName',
    'inn',
    'bankName',
    'bankBik',
    'bankAccount',
] as const;

export function missingRequiredRequisites(
    requisites: Pick<OrganizationRequisites, (typeof REQUIRED_REQUISITE_FIELDS)[number]>,
): string[] {
    return REQUIRED_REQUISITE_FIELDS.filter(field => !requisites[field]);
}

export function hasRequiredRequisites(
    requisites: Pick<OrganizationRequisites, (typeof REQUIRED_REQUISITE_FIELDS)[number]>,
): boolean {
    return missingRequiredRequisites(requisites).length === 0;
}
