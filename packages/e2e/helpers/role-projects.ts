// A manager test without an `@on:<project>` tag in its title runs under every role project; a tagged one
// only under the listed ones, so nothing is reported as skipped.
export const ROLE_TAG_PREFIX = '@on:';

export function roleProjectGrep(project: string): RegExp {
    return new RegExp(`^(?!.*${ROLE_TAG_PREFIX})|${ROLE_TAG_PREFIX}${project}(?![\\w-])`);
}
