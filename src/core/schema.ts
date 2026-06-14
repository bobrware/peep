import { z } from "zod";

export const findingSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT"),
  message: z.string(),
});

export type Finding = z.infer<typeof findingSchema>;
