---
name: principle-migrate-callers-then-delete-legacy-apis
description: "Apply when introducing a new internal API while old callers still exist. Migrate callers and delete the old API in the same wave instead of preserving compatibility layers."
---

# Migrate Callers Then Delete Legacy APIs

When you introduce a new internal API while old callers still exist, migrate the callers and delete the old API in the same wave instead of keeping a compatibility layer.

**Not for:** public, versioned API routes (removing a route or field needs a new version) or another folder's public contract (report the change, don't edit it).

- Update tests to assert the new contract, and delete tests that only protect pre-refactor implementation details

**When this applies:**
- No external users depend on backward compatibility
- The project can absorb coordinated breaking changes
- The new API is part of a simplification or refactor initiative
