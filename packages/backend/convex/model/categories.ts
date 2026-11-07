import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function listCategories(ctx: Pick<QueryCtx, "db">) {
  return await ctx.db.query("categories").withIndex("by_sortOrder").collect();
}

/** A trimmed, non-blank name no other Category has, ignoring case. */
async function validName(ctx: Pick<QueryCtx, "db">, name: string, except?: Id<"categories">) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "INVALID_NAME",
      message: "Give the Category a name.",
    });
  }
  const clash = (await listCategories(ctx)).find(
    (category) => category._id !== except && category.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) {
    throw new ConvexError({
      code: "DUPLICATE_CATEGORY",
      message: `There's already a Category called ${clash.name}.`,
    });
  }
  return trimmed;
}

/** Adds a Category at the end of the list. */
export async function createCategory(ctx: Pick<MutationCtx, "db">, name: string) {
  const trimmed = await validName(ctx, name);
  const last = await ctx.db.query("categories").withIndex("by_sortOrder").order("desc").first();
  return await ctx.db.insert("categories", {
    name: trimmed,
    sortOrder: (last?.sortOrder ?? 0) + 1,
  });
}

async function getCategory(ctx: Pick<QueryCtx, "db">, categoryId: Id<"categories">) {
  const category = await ctx.db.get(categoryId);
  if (!category) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "That Category doesn't exist.",
    });
  }
  return category;
}

export async function renameCategory(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories">,
  name: string,
) {
  await getCategory(ctx, categoryId);
  await ctx.db.patch(categoryId, {
    name: await validName(ctx, name, categoryId),
  });
}

/** Swaps a Category with its neighbour; at either end of the list it stays put. */
export async function moveCategory(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories">,
  direction: "up" | "down",
) {
  const category = await getCategory(ctx, categoryId);
  const neighbour = await ctx.db
    .query("categories")
    .withIndex("by_sortOrder", (q) =>
      direction === "up"
        ? q.lt("sortOrder", category.sortOrder)
        : q.gt("sortOrder", category.sortOrder),
    )
    .order(direction === "up" ? "desc" : "asc")
    .first();
  if (!neighbour) return;
  await ctx.db.patch(category._id, { sortOrder: neighbour.sortOrder });
  await ctx.db.patch(neighbour._id, { sortOrder: category.sortOrder });
}
