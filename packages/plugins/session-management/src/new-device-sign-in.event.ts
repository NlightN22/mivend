import { RequestContext, User, VendureEvent } from '@vendure/core';

export class NewDeviceSignInEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public user: User,
        public deviceLabel: string,
        public signedInAt: Date,
    ) {
        super();
    }
}
