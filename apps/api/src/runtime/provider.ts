import { Outcome, Runtime, Session, SessionEvent } from "@automomo/protocol";

export interface RuntimeProviderResult {
  events: SessionEvent[];
  outcome: Outcome;
}

export interface RuntimeProvider {
  run(input: { session: Session; runtime: Runtime; now: string; timeoutMs?: number }): Promise<RuntimeProviderResult>;
}
