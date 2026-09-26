import {
  ACTIONS,
  executable,
  mutation,
  logsCommand,
  commandFailure,
  commandTarget,
} from "../domain/commands.js";
import {
  parseProcesses,
  processIdentity,
  stripTerminalCodes,
} from "../domain/processes.js";
import { exportLogSnapshot } from "./logExport.js";

export function createPm2Service(api) {
  const busy = new Set();
  return async ({ paneInstanceId, message }) => {
    if (
      !paneInstanceId ||
      !message ||
      typeof message !== "object" ||
      typeof message.requestId !== "string" ||
      message.requestId.length > 80 ||
      !["refresh", "logs", "action", "save", "export-logs"].includes(
        message.type,
      )
    )
      return;
    const reply = (payload) =>
      api.panel.postMessage(paneInstanceId, {
        requestId: message.requestId,
        ...payload,
      });
    if (busy.has(paneInstanceId)) {
      await reply({ error: "Another operation is running. Please wait." });
      return;
    }
    busy.add(paneInstanceId);
    try {
      if (message.type === "export-logs") {
        await reply({ result: await exportLogSnapshot(api, message.content) });
        return;
      }
      const program = executable(message.program);
      const target = commandTarget(program, message.nodeProgram);
      let connectionToken =
        message.type === "refresh" ? undefined : message.connectionToken;
      if (
        message.type !== "refresh" &&
        (typeof connectionToken !== "string" || !connectionToken)
      ) {
        throw new Error("Refresh this pane before running an operation.");
      }
      const run = async (args) => {
        const response = await api.sshCommand.execute(paneInstanceId, {
          program: target.program,
          args: [...target.prefix, ...args],
          ...(connectionToken
            ? { expectedConnectionToken: connectionToken }
            : {}),
        });
        const error = commandFailure(response);
        if (error) {
          const failure = new Error(stripTerminalCodes(error.message));
          failure.code = error.code;
          throw failure;
        }
        connectionToken = response.connectionToken;
        return response;
      };
      const list = async () => parseProcesses((await run(["jlist"])).stdout);
      let result;
      if (message.type === "refresh") {
        const processes = await list();
        // Large process lists travel in bounded envelopes, not one oversized message.
        let chunk = [];
        for (const process of processes) {
          if (
            new TextEncoder().encode(JSON.stringify([...chunk, process]))
              .length > 40000
          ) {
            await reply({ chunk });
            chunk = [];
          }
          chunk.push(process);
        }
        if (chunk.length) await reply({ chunk });
        result = { processes: [], updatedAt: Date.now(), connectionToken };
      } else if (message.type === "logs") {
        const response = await run(logsCommand(message.id, message.stream));
        const content = stripTerminalCodes(
          response.stdout + (response.stderr ? `\n${response.stderr}` : ""),
        );
        // Keep pane messages below the host's 64 KiB envelope, including JSON escaping.
        result = {
          text: content.slice(-12000),
          truncated: content.length > 12000,
          updatedAt: Date.now(),
        };
      } else if (message.type === "save") {
        const confirmed = await api.ui.confirm({
          title: "Save PM2 process list?",
          message:
            "Replace this server's saved PM2 snapshot with the entire current process list, including an empty list. This affects future resurrection but does not configure system startup.",
          confirmLabel: "Save list",
        });
        if (confirmed) await run(["save", "--force"]);
        result = { canceled: !confirmed, summary: "Process list saved." };
      } else {
        const { action, targets } = message;
        if (
          !Object.hasOwn(ACTIONS, action) ||
          !Array.isArray(targets) ||
          !targets.length ||
          targets.length > 5 ||
          new Set(targets.map((target) => target?.id)).size !== targets.length
        )
          throw new Error("Select between 1 and 5 distinct processes.");
        targets.forEach((target) => {
          mutation(action, target.id);
          if (typeof target.identity !== "string")
            throw new Error("Refresh before changing a process.");
        });
        const before = await list();
        const selected = targets.map((target) => {
          const process = before.find((item) => item.id === target.id);
          if (!process || processIdentity(process) !== target.identity)
            throw new Error(
              "A selected process changed. Refresh and select it again.",
            );
          if (action === "reload" && process.mode !== "cluster")
            throw new Error(
              "Reload is available only for cluster processes. Use Restart for fork mode.",
            );
          if (
            action === "start" &&
            ["online", "launching"].includes(process.status)
          )
            throw new Error(
              "This process is already running. Refresh before trying again.",
            );
          return process;
        });
        const warning =
          action === "delete"
            ? "These processes will stop and be removed from PM2. This cannot be undone here."
            : action === "stop"
              ? "These processes will stop serving traffic."
              : action === "reload"
                ? "PM2 will reload these cluster processes. Zero downtime depends on your application."
                : action === "start"
                  ? "These stopped processes will start serving traffic."
                  : "Restarting can interrupt active requests.";
        const confirmed = await api.ui.confirm({
          title: `${ACTIONS[action]} ${selected.length} process${selected.length === 1 ? "" : "es"}?`,
          message: `${warning}\n\n${selected.map((item) => `#${item.id} ${item.name}`).join("\n")}\n\nOnly this pane's server is affected.`,
          confirmLabel: ACTIONS[action],
        });
        if (!confirmed) result = { canceled: true };
        else {
          // The dialog can stay open while the server changes. Recheck identity
          // afterwards; never replay a mutation automatically after a timeout.
          const fresh = await list();
          const outcomes = [];
          for (const target of targets) {
            const process = fresh.find((item) => item.id === target.id);
            if (!process || processIdentity(process) !== target.identity) {
              outcomes.push({
                id: target.id,
                ok: false,
                error: "Process changed while confirming.",
              });
              continue;
            }
            try {
              await run(mutation(action, target.id));
              outcomes.push({ id: target.id, ok: true });
            } catch (error) {
              outcomes.push({
                id: target.id,
                ok: false,
                error: String(error.message || error).slice(0, 600),
              });
              // Lost connections and timeouts have uncertain outcomes. Do not keep
              // changing other processes after an error; report those not attempted.
              for (const remaining of targets.slice(outcomes.length))
                outcomes.push({
                  id: remaining.id,
                  ok: false,
                  error: "Not attempted after an earlier failure.",
                });
              break;
            }
          }
          result = { outcomes };
        }
      }
      await reply({ result });
    } catch (error) {
      await reply({
        error: String(error.message || error).slice(0, 1000),
        ...(typeof error?.code === "string" ? { errorCode: error.code } : {}),
      });
    } finally {
      busy.delete(paneInstanceId);
    }
  };
}
