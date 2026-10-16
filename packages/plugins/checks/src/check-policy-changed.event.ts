import { RequestContext, VendureEvent } from '@vendure/core';

import type { Consequence } from './types';

export class CheckPolicyChangedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public checkCode: string,
        public stage: string,
        public before: { consequence: Consequence; enabled: boolean },
    ) {
        super();
    }
}
