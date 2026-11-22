import { RequestContext, User, VendureEvent } from '@vendure/core';

export class EmailConfirmationRequestedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public user: User,
        public emailAddress: string,
        public token: string,
    ) {
        super();
    }
}
