# Windows Desktop → SSH gateway test

Version 0.4.0 implements remote profile-alias translation using the public
Hermes SDK. Offline tests exercise the actual host REST bridge and Electron
profile mapper. A live Windows/SSH run is still required before release.

## Install the same candidate on both sides

On the Windows workstation, install from Git:

```powershell
hermes plugins install https://github.com/outpoints/hermes-honcho-plugin --enable
```

The repository is currently private, so Git must be authenticated with access
to it. To test an exact candidate on both machines, add `--ref <full-commit-sha>`
using the same published SHA. If a plugin directory already exists, back it up
before deliberately reinstalling with `--force`.

For a source-archive installation instead, extract the archive first. Copy its
`hermes-honcho-plugin` directory into the workstation's active Hermes data home
at `plugins/hermes-honcho-plugin`. Use your configured `HERMES_HOME`, not the
Hermes application/program directory. Back up any existing plugin directory
before replacing it. Do not copy personal Hermes configuration into this repo.

On the Windows workstation, enable it with:

```powershell
hermes plugins enable hermes-honcho-plugin
```

Enable **Honcho** in **Settings → Plugins** if the Desktop contribution is off.
Reload desktop plugins from the command palette after replacing the JavaScript.
If using a standalone desktop-plugin installation instead, place only
`desktop/plugin.js` at `desktop-plugins/hermes-honcho-plugin/plugin.js` under
the workstation's Hermes home. Do not install both frontend copies.

On the SSH host, install into each intended remote profile:

```sh
hermes -p <remote-profile> plugins install https://github.com/outpoints/hermes-honcho-plugin --enable
```

Alternatively, copy `plugin.yaml`, `__init__.py` and the complete `dashboard/`
directory from the same candidate into `plugins/hermes-honcho-plugin` under
each target profile's Hermes home. Then run on that remote machine:

```sh
hermes -p <remote-profile> plugins enable hermes-honcho-plugin
```

The remote profile must already have working Honcho configuration. Restart only
the affected remote Hermes backend so it imports the companion. Do not copy
Honcho credentials or SSH keys into the plugin or workstation renderer.

Check that both installed manifests report **0.4.0**. Installing from GitHub
never includes uncommitted local changes.

## Acceptance checklist

Use a disposable Honcho workspace/session with invented content for upload tests.
Do not use personal memory to make screenshots or test fixtures.

- [ ] In **Settings → Gateways**, select an SSH connection whose local alias is
  different from its remote profile, for example `desktop-alias` → `research`.
- [ ] Open a saved conversation on that gateway and open **Honcho**. The lineage
  shows the SSH connection, remote profile, correct Honcho session and user peer.
- [ ] Memory, Ask, Messages, Context and Status read that remote session.
  Optional unsupported APIs show their capability notice.
- [ ] Conclusion search and inspection stay inside the configured peer pair.
  Ask memory runs only on explicit submit and labels its session/across-session
  scope. Accessed records are not presented as guaranteed citations.
- [ ] In the disposable workspace only, cancel a correction without requests,
  then confirm one synthetic fact. Verify its exact ID/content/target and that
  the original conclusion remains. Switch focus during preparation and confirm
  no stale write is sent. Never retry an unknown outcome automatically.
- [ ] Open the docked memory pane. Refresh and copy work without local fallback.
- [ ] Switch between local and SSH conversations, including profiles with the
  same display name on different gateways. Old memory is not shown under a new
  target. A chat on a connection other than the active one shows "This chat is
  on another connection" and sends no request.
- [ ] With the sidebar showing all profiles, open a chat from another profile on
  the same connection. Memory reads that profile, and Status shows the active
  profile under "Read through".
- [ ] Paste one synthetic note, review the remote target and explicitly confirm.
  Verify the created message in the exact remote Honcho session.
- [ ] Upload a small UTF-8 text file selected from Windows. Confirm the same
  target and verify all returned message IDs. No local-path assumptions should
  affect browser-selected file bytes.
- [ ] Cancel a selected file. No upload occurs. Switch conversations while the
  dialog is open and confirm that stale submission is blocked.
- [ ] Disconnect SSH or test a profile with no enabled companion. Expect an
  unavailable/error state, never local memory or a local upload.
- [ ] Test reconnect and narrow panes at the current default UI scale (110%).

If the host lacks `host.profileRoutes()`, update Hermes Desktop. No private
routing workaround is used. OAuth-gated remote multipart remains a separate
host limitation, not an SSH limitation. Upload tickets are single-process and
expire after two minutes or a backend restart. Never automatically retry an
upload whose result is unknown. Inspect the confirmed session first.

## Offline transport check

With a prepared Hermes source checkout and its development dependencies:

```sh
HERMES_SOURCE=/path/to/hermes-agent SCREENSHOT_WORK_DIR=/path/to/scratch \
  node scripts/check-host.mjs
```

This bundles only an isolated test harness. It checks the real `pluginRest`,
`apiFetch`, profile-route builder and backend path mapper against a fake Electron
IPC receiver. It does not establish an SSH tunnel or claim a live Windows pass.
