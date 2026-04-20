import { Runtime, Session } from "@automomo/protocol";
import { RuntimeProvider } from "./provider";
import { runShellRuntime } from "./shell";

export class ShellRuntimeProvider implements RuntimeProvider {
  async run(input: { session: Session; runtime: Runtime; now: string; timeoutMs?: number }) {
    return runShellRuntime(input);
  }
}
