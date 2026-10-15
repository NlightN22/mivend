import { test, expect } from '@playwright/test';

// Absolute URL bypasses the storefront baseURL, so this runs against the server directly.
// Only checks the route responds: docs can build with correct schemas while the route 404s.
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

        // A correct document doesn't prove the route is served: SwaggerModule mounted at the
        // wrong bootstrap phase yields a 404 with a valid schema.
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
