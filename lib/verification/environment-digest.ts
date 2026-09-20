import crypto from 'node:crypto';

export interface RuntimeEnvironmentSpec {
  language: string;
  engineVersion: string;
  architecture: string;
  vCpuLimit: number;
  memoryLimitMb: number;
  wallClockTimeoutMs: number;
  networkEnabled: boolean;
}

export const PINNED_RUNTIMES: Record<string, RuntimeEnvironmentSpec> = {
  'sql-window-functions': {
    language: 'DuckDB-SQL',
    engineVersion: 'DuckDB 1.5.5',
    architecture: 'x86_64-linux',
    vCpuLimit: 1,
    memoryLimitMb: 128,
    wallClockTimeoutMs: 2000,
    networkEnabled: false,
  },
  'python-concurrency': {
    language: 'Python',
    engineVersion: 'CPython 3.13.x',
    architecture: 'x86_64-linux',
    vCpuLimit: 1,
    memoryLimitMb: 256,
    wallClockTimeoutMs: 2000,
    networkEnabled: false,
  },
  'java.concurrency_memory': {
    language: 'Java',
    engineVersion: 'OpenJDK 21.x',
    architecture: 'x86_64-linux',
    vCpuLimit: 1,
    memoryLimitMb: 256,
    wallClockTimeoutMs: 3000,
    networkEnabled: false,
  },
};

export function getPinnedRuntime(domain: string): RuntimeEnvironmentSpec {
  return PINNED_RUNTIMES[domain] ?? {
    language: 'disabled',
    engineVersion: 'unknown',
    architecture: 'unknown',
    vCpuLimit: 0,
    memoryLimitMb: 0,
    wallClockTimeoutMs: 0,
    networkEnabled: false,
  };
}

export function computeEnvironmentDigest(spec: RuntimeEnvironmentSpec): string {
  return crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex');
}
