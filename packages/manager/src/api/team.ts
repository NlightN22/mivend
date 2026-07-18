import { adminApi } from './client';
import { fetchBranchOptions, type BranchOption } from './orders';

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
    const result = await adminApi<{ departments: DepartmentOption[] }>(
        `query Departments { departments { id erpId name } }`,
    );
    return result.departments;
}

export { fetchBranchOptions };
export type { BranchOption };

// firstName/lastName come back null for members outside the caller's own department when
// their role's 'teamVisibility' access scope isn't 'all' — see
// packages/plugins/access-control/src/access-control.resolver.ts's teamDirectory resolver.
// Deliberately a separate query from teamMembers (used by manager pickers/filters elsewhere,
// e.g. Orders/Customers), which always returns real names — see that resolver's doc comment.
export async function fetchTeamDirectory(): Promise<TeamDirectoryMember[]> {
    const result = await adminApi<{ teamDirectory: TeamDirectoryMember[] }>(
        `query TeamDirectory {
            teamDirectory {
                id
                firstName
                lastName
                roleCodes
                departmentId
                branchId
                position
            }
        }`,
    );
    return result.teamDirectory;
}
