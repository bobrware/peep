export type GenerateObjectOptions<TSchema = unknown> = {
  schema: TSchema;
  prompt: string;
};

export type LlmPort = {
  generateObject: <TObject, TSchema = unknown>(
    options: GenerateObjectOptions<TSchema>,
  ) => Promise<TObject>;
};
