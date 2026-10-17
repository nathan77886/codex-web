# codex-web

a browser frontend for codex desktop, running on a machine you control.

https://github.com/user-attachments/assets/0a33cbd8-741c-412c-9e75-46dfe9324596

## motivation

the agents were never meant to stay trapped in a terminal window for long.
codex desktop brought the power of agents to your local computer, where your
files, credentials, and tools already live.

codex-web brings codex desktop to the browser while keeping the backend on a
machine you control (a linux box in the cloud, your home lab, or a desktop / mac
mini). agents keep running after your laptop closes. you can reconnect from any
device with a browser.

this project aims to be as thin a wrapper as possible to ensure upstream changes
to the codex desktop app can be integrated quickly.

## usage

`codex-web` serves the browser client and hosts the desktop-side bridge. by
default, it listens on `127.0.0.1:8214`.

it will use `codex` from `PATH` if available, or `CODEX_CLI_PATH` if you set
it.

run it with `npx`:

```bash
npx --yes github:0xcaff/codex-web
```

or with nix:

```bash
nix run github:0xcaff/codex-web
```

then open <http://127.0.0.1:8214> in a browser.

### Docker images and shared host data

GitHub Actions builds a Linux amd64 image on a GitHub-hosted runner and publishes
`ghcr.io/nathan77886/codex-web:sha-<commit>` plus `latest`. It also uploads a
compressed Docker image and checksum as a workflow artifact. No runner or build
is required on the deployment host.

After the workflow succeeds, deploy the exact published digest:

```bash
export CODEX_WEB_IMAGE=ghcr.io/nathan77886/codex-web@sha256:<published-digest>
docker compose pull codex-web
docker compose up -d --no-build codex-web
```

For registries without pull access, download the workflow image artifact, verify
`sha256sum -c codex-web.tar.gz.sha256`, run `docker load -i codex-web.tar.gz`, and
set `CODEX_WEB_IMAGE` to the artifact's `sha-<commit>` image tag before starting.

The runtime image contains the patched web client, server and runtime dependencies.
It excludes the downloaded macOS app, build tools, Electron runtime and source maps.
Do not bind-mount source code over `/app`: that would replace the image just built.

The compose file uses host networking but binds HTTP only to `127.0.0.1:8214`.
It mounts `/home/liuyu`, `/mnt/ssd`, `/mnt/hdd`, and `/tmp` at their original paths.
`CODEX_HOME` is explicitly `/mnt/ssd/codex-home`, the same data used by the host
Codex App Server. The bridge in `scripts/app-server-proxy.cjs` connects to
`$CODEX_HOME/app-server-control/app-server-control.sock`. It fails if the host
daemon is unavailable; it never starts a separate daemon inside Docker. Commands
run by that shared daemon retain the host's tools, filesystem and permissions.
The web container itself does not need a Docker daemon socket.
Web-only window and cache state is persisted in `$CODEX_HOME/web`, rather than
being written into the immutable image's `/app` directory.

Adjust `CODEX_WEB_UID`, `CODEX_WEB_GID`, `CODEX_WEB_HOME`, `CODEX_WEB_CODEX_HOME`,
and `CODEX_WEB_PROXY` for another host. The default HTTP proxy is the host's
`127.0.0.1:7890`; Node's environment proxy support is enabled for desktop backend
requests. The local Unix socket bridge does not go through this proxy.

### IP access through Shanghai Nginx

Authentication belongs in the external reverse proxy. This project contains no
login password or login session implementation. The Cloudflare sidecar has been
removed from the deployment. Use a dedicated reverse SSH service, independent of
existing SSH or CLIProxyAPI tunnels:

```text
Browser -> Shanghai Nginx (HTTPS + Basic Auth)
        -> Shanghai 127.0.0.1:18215
        -> reverse SSH -> host 127.0.0.1:8214
```

Nginx must protect every route, including `/__backend/ipc`, support WebSocket
upgrade, disable proxy buffering, and allow long-running connections and uploads.
Keep its password hash and TLS key outside this repository. Only retire the old
Codex-specific Cloudflare route after the new entry is verified.

### Mobile dictation

The microphone button reuses the bundled Codex desktop recorder and authenticated
transcription flow (`/transcribe`), when the shared App Server exposes an active
ChatGPT login. No separate speech API key or replacement speech provider is
configured. With this host's current `getunifun` provider, App Server reports
`requiresOpenaiAuth=false` and no ChatGPT account/token to clients, so the native
dictation button is unavailable even though `auth.json` retains ChatGPT tokens.
Do not change the shared provider merely to enable the microphone. The recorder uses
`MediaRecorder` and preserves the browser's actual recording MIME type, including
MP4 on supporting browsers and WebM on Chromium. It falls back to HTTP
transcription if streaming dictation cannot connect.

Mobile browser microphone capture requires a secure context: use HTTPS with a
certificate trusted by the phone, even when accessing by IP. An HTTP public IP,
or simply bypassing a self-signed certificate warning, is not a reliable setup
for microphone access. Keyboard dictation supplied by iOS/Android is a separate
input method and does not exercise the Codex microphone button.

Validate Android Chrome and iOS Safari separately: microphone permission,
record/stop/cancel, transcription into the composer, retry after a network
failure, and keyboard/safe-area layout. Automated fake-microphone checks do not
replace a physical phone test. Only tap Send after reviewing the dictated text.

### sign in

ensure the codex cli on the host machine is signed in before starting the
server.

```bash
codex login --device-auth
```

### proxying to app-server (advanced usage)

it’s often useful to run the app server separately, so a crash or restart of
codex-web doesn’t interrupt the codex process executing commands.

it's possible to hook codex-web up to an already-running app server using the
`codex_remote_proxy` script.

start a long-lived app server somewhere:

```bash
mkdir -p /tmp/codex-app-server
cd /tmp/codex-app-server
codex app-server --listen unix://codex-app-server.sock
```

then run `codex-web` with the proxy helper:

```bash
nix shell github:0xcaff/codex-web github:0xcaff/codex-web#codex_remote_proxy -c bash -lc '
  export CODEX_UNIX_SOCKET=/tmp/codex-app-server/codex-app-server.sock
  export CODEX_CLI_PATH="$(command -v codex_remote_proxy)"
  codex-web
'
```

`codex app-server proxy --sock ...` is a raw stdio protocol bridge for another
program to use; when run directly in a terminal it will wait for protocol input
rather than opening an interactive prompt.

## security

run `codex-web` only on trusted networks. treat anyone who can reach the
`codex-web` server as someone who can operate codex on the host machine as the
same user running the server.

if you need authn or authz, implement it outside of `codex-web`: proxy it through
wireguard, tailscale, or an ssh tunnel and put an authentication gateway or
reverse proxy in front.

someone with access to the web ui may be able to:

- run commands on the host, limited only by the permissions of the `codex-web`
  server process.
- read or modify files, environment variables, credentials, ssh keys, and other
  local resources that are accessible to that process.
- use the codex / chatgpt account already signed in on the host. this may
  consume usage quota or billing credits, and may expose account metadata shown
  by the app or cli, such as name or email address.

## features

- hostable on macOS, Linux (and anything codex cli + node will run on)
- reachable from the browser
- thin wrapper, so updates should land fast
- working today:
  - subagents
  - inline images
  - editor sidepanel
  - transcription

## roadmap

some parts of the desktop experience are not wired up yet:

- browser panel support, likely rebuilt around iframes
- computer use on linux, which could become a very powerful feature
- terminal support
- git worker integration
- whatever else people find and file issues for

## issues welcome

if something is broken, missing, or rough around the edges, please file an
issue.

using `codex-web` in an interesting way? post about it on x and tag me
[@0xcaff](https://x.com/0xcaff).

using this at a company and need something more tailored? email me and we can
talk.

## alternatives

* [davej/pocodex](https://github.com/davej/pocodex) i used this until the wheels fell off. i needed subagents
  and an inline image viewer. this didn't have them and was having a hard time
  keeping up with upstream codex updates.
* the native codex remote feature (behind a feature flag) is great for
  connecting to remote codex hosts over ssh to manage long running tasks but
  this only works if you have codex desktop on your client device. this means it
  doesn't work on mobile.
* upcoming first party mobile app from openai. `codex-web` exists and works
  today. i can't wait for the mobile app but judging by the other openai mobile
  apps, i'm a little bit skeptical about the quality of the mobile experience.
  time will tell.
