// Mutation testing pilot (docs/testing-strategy.md's "Mutation testing" section) — deliberately
// scoped to ONE small, critical module before deciding whether to expand anywhere else.
// Target: IdempotencyService.claim() (packages/plugins/acquiring/src/idempotency.service.ts) —
// exactly the kind of module AGENTS.md/docs/testing-patterns.md calls out as worth mutation
// testing (an idempotency decision), and one this session already found a real, previously
// untested concurrency bug in — a good candidate for checking whether the existing test suite's
// green result actually reflects strong coverage or just untested-but-passing code.
//
// Uses the root vitest config/runner (vitest 4.x) rather than plugin-acquiring's own
// devDependency-pinned vitest (1.x, incompatible with @stryker-mutator/vitest-runner's
// `vitest >=2.0.0` peer requirement) — `mutate` and `ignorePatterns` below scope the actual run
// down to the pilot file and its test files regardless.
export default {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    reporters: ['clear-text', 'progress', 'html'],
    coverageAnalysis: 'perTest',
    vitest: {
        configFile: 'vitest.config.ts',
    },
    mutate: ['packages/plugins/acquiring/src/idempotency.service.ts'],
    // Both the mock-based unit tests and the real-Postgres integration tests exercise
    // IdempotencyService — but Stryker's vitest-runner drives the given vitest config, which
    // excludes __tests__/integration by default (see vitest.config.ts) and integration tests
    // need a live Postgres StrykerJS doesn't manage. The pilot therefore evaluates mutation
    // coverage against idempotency.service.test.ts only — see the pilot writeup in
    // docs/testing-strategy.md's "Mutation testing" section for what this does and doesn't prove.
    disableTypeChecks: true,
};
