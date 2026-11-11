# Automatic branch-update boundary

The `update-branch` stage performs only an already-up-to-date no-op or a fast-forward to the verified pull request base. It does not invoke an agent to reconcile divergent histories.

If the histories diverge, stop before merging, rebasing, or publishing. Read the target repository's current contribution instructions and obtain a separately authorized, policy-compliant update. Do not infer permission from the absence of textual conflicts or automatically retry the same operation. Hibernate requires rebasing rather than merge commits; other repositories may differ.

After the authorized update, audit upstream-added callers and verify the new revision. The existing failure path records the blocker and removes the in-progress label. Do not replay an older merge-resolution checkpoint under this changed controller.
