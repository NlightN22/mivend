import { describe, it, expect } from 'vitest';

import { CreditLimitCheckService } from '../../credit-limit-check.service';
import { Counterparty } from '../../entities/counterparty.entity';
import { Contract } from '../../entities/contract.entity';

// Pure decision-function coverage (issue #50's "facility + sublimits" model) — no
// RequestContext/DB needed, see decide()'s own doc comment. check()'s thin DB-loading wrapper is
// covered by the ContractStreamHandler/ContractService integration tests instead.
describe('CreditLimitCheckService.decide', () => {
    const service = new CreditLimitCheckService(null as never, null as never);

    const counterparty = (creditLimit: number, creditBalance: number) =>
        ({ creditLimit, creditBalance }) as Pick<Counterparty, 'creditLimit' | 'creditBalance'>;

    const contract = (
        controlledIndividually: boolean | null,
        creditLimit: string | null,
    ): Pick<Contract, 'controlledIndividually' | 'creditLimit'> => ({
        controlledIndividually,
        creditLimit,
    });

    it('is within limit on both checks when the contract has its own cap and both balances are under limit', () => {
        const decision = service.decide(counterparty(100_000, 50_000), contract(true, '10000'));
        expect(decision.aggregate.status).toBe('within-limit');
        expect(decision.contract.status).toBe('undetermined');
        expect(decision.withinLimit).toBe(true);
    });

    it('exceeds the aggregate check when the counterparty balance is over its creditLimit', () => {
        const decision = service.decide(counterparty(100_000, 150_000), contract(false, null));
        expect(decision.aggregate.status).toBe('exceeds-limit');
        expect(decision.withinLimit).toBe(false);
    });

    it('is not-applicable for the contract check when controlledIndividually is false, even though creditLimit is set — the explicitly-retracted inference case', () => {
        const decision = service.decide(counterparty(100_000, 50_000), contract(false, '10000'));
        expect(decision.contract.status).toBe('not-applicable');
        expect(decision.contract.creditLimit).toBe(10_000);
    });

    it('is not-applicable for the contract check when controlledIndividually is null (never sent)', () => {
        const decision = service.decide(counterparty(100_000, 50_000), contract(null, '10000'));
        expect(decision.contract.status).toBe('not-applicable');
    });

    it('is not-applicable (not undetermined) when controlledIndividually is true but no contract creditLimit is set', () => {
        const decision = service.decide(counterparty(100_000, 50_000), contract(true, null));
        expect(decision.contract.status).toBe('not-applicable');
        expect(decision.contract.creditLimit).toBeNull();
    });

    it('is undetermined for the contract check when controlledIndividually is true and a creditLimit exists — no per-contract balance source yet', () => {
        const decision = service.decide(counterparty(100_000, 50_000), contract(true, '25000'));
        expect(decision.contract.status).toBe('undetermined');
        expect(decision.contract.creditLimit).toBe(25_000);
        // undetermined never blocks on its own — only the aggregate check drives withinLimit here.
        expect(decision.withinLimit).toBe(true);
    });

    it('is not-applicable when no contract is attributed to the order at all', () => {
        const decision = service.decide(counterparty(100_000, 50_000), null);
        expect(decision.contract.status).toBe('not-applicable');
        expect(decision.withinLimit).toBe(true);
    });
});
