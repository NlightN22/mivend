import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { FactorStoreService } from './factor-store.service';
import { TWO_FACTOR_PLUGIN_OPTIONS } from './two-factor.types';
import type { TwoFactorPluginOptions, TwoFactorStage } from './two-factor.types';

@Injectable()
export class TwoFactorPolicyService {
    constructor(
        private factors: FactorStoreService,
        @Inject(TWO_FACTOR_PLUGIN_OPTIONS) private options: TwoFactorPluginOptions,
    ) {}

    get required(): boolean {
        return this.options.required;
    }

    // A user with an active factor always needs the code, even where the obligation is off.
    async stageFor(ctx: RequestContext, userId: string): Promise<TwoFactorStage> {
        if (await this.factors.hasActive(ctx, userId)) return 'VERIFY';
        return this.options.required ? 'ENROL' : 'NONE';
    }

    async isEnforced(ctx: RequestContext, userId: string): Promise<boolean> {
        return (await this.stageFor(ctx, userId)) !== 'NONE';
    }
}
