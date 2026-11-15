import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const LIST_URL = new URL('./lint-exceptions.json', import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Warnings of a checked rule that are not on the exceptions list, from `eslint -f json` output.
export function unlistedWarnings(results, list, root = ROOT) {
    const accepted = new Set(list.exceptions.map(e => `${e.rule} ${e.file}`));
    const found = [];
    for (const result of results) {
        const file = relative(root, result.filePath);
        for (const msg of result.messages) {
            if (!list.checkedRules.includes(msg.ruleId)) continue;
            if (accepted.has(`${msg.ruleId} ${file}`)) continue;
            found.push({ rule: msg.ruleId, file, line: msg.line, message: msg.message });
        }
    }
    return found;
}

// Usage: pnpm exec eslint . -f json -o lint.json; node eslint-rules/check-lint-exceptions.mjs lint.json
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const results = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const list = JSON.parse(readFileSync(LIST_URL, 'utf8'));
    const found = unlistedWarnings(results, list);
    for (const w of found) process.stderr.write(`${w.file}:${w.line} ${w.rule} ${w.message}\n`);
    process.stdout.write(
        `lint exceptions: ${found.length} unlisted warning(s) in ${list.checkedRules.length} checked rule(s)\n`,
    );
    process.exit(found.length === 0 ? 0 : 1);
}
