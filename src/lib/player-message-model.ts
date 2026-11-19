import { z } from "zod";

export const playerMessageSchema = z.strictObject({
  id: z.string(),
  authorId: z.number(),
  author: z.string(),
  text: z.string(),
  createdAt: z.string(),
  version: z.string(),
});

export const liruGalleryMessageSchema = playerMessageSchema.extend({
  parentId: z.uuid().optional(),
});
export type LiruGalleryMessage = z.infer<typeof liruGalleryMessageSchema>;
