import fs from "node:fs";
import path from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
import { pathToFileURL } from "node:url";
import { unzipSync, zipSync } from "fflate";

export const payloadFiles = [
  "LICENSE",
  "icons/process-manager.svg",
  "manifest.json",
  "ui/index.html",
  "worker.js",
];
const signedFiles = [
  ...payloadFiles,
  "integrity.json",
  "signature.json",
].sort();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = (bytes) => `sha256:${sha(bytes)}`;

export function releaseVersion(tag, directory = ".") {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || "")) {
    throw new Error("Release tags must use stable vMAJOR.MINOR.PATCH format.");
  }
  const version = tag.slice(1);
  for (const file of ["package.json", "package-lock.json", "manifest.json"]) {
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, file)));
    if (metadata.version !== version)
      throw new Error(`${file} does not match ${tag}`);
    if (
      file === "package-lock.json" &&
      metadata.packages[""].version !== version
    ) {
      throw new Error("Lockfile root version does not match the tag.");
    }
  }
  return version;
}

export function stageCandidate(tag, directory = ".") {
  const version = releaseVersion(tag, directory);
  const source = path.join(directory, "dist");
  const output = path.join(directory, ".release", `candidate-${version}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output); // Exclusive: never reuse stale candidates.
  const entries = {};
  for (const file of payloadFiles) {
    const bytes = fs.readFileSync(path.join(source, file));
    entries[file] = [bytes, { mtime: new Date("2026-01-01T00:00:00Z") }];
    const target = path.join(output, "source", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
  }
  const filename = `pm2-monitor-${version}-candidate.zip`;
  const zip = zipSync(entries, { level: 9 });
  fs.writeFileSync(path.join(output, filename), zip, { flag: "wx" });
  fs.writeFileSync(
    path.join(output, `${filename}.sha256`),
    `${sha(zip)}  ${filename}\n`,
    { flag: "wx" },
  );
  return output;
}

export function verifyRelease(zipPath, tag, expectedKeyId, directory = ".") {
  const version = releaseVersion(tag, directory);
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedKeyId || "")) {
    throw new Error(
      "Configure PM2_PUBLISHER_KEY_ID with the approved public-key fingerprint.",
    );
  }
  const zip = fs.readFileSync(zipPath);
  if (zip.length > 2 * 1024 * 1024)
    throw new Error("Signed ZIP exceeds 2 MiB.");
  let total = 0;
  let count = 0;
  const names = new Set();
  const entries = unzipSync(zip, {
    filter(info) {
      if (!signedFiles.includes(info.name) || names.has(info.name)) {
        throw new Error("Unexpected or duplicate file in signed ZIP.");
      }
      names.add(info.name);
      total += info.originalSize;
      count += 1;
      if (
        count > signedFiles.length ||
        info.originalSize > 2 * 1024 * 1024 ||
        total > 4 * 1024 * 1024
      ) {
        throw new Error("Signed ZIP exceeds unpacked limits.");
      }
      return true;
    },
  });
  if (Object.keys(entries).sort().join("\n") !== signedFiles.join("\n")) {
    throw new Error("Signed ZIP is missing release files.");
  }
  const files = {};
  for (const file of payloadFiles) {
    const bytes = Buffer.from(entries[file]);
    if (!bytes.equals(fs.readFileSync(path.join(directory, "dist", file)))) {
      throw new Error(`Signed payload differs from the tagged build: ${file}`);
    }
    files[file] = digest(bytes);
  }
  const manifest = JSON.parse(Buffer.from(entries["manifest.json"]));
  const integrity = JSON.parse(Buffer.from(entries["integrity.json"]));
  const signature = JSON.parse(Buffer.from(entries["signature.json"]));
  if (
    integrity.version !== 1 ||
    !integrity.files ||
    Object.keys(integrity.files).length !== payloadFiles.length ||
    payloadFiles.some((file) => integrity.files[file] !== files[file])
  ) {
    throw new Error("Invalid release integrity metadata.");
  }
  const integrityHash = createHash("sha256").update(
    "zync-plugin-integrity-v1\n",
  );
  for (const file of payloadFiles)
    integrityHash.update(`${file}\0${files[file]}\n`);
  const integrityRoot = `sha256:${integrityHash.digest("hex")}`;
  const publicBytes = Buffer.from(signature.publicKey || "", "base64");
  if (
    signature.version !== 1 ||
    signature.algorithm !== "ed25519" ||
    manifest.id !== "com.zync.plugin.pm2-monitor" ||
    manifest.publisher !== "com.zync" ||
    manifest.version !== version ||
    signature.publisher !== manifest.publisher ||
    signature.pluginId !== manifest.id ||
    signature.pluginVersion !== version ||
    signature.manifestDigest !== files["manifest.json"] ||
    signature.integrityRoot !== integrityRoot ||
    !Number.isSafeInteger(signature.publishedAtMs) ||
    signature.publishedAtMs <= 0 ||
    publicBytes.length !== 32 ||
    digest(publicBytes) !== expectedKeyId ||
    signature.keyId !== expectedKeyId
  ) {
    throw new Error(
      "Release identity or approved publisher key does not match.",
    );
  }
  const message = `zync-plugin-signature-v1\npublisher=${signature.publisher}\npluginId=${signature.pluginId}\nversion=${signature.pluginVersion}\nmanifestDigest=${signature.manifestDigest}\nintegrityRoot=${signature.integrityRoot}\npublishedAtMs=${signature.publishedAtMs}\n`;
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicBytes.toString("base64url") },
    format: "jwk",
  });
  if (
    !verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(signature.signature || "", "base64"),
    )
  ) {
    throw new Error("Invalid publisher signature.");
  }
  return { version, entries, manifest, sha256: sha(zip), keyId: expectedKeyId };
}

export function prepareRegistryInput(result, directory) {
  const output = path.join(directory, ".release", `verified-${result.version}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  for (const [file, bytes] of Object.entries(result.entries)) {
    const target = path.join(output, "pm2-signed", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
  }
  const filename = `pm2-monitor-${result.version}-signed.zip`;
  fs.writeFileSync(
    path.join(output, `${filename}.sha256`),
    `${result.sha256}  ${filename}\n`,
  );
  fs.writeFileSync(
    path.join(output, "registry-releases.json"),
    `${JSON.stringify(
      {
        releases: [
          {
            packagePath: "./pm2-signed",
            downloadUrl: `https://github.com/zync-sh/zync-pm2-monitor/releases/download/v${result.version}/${filename}`,
            publisherVerified: true,
            channel: "stable",
          },
        ],
        revocations: [],
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Verified signed release. Registry signing input: ${output}`);
  console.log(
    "Merge with existing releases and cumulative revocations before offline registry signing.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const [command, tag, zipPath] = process.argv.slice(2);
    if (command === "stage") console.log(stageCandidate(tag));
    else if (command === "verify")
      prepareRegistryInput(
        verifyRelease(zipPath, tag, process.env.PM2_PUBLISHER_KEY_ID),
        ".",
      );
    else
      throw new Error(
        "Usage: node scripts/release.mjs stage <tag> | verify <tag> <signed.zip>",
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
