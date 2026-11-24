// A manager test without an `@on:<project>` tag in its title runs under the operator, manager and department-head projects; a tagged one
// only under the listed ones, so nothing is reported as skipped. `@read-only` marks parallel-safe tests.
export const ROLE_TAG_PREFIX = '@on:';

// The portal admin (staff accounts only), the general director (duplicates the others' coverage) and the superadmin
// (the only holder of ManageAccessControl) run only the specs that name them.
const EXPLICIT_ONLY = ['manager-portal-admin', 'manager-general-director', 'manager-superadmin'];

export function roleProjectGrep(project: string): RegExp {
    if (EXPLICIT_ONLY.includes(project))
        return new RegExp(`${ROLE_TAG_PREFIX}${project}(?![\\w-])`);
    return new RegExp(`^(?!.*${ROLE_TAG_PREFIX})|${ROLE_TAG_PREFIX}${project}(?![\\w-])`);
}
