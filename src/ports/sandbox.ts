export type SandboxCreateInput = {
  owner: string;
  repo: string;
  pullNumber: number;
};

export type SandboxRunOptions = {
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type SandboxRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SandboxSession = {
  id: string;
  run: (command: string, options?: SandboxRunOptions) => Promise<SandboxRunResult>;
  readFile: (path: string) => Promise<string>;
  writeFile?: (path: string, contents: string) => Promise<void>;
  dispose: () => Promise<void>;
};

export type SandboxPort = {
  createSession: (input: SandboxCreateInput) => Promise<SandboxSession>;
};
