# Stable releases

## One-time setup

- Configure the repository variable `PM2_PUBLISHER_KEY_ID` with the independently reviewed publisher key fingerprint (`sha256:...`). This is public information, not a private key. Do not rotate it without reviewing the replacement key.
- Create the GitHub environment `plugin-release` and configure release approval. A solo maintainer can add themselves and leave self-review prevention off; this is a deliberate checkpoint, not independent review. Allow protected version tags (`v*`) for the automatic tag workflow; also allow `main` if you use the manual fallback. Protect tag creation and the default branch; workflow changes are release-authority changes.
- Publisher key storage is the publisher's responsibility. Protected CI secrets are permitted, but never commit private keys, include them in packages or expose them to PR checks. Keep the marketplace root separate and offline with encrypted backups and two-person registry review under Zync's registry operations policy.
- CI includes a reviewed MIT-licensed snapshot of the SDK signer in `scripts/signing`; it does not depend on an unpublished npm version. SDK CLI changes must still be published separately before their `npx` commands are available.

### Automatic publisher signing configuration

Set the environment secret `PM2_PUBLISHER_PRIVATE_KEY` to the full private publisher PEM, retain the repository variable `PM2_PUBLISHER_KEY_ID` for verification, and set `PM2_PUBLISHER_KEY_PASSPHRASE` only if the key is encrypted. Leave the passphrase secret absent for unencrypted keys. Do not use the marketplace root key here. Only the protected signing step receives these secrets. It signs the tested clean candidate, verifies against the approved fingerprint, removes the temporary key, and uploads only verified public artifacts. Tests, PR checks and the publication job never receive signing keys. Dependency installation in the signing job disables lifecycle scripts and occurs before secret injection.

## Each version

1. Update `package.json`, both root versions in `package-lock.json`, and `manifest.json` to the same stable version. Commit and push through your normal reviewed process.
2. Create and push the corresponding tag, for example `v2.0.1`. **Release signed plugin** runs unit tests, formatting, the build and browser checks, and produces a clean signing-source workflow artifact. Tags must match package versions; stale ZIPs in `dist` are excluded.
3. Approve the `plugin-release` environment job. CI automatically signs the candidate using the protected publisher secret, verifies its exact payload bytes and approved key fingerprint, and publishes `pm2-monitor-2.0.1-signed.zip` plus its SHA-256 file to GitHub Releases. No manual downloading, signing or ZIP upload is required in this path. A published version is never overwritten.
4. Download the `verified-pm2-release` artifact. Its `registry-releases.json` and `pm2-signed` directory are offline registry-signing inputs, not a signed registry. Merge the input with existing releases and cumulative revocations; **never replace the whole live catalog with this single-plugin descriptor**. Sign a higher registry version offline, verify it, stage it and obtain the second-person review before production publication. Preserve the legacy `marketplace.json`.

The tag workflow does not publish to npm, upload private signing keys as artifacts, bypass registry verification, or enable Zync's trusted marketplace. GitHub publication and marketplace promotion are separate gates. Do not move existing release tags or replace bytes for an already published version.

The **Promote signed plugin release** workflow remains a manual fallback for existing drafts created by the earlier candidate workflow: sign the clean candidate locally, upload the seven-file signed ZIP to its draft, then dispatch promotion from `main`. Do not use it to replace an already published automatic release.

For a failed first tag workflow, fix the issue in a new commit/version/tag rather than silently moving the tag. For failed promotion, keep the release draft, inspect the error, and upload a corrected signed artifact only before publication. If a release was already published, use a new version.

## Local checks

```sh
npm run check
npm run release:stage -- v2.0.0
# PM2_PUBLISHER_KEY_ID must be set to the approved public fingerprint:
npm run release:verify -- v2.0.0 /path/to/pm2-monitor-2.0.0-signed.zip
```

Local staging and verification outputs go into ignored `.release/` subfolders. They refuse to reuse existing output folders. The clean candidate whitelist ensures stale ZIPs in `dist/` are never included.
