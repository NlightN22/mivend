import gql from 'graphql-tag';
import type { DocumentNode } from 'graphql';
import { AuthenticationStrategy, Injector, RequestContext, User } from '@vendure/core';

import { TwoFactorChallengeService } from './two-factor-challenge.service';
import { TWO_FACTOR_STRATEGY_NAME } from './two-factor.types';

export interface TwoFactorAuthData {
    challenge: string;
    code: string;
}

// The only strategy that opens a session for an account that needs a second step: the challenge
// proves the password was just verified, the code proves the device.
export class TwoFactorAuthenticationStrategy implements AuthenticationStrategy<TwoFactorAuthData> {
    readonly name = TWO_FACTOR_STRATEGY_NAME;
    private challenges!: TwoFactorChallengeService;

    init(injector: Injector): void {
        this.challenges = injector.get(TwoFactorChallengeService);
    }

    defineInputType(): DocumentNode {
        return gql`
            input TwoFactorAuthInput {
                challenge: String!
                code: String!
            }
        `;
    }

    authenticate(ctx: RequestContext, data: TwoFactorAuthData): Promise<User | false | string> {
        return this.challenges.completeSignIn(ctx, data.challenge, data.code);
    }
}
