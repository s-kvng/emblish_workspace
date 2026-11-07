import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/guards";
import { createCategory, listCategories, moveCategory, renameCategory } from "../model/categories";

/** The flat Category list, in Storefront order. */
export const list = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("categories"), name: v.string() })),
  handler: async (ctx) => {
    await requireStaff(ctx);
    return (await listCategories(ctx)).map(({ _id, name }) => ({ _id, name }));
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("categories"),
  handler: async (ctx, { name }) => {
    await requireStaff(ctx);
    return await createCategory(ctx, name);
  },
});

export const rename = mutation({
  args: { categoryId: v.id("categories"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { categoryId, name }) => {
    await requireStaff(ctx);
    await renameCategory(ctx, categoryId, name);
    return null;
  },
});

export const move = mutation({
  args: {
    categoryId: v.id("categories"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, { categoryId, direction }) => {
    await requireStaff(ctx);
    await moveCategory(ctx, categoryId, direction);
    return null;
  },
});
