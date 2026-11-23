import { RequestContext, User, VendureEvent } from '@vendure/core';

export class EmailChangeRequestedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public user: User,
        public oldEmailAddress: string,
        public maskedNewEmailAddress: string,
    ) {
        super();
    }
}
