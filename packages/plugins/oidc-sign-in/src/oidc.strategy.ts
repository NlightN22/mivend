import gql from 'graphql-tag';
import type { DocumentNode } from 'graphql';
import { AuthenticationStrategy, Injector, RequestContext, User } from '@vendure/core';

import { OidcSignInService } from './oidc-sign-in.service';
import { OIDC_STRATEGY_NAME } from './oidc.types';

export interface OidcAuthData {
    state: string;
}

// Opens a session only for a request the callback step has already verified; it never talks to the provider.
export class OidcAuthenticationStrategy implements AuthenticationStrategy<OidcAuthData> {
    readonly name = OIDC_STRATEGY_NAME;
    private signIn!: OidcSignInService;

    init(injector: Injector): void {
        this.signIn = injector.get(OidcSignInService);
    }

    defineInputType(): DocumentNode {
        return gql`
            input OidcAuthInput {
                state: String!
            }
        `;
    }

    authenticate(ctx: RequestContext, data: OidcAuthData): Promise<User | false> {
        return this.signIn.claim(ctx, data.state);
    }
}
