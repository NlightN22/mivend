import { RequestContext, User, VendureEvent } from '@vendure/core';

export class TwoFactorEnabledEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly user: User,
    ) {
        super();
    }
}

export class TwoFactorChangedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly user: User,
    ) {
        super();
    }
}

export class TwoFactorRecoveryRequestedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly user: User,
        public readonly token: string,
    ) {
        super();
    }
}

export class TwoFactorRecoveryCompletedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly user: User,
    ) {
        super();
    }
}
