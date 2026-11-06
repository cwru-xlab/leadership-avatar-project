import type {
  ServerOnlyHarness,
  TechnicalExecutionLimits,
  TechnicalExecutionResult,
} from "./execution";

export interface ExecutePythonInput {
  source: string;
  harness: ServerOnlyHarness;
  limits: TechnicalExecutionLimits;
  correlationId: string;
}

export interface PythonSandbox {
  executePython(input: ExecutePythonInput): Promise<TechnicalExecutionResult>;
}

/**
 * Deliberately fail closed until a managed isolated execution provider is
 * approved and configured. The Next.js process must never execute candidate
 * source directly, including during local development.
 */
const unavailableSandbox: PythonSandbox = {
  async executePython() {
    return { status: "failed", errorCategory: "unavailable" };
  },
};

export function getPythonSandbox(): PythonSandbox {
  return unavailableSandbox;
}
