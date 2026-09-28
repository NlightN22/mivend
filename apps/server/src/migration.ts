import { generateMigration, revertLastMigration, runMigrations } from '@vendure/core';
import path from 'path';

import { config } from './vendure-config';

// Onboarding migrations after `synchronize: true`-only development (issue #147: production has
// no migration tooling yet). Usage: `pnpm migration:generate <name>` / `pnpm migration:run` /
// `pnpm migration:revert`, always against the target contour's own env file (see
// apps/server/package.json's scripts and docs/environments.md).
const migrationsDir = path.join(__dirname, 'migrations');

async function main(): Promise<void> {
    const [command, name] = process.argv.slice(2);
    switch (command) {
        case 'generate':
            await generateMigration(config, {
                name: name ?? 'migration',
                outputDir: migrationsDir,
            });
            break;
        case 'run':
            await runMigrations(config);
            break;
        case 'revert':
            await revertLastMigration(config);
            break;
        default:
            throw new Error('Usage: migration.ts <generate|run|revert> [name]');
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
