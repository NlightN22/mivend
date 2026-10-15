import { adminApi } from './client';
import { ChangeOwnPasswordDocument } from './generated/graphql';

// Vendure core's updateActiveAdministrator does not require the current password;
// the caller is already an authenticated session, so none is requested.
export async function changeOwnPassword(newPassword: string): Promise<void> {
    await adminApi(ChangeOwnPasswordDocument, { password: newPassword });
}
