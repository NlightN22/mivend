import { adminApi } from './client';
import { ChangeOwnPasswordDocument } from './generated/graphql';

// Vendure's own built-in self-service mutation (no current-password confirmation required by
// core — the caller is already an authenticated session) — see @vendure/core's
// AdministratorResolver.updateActiveAdministrator.
export async function changeOwnPassword(newPassword: string): Promise<void> {
    await adminApi(ChangeOwnPasswordDocument, { password: newPassword });
}
