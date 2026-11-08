import { ResolveField, Resolver } from '@nestjs/graphql';

interface Typed {
    __typename: string;
}

@Resolver('StartTwoFactorSignInResult')
export class StartTwoFactorSignInResultResolver {
    @ResolveField()
    __resolveType(value: Typed): string {
        return value.__typename;
    }
}

@Resolver('StartTwoFactorEnrolmentResult')
export class StartTwoFactorEnrolmentResultResolver {
    @ResolveField()
    __resolveType(value: Typed): string {
        return value.__typename;
    }
}

@Resolver('ConfirmTwoFactorEnrolmentResult')
export class ConfirmTwoFactorEnrolmentResultResolver {
    @ResolveField()
    __resolveType(value: Typed): string {
        return value.__typename;
    }
}

@Resolver('CompleteTwoFactorRecoveryResult')
export class CompleteTwoFactorRecoveryResultResolver {
    @ResolveField()
    __resolveType(value: Typed): string {
        return value.__typename;
    }
}

@Resolver('RequestTwoFactorRecoveryResult')
export class RequestTwoFactorRecoveryResultResolver {
    @ResolveField()
    __resolveType(value: Typed): string {
        return value.__typename;
    }
}
