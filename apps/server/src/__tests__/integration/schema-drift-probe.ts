import { generateMigration, runMigrations } from '@vendure/core';
import { readFile } from 'fs/promises';

import { config } from '../../vendure-config';

// Run by ts-node (CommonJS): vitest's ESM loader cannot import the migration files.
async function main(): Promise<void> {
    const migrationsOnly = {
        ...config,
        dbConnectionOptions: { ...config.dbConnectionOptions, synchronize: false },
    };
    await runMigrations(migrationsOnly);
    const generated = await generateMigration(migrationsOnly, {
        name: 'drift',
        outputDir: process.argv[2],
    });
    const source = generated ? await readFile(String(generated), 'utf8') : '';
    const up = source.slice(source.indexOf('async up'), source.indexOf('async down'));
    const statements = [...up.matchAll(/query\(`([^`]*)`/g)].map(m => m[1].trim());
    process.stdout.write(`\nDRIFT_JSON:${JSON.stringify(statements)}\n`);
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
