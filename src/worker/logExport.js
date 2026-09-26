export async function exportLogSnapshot(api, content) {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 12000
  ) {
    throw new Error(
      "Load a log snapshot of at most 12,000 characters before exporting.",
    );
  }
  // Zync owns the optional permission prompt and the save/overwrite picker.
  const file = await api.filesystem.pickWriteFile();
  if (!file) return { canceled: true };
  // The host owns the path and overwrite confirmation; never accept a path from the pane.
  await api.filesystem.writeText(file.handle, content);
  return { canceled: false };
}
