export default {
    page: { breadcrumb: 'Workspace', title: 'Team' },
    views: { all: 'All', active: 'Active', unassigned: 'Unassigned', inactive: 'Inactive' },
    status: { active: 'Active', inactive: 'Inactive', unassigned: 'Unassigned' },
    columns: {
        name: 'Name',
        department: 'Department',
        position: 'Position',
        branch: 'Branch',
        roles: 'Role',
        erpId: 'ERP id',
        status: 'Status',
    },
    filters: {
        name: 'Name or ERP id contains…',
        allDepartments: 'All departments',
        allBranches: 'All branches',
        allRoles: 'All roles',
        allStatuses: 'All',
    },
    table: {
        searchPlaceholder: 'Search by name or ERP id…',
        empty: 'No employees match your filters',
        manageRoles: 'Manage roles',
    },
    errors: {
        loadFailed: 'Could not load the team directory',
        loadOptionsFailed: 'Could not load departments and branches',
    },
};
