# mivend

B2B auto parts distribution platform built on [Vendure](https://www.vendure.io/) 3.x.

Hub-spoke architecture: branch locations operate autonomously and sync with
a central hub via RabbitMQ.

## Quick start

```bash
pnpm install
make up
pnpm dev:branch
```

See **[docs/development.md](./docs/development.md)** for the full developer guide.

## License

GPL-3.0-or-later
