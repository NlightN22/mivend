// One place for the per-test budgets; checkout and PDF flows are multi-step and slower than a page view.
export const TEST_TIMEOUT_MS = {
    standard: 60_000,
    slow: 90_000,
    pdf: 120_000,
    checkoutLong: 150_000,
} as const;
