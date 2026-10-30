# Convex public API is split by surface, not by domain

The Storefront (Customers) and the Back Office (Staff) call the same Convex backend with different auth, so public functions live in `convex/storefront/` and `convex/backOffice/`, each one opening with its surface's guard (`requireCustomer` / a public-by-code check, or `requireStaff` / `requireOwner`). Business logic lives in plain TypeScript helpers under `convex/model/<domain>.ts`, and webhooks, crons and scheduled jobs live in `convex/system/` as internal functions only. We chose this over the Convex default of one file per domain so the security perimeter can be audited by folder and no public function is ever shared by both apps by accident.

## Consequences

A domain change usually touches a `model/` helper plus thin wrappers in one or both surface folders. A function that both apps need gets two wrappers, not one shared export.
