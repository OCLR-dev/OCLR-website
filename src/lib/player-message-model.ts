import { z } from "zod";

export const playerMessageSchema = z.strictObject({
  id: z.string(),
  authorId: z.number(),
  author: z.string(),
  text: z.string(),
  createdAt: z.string(),
  version: z.string(),
});
