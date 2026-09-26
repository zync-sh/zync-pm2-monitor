export function processDiagnostics(process) {
  const messages = [];
  if (process.status === "errored")
    messages.push(
      "PM2 reports this process as errored. Inspect error logs before restarting.",
    );
  if (process.status === "waiting restart")
    messages.push(
      "PM2 is waiting to restart this process. Check restart delays and recent logs.",
    );
  if (process.restarts >= 10)
    messages.push(
      `${process.restarts} lifetime restarts recorded. This alone does not prove a current crash loop.`,
    );
  if (process.exitCode != null && process.exitCode !== 0)
    messages.push(
      `Last reported exit code: ${process.exitCode}. Check logs for the cause.`,
    );
  if (process.autorestart === false)
    messages.push(
      "Autorestart is off. PM2 will not automatically recover this process after it exits.",
    );
  if (process.cpuAvailable === false || process.memoryAvailable === false)
    messages.push(
      "PM2 did not report all resource readings. Missing data is not zero usage.",
    );
  return messages;
}

export function actionReport(action, outcomes, names) {
  const completed = outcomes.filter((item) => item.ok).length;
  const lines = outcomes.map(
    (item) =>
      `#${item.id} ${names.get(item.id) || "Process"}: ${item.ok ? "Command completed" : item.error || "Result unknown"}`,
  );
  return `${action[0].toUpperCase() + action.slice(1)} · ${completed} of ${outcomes.length} commands completed.\n${lines.join("\n")}${completed !== outcomes.length ? "\nRefresh before retrying; a failed or interrupted command may already have taken effect." : ""}`;
}
