import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// A file matching this changes module, global, env or timer state, so it keeps its own module cache.
const STATEFUL =
    /\bvi\.(mock|doMock|stubGlobal|stubEnv|useFakeTimers|setSystemTime|spyOn|resetModules|restoreAllMocks)\(|process\.env(\.\w+|\[[^\]]+\])?\s*=[^=]|\b(delete\s+process\.env|Object\.assign\(\s*process\.env)|\bglobal(This)?(\)|\s+as\s+[^)]+\))?(\.\w+|\[[^\]]+\])\s*=[^=]|\b(Date|Math|JSON|console)\.\w+\s*=[^=]|\.prototype\.\w+\s*=[^=]|Logger\.overrideLogger/;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

export function listTestFiles(dir: string, skip: ReadonlySet<string> = new Set()): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (SKIP_DIRS.has(entry.name) || skip.has(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listTestFiles(path, skip);
        return entry.name.endsWith('.test.ts') ? [path] : [];
    });
}

// Importing the same libraries per file dominated run time; stateless files share one module cache per worker.
// Packages without stateful files keep a single plain project, because extra projects cost a second worker pool.
export function isolationOptions(files: string[], include: string): object {
    const stateful = files.filter(file => STATEFUL.test(readFileSync(file, 'utf8')));
    if (stateful.length === 0) return { include: [include], isolate: false };
    const shared = files.filter(file => !stateful.includes(file));
    return {
        projects: [
            { extends: true, test: { name: 'shared-modules', include: shared, isolate: false } },
            { extends: true, test: { name: 'stateful', include: stateful, isolate: true } },
        ],
    };
}
