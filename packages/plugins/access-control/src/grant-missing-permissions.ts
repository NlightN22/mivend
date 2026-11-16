import { DEFAULT_ROLES } from './default-roles';

export interface SqlClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface GrantOutcome {
    roleCode: string;
    added: string[];
}

// The only way a right added to DEFAULT_ROLES reaches an existing role. Adds what is missing,
// removes nothing, skips roles that do not exist; running it again changes nothing.
export async function grantMissingDefaultPermissions(client: SqlClient): Promise<GrantOutcome[]> {
    const outcomes: GrantOutcome[] = [];
    for (const definition of DEFAULT_ROLES) {
        await client.query('BEGIN');
        try {
            // unbounded-ok: role.code identifies one row
            const found = await client.query(
                `SELECT permissions FROM role WHERE code = $1 FOR UPDATE`,
                [definition.code],
            );
            if (found.rows[0]) {
                const stored = String(found.rows[0].permissions)
                    .split(',')
                    .filter(permission => permission !== '');
                const wanted = ['Authenticated', ...definition.permissions];
                const added = wanted.filter(permission => !stored.includes(permission));
                if (added.length > 0) {
                    await client.query(
                        `UPDATE role SET permissions = $2, "updatedAt" = now() WHERE code = $1`,
                        [definition.code, [...stored, ...added].join(',')],
                    );
                    outcomes.push({ roleCode: definition.code, added });
                }
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    }
    return outcomes;
}
