import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import {
  payloadFiles,
  releaseVersion,
  stageCandidate,
  verifyRelease,
} from "../scripts/release.mjs";

test("release candidates are clean, signed promotion is pinned and payload mismatches fail closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm2-release-test-"));
  try {
    const manifest = {
      manifestVersion: 2,
      id: "com.zync.plugin.pm2-monitor",
      publisher: "com.zync",
      version: "2.0.0",
    };
    for (const file of ["package.json", "manifest.json"])
      fs.writeFileSync(path.join(root, file), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        version: "2.0.0",
        packages: { "": { version: "2.0.0" } },
      }),
    );
    const entries = {};
    for (const file of payloadFiles) {
      const bytes = Buffer.from(
        file === "manifest.json" ? JSON.stringify(manifest) : `fixture ${file}`,
      );
      entries[file] = bytes;
      const target = path.join(root, "dist", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(path.join(root, "dist", "old-beta.zip"), "must not ship");
    assert.equal(releaseVersion("v2.0.0", root), "2.0.0");
    assert.throws(() => releaseVersion("v2.0.0-beta.1", root), /stable/);
    assert.throws(() => releaseVersion("v2.0.1", root), /does not match/);
    const candidate = stageCandidate("v2.0.0", root);
    const clean = unzipSync(
      fs.readFileSync(path.join(candidate, "pm2-monitor-2.0.0-candidate.zip")),
    );
    assert.deepEqual(Object.keys(clean).sort(), payloadFiles);
    assert.throws(() => stageCandidate("v2.0.0", root), /exist/i);

    const hash = (bytes) =>
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const pair = generateKeyPairSync("ed25519");
    const publicBytes = Buffer.from(
      pair.publicKey.export({ format: "jwk" }).x,
      "base64url",
    );
    const keyId = hash(publicBytes);
    const files = Object.fromEntries(
      payloadFiles.map((file) => [file, hash(entries[file])]),
    );
    const integrityHash = createHash("sha256").update(
      "zync-plugin-integrity-v1\n",
    );
    for (const file of payloadFiles)
      integrityHash.update(`${file}\0${files[file]}\n`);
    const metadata = {
      version: 1,
      algorithm: "ed25519",
      publisher: manifest.publisher,
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      keyId,
      publicKey: publicBytes.toString("base64"),
      manifestDigest: files["manifest.json"],
      integrityRoot: `sha256:${integrityHash.digest("hex")}`,
      publishedAtMs: Date.now(),
    };
    const message = `zync-plugin-signature-v1\npublisher=${metadata.publisher}\npluginId=${metadata.pluginId}\nversion=${metadata.pluginVersion}\nmanifestDigest=${metadata.manifestDigest}\nintegrityRoot=${metadata.integrityRoot}\npublishedAtMs=${metadata.publishedAtMs}\n`;
    entries["signature.json"] = Buffer.from(
      JSON.stringify({
        ...metadata,
        signature: sign(null, Buffer.from(message), pair.privateKey).toString(
          "base64",
        ),
      }),
    );
    entries["integrity.json"] = Buffer.from(
      JSON.stringify({ version: 1, files }),
    );
    const signedZip = path.join(root, "signed.zip");
    const writeZip = () => fs.writeFileSync(signedZip, zipSync(entries));
    writeZip();
    assert.equal(verifyRelease(signedZip, "v2.0.0", keyId, root).keyId, keyId);
    assert.throws(
      () => verifyRelease(signedZip, "v2.0.0", undefined, root),
      /Configure/,
    );
    assert.throws(
      () =>
        verifyRelease(signedZip, "v2.0.0", `sha256:${"0".repeat(64)}`, root),
      /approved publisher/,
    );
    entries["private.pem"] = Buffer.from("not allowed");
    writeZip();
    assert.throws(
      () => verifyRelease(signedZip, "v2.0.0", keyId, root),
      /Unexpected/,
    );
    delete entries["private.pem"];
    entries["worker.js"] = Buffer.from("tampered");
    writeZip();
    assert.throws(
      () => verifyRelease(signedZip, "v2.0.0", keyId, root),
      /tagged build/,
    );
    entries["worker.js"] = fs.readFileSync(
      path.join(root, "dist", "worker.js"),
    );
    const altered = JSON.parse(entries["signature.json"]);
    altered.signature = Buffer.alloc(64).toString("base64");
    entries["signature.json"] = Buffer.from(JSON.stringify(altered));
    writeZip();
    assert.throws(
      () => verifyRelease(signedZip, "v2.0.0", keyId, root),
      /Invalid publisher signature/,
    );
  } finally {
    // Disposable test fixtures only; never production keys or build artifacts.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
