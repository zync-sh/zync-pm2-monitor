import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { signPluginDirectory, verifySignedPlugin } from "./signing/signing.js";
import {
  payloadFiles,
  releaseVersion,
  verifyRelease,
  prepareRegistryInput,
} from "./release.mjs";

export function signRelease(
  tag,
  source,
  { privatePem, passphrase, expectedKeyId },
  directory = ".",
) {
  const version = releaseVersion(tag, directory);
  if (!privatePem || !privatePem.trimStart().startsWith("-----BEGIN ")) {
    throw new Error(
      "Missing PM2_PUBLISHER_PRIVATE_KEY: configure the publisher PEM in the plugin-release environment.",
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedKeyId || ""))
    throw new Error("Missing approved PM2_PUBLISHER_KEY_ID.");
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "pm2-release-signing-"),
  );
  try {
    const keyPath = path.join(temporary, "publisher-private.pem");
    fs.writeFileSync(keyPath, privatePem, { flag: "wx", mode: 0o600 });
    const signed = path.join(temporary, "signed");
    signPluginDirectory(source, keyPath, signed, Date.now(), {
      passphrase: passphrase || undefined,
    });
    if (verifySignedPlugin(signed).keyId !== expectedKeyId)
      throw new Error(
        "Signing key does not match approved publisher fingerprint.",
      );
    const entries = {};
    for (const file of [...payloadFiles, "integrity.json", "signature.json"]) {
      entries[file] = [
        fs.readFileSync(path.join(signed, file)),
        { mtime: new Date("2026-01-01T00:00:00Z") },
      ];
    }
    // Verification compares against the tested workflow candidate, not a new build.
    const comparison = path.join(temporary, "comparison");
    fs.mkdirSync(comparison);
    for (const file of ["package.json", "package-lock.json", "manifest.json"]) {
      fs.copyFileSync(path.join(directory, file), path.join(comparison, file));
    }
    for (const file of payloadFiles) {
      const target = path.join(comparison, "dist", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(source, file), target);
    }
    const temporaryZip = path.join(temporary, "signed.zip");
    fs.writeFileSync(temporaryZip, zipSync(entries, { level: 9 }));
    const result = verifyRelease(temporaryZip, tag, expectedKeyId, comparison);
    prepareRegistryInput(result, directory);
    const output = path.join(directory, ".release", `verified-${version}`);
    fs.copyFileSync(
      temporaryZip,
      path.join(output, `pm2-monitor-${version}-signed.zip`),
      fs.constants.COPYFILE_EXCL,
    );
    return output;
  } finally {
    // Only this function's temporary key and signed fixtures are removed.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const privatePem = process.env.PM2_PUBLISHER_PRIVATE_KEY;
  const passphrase = process.env.PM2_PUBLISHER_KEY_PASSPHRASE;
  delete process.env.PM2_PUBLISHER_PRIVATE_KEY;
  delete process.env.PM2_PUBLISHER_KEY_PASSPHRASE;
  try {
    const [tag, source] = process.argv.slice(2);
    if (!source || process.argv.length !== 4)
      throw new Error(
        "Usage: node scripts/sign-release.mjs <stable tag> <clean candidate source>",
      );
    signRelease(tag, source, {
      privatePem,
      passphrase,
      expectedKeyId: process.env.PM2_PUBLISHER_KEY_ID,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
