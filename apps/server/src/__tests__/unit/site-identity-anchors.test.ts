import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '../../../../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

// Each nginx sub_filter silently does nothing if its search string stops matching the served HTML.
const ANCHORS = [
    {
        pkg: 'storefront',
        html: 'packages/storefront/index.html',
        anchors: [
            '<title>Shop</title>',
            'href="/favicon.svg"',
            '<meta name="site-name" content="Shop" />',
        ],
    },
    {
        pkg: 'manager',
        html: 'packages/manager/index.html',
        anchors: [
            '<title>Shop manager portal</title>',
            'href="/favicon.svg"',
            '<meta name="site-name" content="Shop" />',
        ],
    },
    {
        pkg: 'dashboard',
        html: 'packages/dashboard/node_modules/@vendure/dashboard/index.html',
        anchors: ['<link rel="icon" type="image/png" href="/favicon.png" />'],
    },
];

describe('site identity sub_filter anchors', () => {
    for (const { pkg, html, anchors } of ANCHORS) {
        it(`${pkg}: every nginx anchor literally occurs in the HTML it rewrites`, () => {
            const template = read(`packages/${pkg}/nginx.conf.template`);
            const page = read(html);
            for (const anchor of anchors) {
                expect(template).toContain(`sub_filter '${anchor}'`);
                expect(page).toContain(anchor);
            }
        });
    }

    it('the default icon files exist in the portals that ship them', () => {
        for (const pkg of ['storefront', 'manager']) {
            expect(() => read(`packages/${pkg}/public/favicon.svg`)).not.toThrow();
        }
    });
});
