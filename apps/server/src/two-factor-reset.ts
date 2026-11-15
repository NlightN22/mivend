import { withClientAggregateLock } from 'shared';

export interface SqlClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ResetOutcome {
    userId: string;
    factorsRemoved: number;
    sessionsRemoved: number;
}

// Operational recovery for an account nobody can sign in to (a locked-out superadmin). Runs under the
// same per-user advisory lock as the plugin and writes the audit row the plugin's versioning writes.
export async function resetTwoFactor(
    client: SqlClient,
    identifier: string,
    reason: string,
): Promise<ResetOutcome | null> {
    const users = await client.query(
        `SELECT id FROM "user" WHERE identifier = $1 AND "deletedAt" IS NULL LIMIT 1`,
        [identifier],
    );
    const userId = users.rows[0] ? String(users.rows[0].id) : null;
    if (!userId) return null;
    return withClientAggregateLock(client, `two-factor:${userId}`, async () => {
        const factors = await client.query(
            `DELETE FROM two_factor_factor WHERE "userId" = $1 RETURNING id`,
            [userId],
        );
        await client.query(`DELETE FROM two_factor_token WHERE "userId" = $1`, [userId]);
        const sessions = await client.query(
            `DELETE FROM session WHERE "userId" = $1 RETURNING id`,
            [Number(userId)],
        );
        await client.query(
            `INSERT INTO entity_version ("entityName", "entityId", action, comment)
             VALUES ('TwoFactor', $1, 'deactivate', $2)`,
            [userId, `two-factor reset by operator: ${reason}`],
        );
        return {
            userId,
            factorsRemoved: factors.rows.length,
            sessionsRemoved: sessions.rows.length,
        };
    });
}
