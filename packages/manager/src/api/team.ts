import { adminApi } from './client';
import { fetchBranchOptions, type BranchOption } from './orders';
import { DepartmentsDocument, TeamDirectoryDocument } from './generated/graphql';

export interface DepartmentOption {
    id: string;
    erpId: string;
    name: string;
}

export interface TeamDirectoryMember {
    id: string;
    firstName: string | null;
    lastName: string | null;
    roleCodes: string[];
    departmentId: string | null;
    branchId: string | null;
    position: string | null;
}

export async function fetchDepartments(): Promise<DepartmentOption[]> {
    const result = await adminApi(DepartmentsDocument);
    return result.departments;
}

export { fetchBranchOptions };
export type { BranchOption };

// firstName/lastName are null outside the caller's department unless 'teamVisibility' is 'all'.
// Separate from teamMembers, which must keep returning real names for manager pickers and filters.
export async function fetchTeamDirectory(): Promise<TeamDirectoryMember[]> {
    const result = await adminApi(TeamDirectoryDocument);
    return result.teamDirectory;
}
