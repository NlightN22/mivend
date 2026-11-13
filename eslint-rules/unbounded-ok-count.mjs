import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

// Marker counts per plugin or package, from git grep on tracked non-test files; run from any directory.
export function countMarkersByGroup(cwd = new URL('..', import.meta.url)) {
    let out = '';
    try {
        out = execFileSync(
            'git',
            [
                'grep',
                '-c',
                'unbounded-ok:',
                '--',
                'apps',
                'packages',
                ':!**/__tests__/**',
                ':!*.test.ts',
            ],
            { encoding: 'utf8', cwd },
        );
    } catch {
        return {};
    }
    const groups = {};
    for (const line of out.split('\n').filter(Boolean)) {
        const sep = line.lastIndexOf(':');
        const file = line.slice(0, sep);
        const parts = file.split('/');
        const depth = parts[0] === 'packages' && parts[1] === 'plugins' ? 3 : 2;
        const group = parts.slice(0, depth).join('/');
        groups[group] = (groups[group] ?? 0) + Number(line.slice(sep + 1));
    }
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const target = new URL('./unbounded-ok-baseline.json', import.meta.url);
    const groups = countMarkersByGroup();
    const lines = Object.entries(groups).map(([k, v]) => `        ${JSON.stringify(k)}: ${v}`);
    writeFileSync(target, `{\n    "groups": {\n${lines.join(',\n')}\n    }\n}\n`);
    process.stdout.write(`baseline written: ${Object.values(groups).reduce((a, b) => a + b, 0)}\n`);
}
