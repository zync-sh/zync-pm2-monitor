export function createBridge(pane) {
  let sequence = 0;
  // Splitting remounts a frame; late replies must not match its new requests.
  const frameId = Array.from(
    crypto.getRandomValues(new Uint8Array(12)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const pending = new Map();
  pane.onMessage((message) => {
    const request = pending.get(message?.requestId);
    if (!request) return;
    if (Array.isArray(message.chunk)) {
      request.processes.push(...message.chunk);
      return;
    }
    pending.delete(message.requestId);
    clearTimeout(request.timer);
    if (message.error) {
      const error = new Error(message.error);
      error.code = message.errorCode;
      request.reject(error);
    } else
      request.resolve({
        ...message.result,
        ...(request.processes.length ? { processes: request.processes } : {}),
      });
  });
  return (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const requestId = `pm2-${frameId}-${++sequence}`;
      const timer = setTimeout(
        () => {
          pending.delete(requestId);
          reject(
            new Error(
              "The operation did not finish. Its server outcome may be unknown; refresh before retrying.",
            ),
          );
        },
        ["action", "save", "export-logs"].includes(type) ? 300000 : 30000,
      );
      pending.set(requestId, { resolve, reject, timer, processes: [] });
      try {
        pane.postMessage({ type, requestId, ...payload });
      } catch (error) {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
}
