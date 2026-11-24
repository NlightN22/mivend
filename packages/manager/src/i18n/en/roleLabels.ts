export default {
    operator: {
        name: 'Operator',
        description: 'Processes current orders, all customers in own department or branch',
    },
    manager: {
        name: 'Manager',
        description: 'Owns an assigned customer book, must request approval for adjustments',
    },
    'department-head': {
        name: 'Department head',
        description: 'Approves requests for their department, sees department-wide data',
    },
    'general-director': {
        name: 'General director',
        description: 'Final approval step, full company-wide visibility',
    },
    'security-officer': {
        name: 'Security officer',
        description: 'Company-wide read visibility for credit-limit escalations',
    },
    'portal-admin': {
        name: 'Portal administrator',
        description: 'Manages roles, staff accounts and system settings, no sales actions',
    },
};
