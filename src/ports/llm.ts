export type GenerateObjectOptions<TSchema = unknown> = {
  schema: TSchema;
  prompt: string;
};

export type LlmPort<TObject = unknown, TSchema = unknown> = {
  generateObject: (options: GenerateObjectOptions<TSchema>) => Promise<TObject>;
};
