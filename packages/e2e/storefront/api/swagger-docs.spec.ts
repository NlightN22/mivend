import { test, expect } from '@playwright/test';

// Smoke coverage for the REST API docs (issue #28) — not a storefront feature,
// hits the server directly by absolute URL (bypasses this project's
// storefront baseURL). Deliberately simple: "does it work at all", not a
// full schema diff — the real regression risk here is the whole route being
// silently 404 (see docs/ai/PROJECT_CONTEXT.md's onBeforeAppListen gotcha),
// which this would have caught immediately.
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

test.describe('REST API docs (Swagger)', () => {
    test('/api-docs-json serves a real OpenAPI document with field-level schemas', async ({
        request,
    }) => {
        const response = await request.get(`${SERVER_URL}/api-docs-json`);
        expect(response.status()).toBe(200);

        const doc = await response.json();
        expect(doc.paths).toHaveProperty('/erp/import/batch');
        expect(doc.paths).toHaveProperty('/erp/import/runs/{exchangeId}');
        expect(doc.paths).toHaveProperty('/erp/callback/order-status');

        // Guards against the exact regression hit during implementation: the
        // document can build with correct schemas while the route itself is
        // dead (404) if SwaggerModule is mounted at the wrong bootstrap phase.
        const batchImportSchema = doc.components.schemas.BatchImportRequestDto;
        expect(Object.keys(batchImportSchema.properties)).toEqual(
            expect.arrayContaining(['exchangeId', 'records']),
        );
    });

    test('/api-docs serves the Swagger UI page', async ({ request }) => {
        const response = await request.get(`${SERVER_URL}/api-docs`);
        expect(response.status()).toBe(200);
        const html = await response.text();
        expect(html).toContain('Swagger UI');
    });
});
