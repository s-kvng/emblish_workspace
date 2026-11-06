# Convex public API is split by surface, not by domain

The Storefront (Customers) and the Back Office (Staff) call the same Convex backend with different auth, so public functions live in `convex/storefront/` and `convex/backOffice/`, each one opening with its surface's guard (`requireCustomer` / a public-by-code check, or `requireStaff` / `requireOwner`). Business logic lives in plain TypeScript helpers under `convex/model/<domain>.ts`, and webhooks, crons, scheduled jobs and the internal steps that public actions or Better Auth call live in `convex/system/` as internal functions only. We chose this over the Convex default of one file per domain so the security perimeter can be audited by folder and no public function is ever shared by both apps by accident.

The one Back Office exception is accepting an invitation: the invitee isn't Staff yet, so `convex/backOffice/invitation.ts` opens with a check on the invitation's token instead of `requireStaff`, the Back Office's equivalent of the Storefront's public-by-code check. It stays in `backOffice/` because only the Back Office app calls it, and so the folder still holds every way into Staff access.

## Consequences

A domain change usually touches a `model/` helper plus thin wrappers in one or both surface folders. A function that both apps need gets two wrappers, not one shared export.

Auditing the Back Office perimeter means checking that every file opens with `requireStaff` / `requireOwner`, except `backOffice/invitation.ts`, whose functions must open with the invitation token check and do nothing for a closed invitation beyond saying why it's closed. Any other token-gated Back Office function needs this ADR amended first.
