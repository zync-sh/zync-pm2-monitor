# Bundled SDK signing implementation

`signing.js` and `bin/pem-key.mjs` are copied from Zync's MIT-licensed `packages/plugin-sdk` implementation. They use only Node.js built-ins; `LICENSE` is retained. This snapshot makes the release workflow independent of an unpublished npm SDK update. It does not change the plugin's bundled SDK/UI dependencies or include signing code in the plugin runtime.

Review this code alongside workflow changes. Update the snapshot deliberately when the SDK signer changes, and run signing and release regression tests. The release script never executes plugin worker or pane code. Only the protected signing step receives the publisher key; PR tests never receive it. No marketplace root key is used here.
