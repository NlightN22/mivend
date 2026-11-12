import type en from '../en';

type Catalogue = Record<string, unknown>;

const modules = import.meta.glob<{ default: Catalogue }>(['./*.ts', '!./index.ts'], {
    eager: true,
});

const ru: typeof en = Object.fromEntries(
    Object.entries(modules).map(([path, module]) => [
        path.replace(/^\.\/(.+)\.ts$/, '$1'),
        module.default,
    ]),
);

export default ru;
