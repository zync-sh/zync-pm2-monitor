export const ACTIONS = Object.freeze({
  start: "Start",
  restart: "Restart",
  reload: "Reload",
  stop: "Stop",
  delete: "Delete",
});

export function executable(value = "pm2") {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    /[\x00-\x1f\x7f]/.test(value) ||
    (value !== "pm2" && (!value.startsWith("/") || value.endsWith("/")))
  ) {
    throw new Error(
      "Use pm2 or an absolute POSIX path to the PM2 executable. Shell commands are not accepted.",
    );
  }
  return value;
}

export function processId(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("A numeric PM2 process ID is required.");
  return String(value);
}

export function commandTarget(program, nodeProgram) {
  executable(program);
  if (!nodeProgram) return { program, prefix: [] };
  if (
    typeof nodeProgram !== "string" ||
    !nodeProgram.startsWith("/") ||
    !program.startsWith("/")
  ) {
    throw new Error(
      "When setting Node.js, use absolute paths for both Node.js and the PM2 script.",
    );
  }
  executable(nodeProgram);
  return { program: nodeProgram, prefix: [program] };
}

export function mutation(action, id) {
  if (!Object.hasOwn(ACTIONS, action))
    throw new Error("Unsupported PM2 action.");
  return [action, processId(id)];
}

export function logsCommand(id, stream = "all") {
  if (!["all", "out", "err"].includes(stream))
    throw new Error("Invalid log stream.");
  return [
    "logs",
    processId(id),
    "--lines",
    "100",
    "--nostream",
    "--raw",
    ...(stream === "all" ? [] : [`--${stream}`]),
  ];
}

export function commandFailure(result) {
  if (result.exitCode === 0) return null;
  if (
    result.exitCode === 127 ||
    /(?:pm2|node).*not found|not recognized/i.test(result.stderr)
  ) {
    return {
      code: "EXECUTABLE_NOT_FOUND",
      message:
        "PM2 or Node.js is not on the SSH command PATH. Set an absolute PM2 executable in Connection settings and ensure Node.js is available to non-interactive SSH commands.",
    };
  }
  return {
    code: "COMMAND_FAILED",
    message: `PM2 exited with code ${result.exitCode}: ${(result.stderr || result.stdout || "No error details.").slice(0, 600)}`,
  };
}

export function commandError(result) {
  return commandFailure(result)?.message ?? null;
}
