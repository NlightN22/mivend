// A second-factor method the user proves possession of with a code. TOTP is the only one built;
// a delivered-code method (SMS) would add a "send challenge" step and register here the same way.
export interface SecondFactorMethod {
    readonly id: string;
    createSecret(): string;
    enrolmentUri(secret: string, account: string, issuer: string): string;
    // Accepted counter/time step, or null; a value at or below lastUsedStep is a replay.
    verify(secret: string, code: string, nowMs: number, lastUsedStep: number | null): number | null;
}

export class SecondFactorMethodRegistry {
    private readonly methods = new Map<string, SecondFactorMethod>();

    constructor(methods: SecondFactorMethod[]) {
        for (const method of methods) this.methods.set(method.id, method);
    }

    get(id: string): SecondFactorMethod {
        const method = this.methods.get(id);
        if (!method) throw new Error(`Unknown second factor method: ${id}`);
        return method;
    }
}
