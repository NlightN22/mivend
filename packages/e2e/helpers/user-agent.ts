import { devices } from '@playwright/test';

// Every session the e2e suite opens carries this marker, so teardown ends only its own sessions.
export const E2E_USER_AGENT_MARK = 'mivend-e2e';
export const E2E_API_USER_AGENT = `node ${E2E_USER_AGENT_MARK}`;
// The stack balancer sends every request of a worker to one Vite instance (e2e-tcp-balance.mjs).
export const E2E_INSTANCE_TAG = `e2e-inst=${process.env.TEST_PARALLEL_INDEX ?? '0'}`;
export const E2E_BROWSER_USER_AGENT = `${devices['Desktop Chrome'].userAgent} ${E2E_USER_AGENT_MARK} ${E2E_INSTANCE_TAG}`;
