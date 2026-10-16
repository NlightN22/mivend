import { devices } from '@playwright/test';

// Every session the e2e suite opens carries this marker, so teardown ends only its own sessions.
export const E2E_USER_AGENT_MARK = 'mivend-e2e';
export const E2E_API_USER_AGENT = `node ${E2E_USER_AGENT_MARK}`;
export const E2E_BROWSER_USER_AGENT = `${devices['Desktop Chrome'].userAgent} ${E2E_USER_AGENT_MARK}`;
