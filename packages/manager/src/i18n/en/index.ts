type Catalogue = Record<string, unknown>;

const modules = import.meta.glob<{ default: Catalogue }>(['./*.ts', '!./index.ts'], {
    eager: true,
});

export default Object.fromEntries(
    Object.entries(modules).map(([path, module]) => [
        path.replace(/^\.\/(.+)\.ts$/, '$1'),
        module.default,
    ]),
) as Record<string, Catalogue>;
