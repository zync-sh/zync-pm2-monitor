import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  payloadFiles,
  stageCandidate,
  verifyRelease,
} from "../scripts/release.mjs";
import { signRelease } from "../scripts/sign-release.mjs";

for (const encrypted of [false, true]) {
  test(`automatic signing verifies ${encrypted ? "encrypted" : "unencrypted"} PEM keys and ships no private material`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm2-auto-sign-test-"));
    try {
      const manifest = {
        manifestVersion: 2,
        id: "com.zync.plugin.pm2-monitor",
        publisher: "com.zync",
        name: "PM2 Monitor",
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
      for (const file of payloadFiles) {
        const target = path.join(root, "dist", file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(
          target,
          file === "manifest.json" ? JSON.stringify(manifest) : `test ${file}`,
        );
      }
      const source = path.join(stageCandidate("v2.0.0", root), "source");
      const pair = generateKeyPairSync("ed25519");
      const passphrase = encrypted ? "fixture-passphrase" : undefined;
      const privatePem = pair.privateKey.export({
        format: "pem",
        type: "pkcs8",
        ...(encrypted ? { cipher: "aes-256-cbc", passphrase } : {}),
      });
      const publicBytes = Buffer.from(
        pair.publicKey.export({ format: "jwk" }).x,
        "base64url",
      );
      const expectedKeyId = `sha256:${createHash("sha256").update(publicBytes).digest("hex")}`;
      assert.throws(
        () =>
          signRelease(
            "v2.0.0",
            source,
            {
              privatePem,
              passphrase,
              expectedKeyId: `sha256:${"0".repeat(64)}`,
            },
            root,
          ),
        /fingerprint/,
      );
      if (encrypted)
        assert.throws(
          () =>
            signRelease(
              "v2.0.0",
              source,
              { privatePem, passphrase: "wrong", expectedKeyId },
              root,
            ),
          /passphrase/,
        );
      const output = signRelease(
        "v2.0.0",
        source,
        { privatePem, passphrase, expectedKeyId },
        root,
      );
      const result = verifyRelease(
        path.join(output, "pm2-monitor-2.0.0-signed.zip"),
        "v2.0.0",
        expectedKeyId,
        root,
      );
      assert.equal(Object.keys(result.entries).length, 7);
      assert.ok(
        Object.values(result.entries).every(
          (bytes) => !Buffer.from(bytes).includes(Buffer.from("PRIVATE KEY")),
        ),
      );
      assert.ok(!fs.existsSync(path.join(output, "publisher-private.pem")));
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(output, "registry-releases.json")))
          .releases[0].channel,
        "stable",
      );
      assert.throws(
        () => signRelease("v2.0.0", source, { expectedKeyId }, root),
        /Missing PM2_PUBLISHER_PRIVATE_KEY/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
