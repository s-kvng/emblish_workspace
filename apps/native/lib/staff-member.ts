import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";

type StaffMember = FunctionReturnType<typeof api.backOffice.staff.me>;

const queries = { me: { query: api.backOffice.staff.me, args: {} } };

/**
 * The signed-in Staff member: undefined while loading, null when the server
 * refuses this session (a Customer, or Staff since deactivated).
 */
export function useStaffMember(): StaffMember | null | undefined {
  const { me } = useQueries(queries);
  if (me instanceof ConvexError && (me.data as { code?: string }).code === "FORBIDDEN") {
    return null;
  }
  if (me instanceof Error) throw me;
  return me as StaffMember | undefined;
}
