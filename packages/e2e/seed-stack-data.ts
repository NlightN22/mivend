import { writeFileSync } from 'fs';

import { seedStackData } from './stack-data';

export default async function seedStack(): Promise<void> {
    const out = process.env.E2E_ORDER_FILE;
    if (!out) throw new Error('E2E_ORDER_FILE is not set');
    console.log('seed-stack: start');
    writeFileSync(out, JSON.stringify(await seedStackData()));
}
