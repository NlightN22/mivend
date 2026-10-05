---
name: search-backend-parity
description: Mandatory before extending or changing anything the storefront/manager search sends to or reads from a search backend (filters, facets, sort, response fields) in packages/plugins/search. The internal and external backends must keep one identical interface — read before touching either.
---

# Search backend parity

`packages/plugins/search` has two backends chosen per contour (`SEARCH_BACKEND`): `internal`
(Elasticsearch) and `external` (search-service `POST /resolve-query`). Callers must not be able to
tell them apart: same input, same `SearchResponse` shape, same filter/facet semantics.

## Rules

1. **One interface.** Everything the shop API sends or reads (a filter, a facet group, a sort, a
   response field) is defined on the backend-agnostic interface, never on one backend only.
2. **Extend both in the same change.** When the external side gains a capability, the internal
   backend gets the same interface member in the same PR. If it is not implemented yet, it
   returns the documented empty/no-op result and a test pins that behavior; open an issue for the
   real implementation (see #177).
3. **Same semantics.** Filters combine identically: OR within one facet, AND across facets;
   a filter that resolves to nothing is `unsatisfiable` (empty result), never unfiltered.
   Facet codes and FacetValue shapes are identical (e.g. `characteristic:<key>`).
4. **Tests prove parity.** A change needs a contract-style test that runs the same scenarios
   against both backends (or, until #177 lands, against the shared mapper/resolver plus a pinned
   internal no-op). Automated tests use local seeded data only, never staging-integration.
5. **Document it.** Update the capabilities list in `search-capabilities.ts` so the UI hides
   controls a backend cannot serve.

## Checklist

- [ ] Interface changed in one place; both backends compile against it
- [ ] Internal backend implemented or pinned no-op + issue
- [ ] Same-scenario tests for both backends
- [ ] `search-capabilities.ts` updated
- [ ] `make lint`, `make test` (and `make test-int` if integration tests changed)
