import { adminApi } from './client';
import { fetchRoles } from './settings';
import { fetchBranchOptions, type BranchOption } from './orders';
import {
    DepartmentsDocument,
    PositionsDocument,
    TeamDirectoryCountsDocument,
    TeamDirectoryDocument,
    type TeamDirectoryListOptions,
} from './generated/graphql';

export interface DepartmentOption {
    id: string;
    erpId: string;
    name: string;
}

export type TeamMemberStatus = 'active' | 'inactive' | 'unassigned';

export interface TeamDirectoryMember {
    id: string;
    erpId: string | null;
    firstName: string | null;
    lastName: string | null;
    active: boolean;
    roleCodes: string[];
    departmentId: string | null;
    departmentName: string | null;
    branchId: string | null;
    position: string | null;
}

export interface TeamFilters {
    [key: string]: string;
    search: string;
    departmentId: string;
    branchId: string;
    roleCode: string;
    status: string;
}

export const DEFAULT_TEAM_FILTERS: TeamFilters = {
    search: '',
    departmentId: '',
    branchId: '',
    roleCode: '',
    status: 'active',
};

export const TEAM_STATUS_BADGE_VARIANT = {
    active: 'success',
    inactive: 'neutral',
    unassigned: 'warning',
} as const;

export interface TeamViewCounts {
    all: number;
    active: number;
    inactive: number;
    unassigned: number;
}

export async function fetchDepartments(): Promise<DepartmentOption[]> {
    const result = await adminApi(DepartmentsDocument);
    return result.departments;
}

export async function fetchPositions(): Promise<DepartmentOption[]> {
    const result = await adminApi(PositionsDocument);
    return result.positions;
}

export { fetchBranchOptions };
export type { BranchOption };

function toOptions(filters: TeamFilters, status: string): TeamDirectoryListOptions {
    return {
        search: filters.search || undefined,
        filter: {
            departmentId: filters.departmentId || undefined,
            branchId: filters.branchId || undefined,
            roleCode: filters.roleCode || undefined,
            status: (status === 'all' || !status ? undefined : status) as
                | TeamMemberStatus
                | undefined,
        },
    };
}

// firstName/lastName are null outside the caller's department unless 'teamVisibility' is 'all'.
// Separate from teamMembers, which must keep returning real names for manager pickers and filters.
export async function fetchTeamDirectoryPage(
    filters: TeamFilters,
    page: number,
    pageSize: number,
): Promise<{ items: TeamDirectoryMember[]; totalItems: number }> {
    const result = await adminApi(TeamDirectoryDocument, {
        options: {
            ...toOptions(filters, filters.status),
            skip: (page - 1) * pageSize,
            take: pageSize,
        },
    });
    return result.teamDirectory;
}

// Counts honour search/department/branch but not the status chip itself.
export async function fetchTeamViewCounts(filters: TeamFilters): Promise<TeamViewCounts> {
    const count = (status: string): TeamDirectoryListOptions => ({
        ...toOptions(filters, status),
        take: 0,
    });
    const result = await adminApi(TeamDirectoryCountsDocument, {
        all: count('all'),
        active: count('active'),
        inactive: count('inactive'),
        unassigned: count('unassigned'),
    });
    return {
        all: result.all.totalItems,
        active: result.active.totalItems,
        inactive: result.inactive.totalItems,
        unassigned: result.unassigned.totalItems,
    };
}

export async function fetchRoleFilterOptions(): Promise<{ value: string; label: string }[]> {
    const roles = await fetchRoles();
    return roles.map(r => ({ value: r.code, label: r.description || r.code }));
}
