import { adminApi } from './client';

// Vendure's own built-in self-service mutation (no current-password confirmation required by
// core — the caller is already an authenticated session) — see @vendure/core's
// AdministratorResolver.updateActiveAdministrator.
export async function changeOwnPassword(newPassword: string): Promise<void> {
    await adminApi<{ updateActiveAdministrator: { id: string } }>(
        `mutation ChangeOwnPassword($password: String!) {
            updateActiveAdministrator(input: { password: $password }) { id }
        }`,
        { password: newPassword },
    );
}
