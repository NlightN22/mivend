import { UserInputError } from '@vendure/core';

export type PortalAccessSkipCode =
    | 'inactive'
    | 'no_contact'
    | 'already_active'
    | 'no_portal_access'
    | 'no_inn'
    | 'inn_duplicate';

// A precondition that no longer holds; bulk runs report it as a skip, not a failure.
export class PortalAccessPreconditionError extends UserInputError {
    constructor(
        readonly code: PortalAccessSkipCode,
        message: string,
    ) {
        super(message);
    }
}
