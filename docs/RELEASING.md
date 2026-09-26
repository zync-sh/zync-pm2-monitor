# Stable releases

## One-time setup

- Configure the repository variable `PM2_PUBLISHER_KEY_ID` with the independently reviewed publisher key fingerprint (`sha256:...`). This is public information, not a private key. Do not rotate it without reviewing the replacement key.
- Create the GitHub environment `plugin-release`, configure required reviewers and prevent self-review before using promotion. Restrict deployment to protected stable version tags. Protect tag creation and the default branch; workflow changes are release-authority changes.
- Keep publisher and marketplace root private keys outside repositories and GitHub Actions. The registry root remains offline with encrypted backups and two-person review under Zync's registry operations policy.
- The new SDK CLI must be published separately before its `npx` commands are available. Until then, use the local SDK CLI from the Zync checkout.

## Each version

1. Update `package.json`, both root versions in `package-lock.json`, and `manifest.json` to the same stable version. Commit and push through your normal reviewed process.
2. Create and push the corresponding tag, for example `v2.0.1`. **Prepare plugin release** runs unit tests, formatting, the build and browser checks. It creates a draft release containing an unsigned `pm2-monitor-2.0.1-candidate.zip`, its SHA-256 file, and a clean signing-source workflow artifact. Tags must match package versions. A rerun never replaces an existing release.
3. Download the candidate and checksum from that draft. Compare its SHA-256, extract the ZIP into a new folder, and sign that folder locally. Do not sign `dist` wholesale: it can contain old ZIPs. Use the SDK `sign --source <extracted-candidate> --key <publisher-private.pem> --out <new-signed-folder>` command, then `verify --source <signed-folder>`. PEM publisher identity is authorized separately by the marketplace, not by the key file's name.
4. ZIP the **contents** of the signed folder, with no enclosing directory. The exact seven allowed files are the five runtime files plus `integrity.json` and `signature.json`. Name it `pm2-monitor-2.0.1-signed.zip` and upload it to the existing draft release. Never upload the private key.
5. Run **Promote signed plugin release** manually, supplying the stable tag. It rebuilds the tag, rejects changed payload bytes, extra files, oversized ZIPs, mismatched versions, unknown publisher keys and invalid signatures. The protected environment approval gates public release. Promotion replaces the manually uploaded ZIP with the verified workflow artifact, adds its checksum, removes the unsigned candidate assets, and publishes the draft. A published release cannot be promoted again.
6. Download the `verified-pm2-release` artifact. Its `registry-releases.json` and `pm2-signed` directory are offline registry-signing inputs, not a signed registry. Merge the input with existing releases and cumulative revocations; **never replace the whole live catalog with this single-plugin descriptor**. Sign a higher registry version offline, verify it, stage it and obtain the second-person review before production publication. Preserve the legacy `marketplace.json`.

The tag workflow does not publish to npm, upload private signing keys, bypass registry verification, or enable Zync's trusted marketplace. GitHub publication and marketplace promotion are separate gates. Do not move existing release tags or replace bytes for an already published version.

For a failed first tag workflow, fix the issue in a new commit/version/tag rather than silently moving the tag. For failed promotion, keep the release draft, inspect the error, and upload a corrected signed artifact only before publication. If a release was already published, use a new version.

## Local checks

```sh
npm run check
npm run release:stage -- v2.0.0
# PM2_PUBLISHER_KEY_ID must be set to the approved public fingerprint:
npm run release:verify -- v2.0.0 /path/to/pm2-monitor-2.0.0-signed.zip
```

Local staging and verification outputs go into ignored `.release/` subfolders. They refuse to reuse existing output folders. The clean candidate whitelist ensures stale ZIPs in `dist/` are never included.
