import { z } from "zod";

export const findingSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  startSide: z.enum(["LEFT", "RIGHT"]).optional(),
  line: z.number().int().positive(),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT"),
  message: z.string(),
});

export type Finding = z.infer<typeof findingSchema>;
