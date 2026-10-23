export const SUPERADMIN = {
    identifier: process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    password: process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
};

// Created by seed-erp.mjs in the e2e stack, not here.
// Logs in only; accounts match .tests/accounts.md, one per manager-portal KPI variant.
export const MANAGER_ACCOUNTS = {
    operator: { username: 'ivan.operator@mivend.dev', password: 'Password123!' },
    manager: { username: 'petr.manager@mivend.dev', password: 'Password123!' },
    departmentHead: { username: 'olga.depthead@mivend.dev', password: 'Password123!' },
    portalAdmin: { username: 'anna.portaladmin@mivend.dev', password: 'Password123!' },
} as const;
