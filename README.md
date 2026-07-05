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

### docker

Build and start the local container:

```bash
docker compose up -d --build codex-web
```

The compose file is tuned for the current host user and data layout:

```bash
CODEX_WEB_UID=1000
CODEX_WEB_GID=1000
CODEX_WEB_DOCKER_GID=988
CODEX_WEB_HOME=/home/liuyu
CODEX_WEB_HOST=127.0.0.1
CODEX_WEB_PORT=8214
```

It mounts:

- `/home/liuyu` so the container can reuse the Codex CLI login and user config.
- `/mnt/ssd` so Codex can work with this repo and other SSD workspaces.
- `/tmp` for app server sockets and temporary files.
- `/var/run/docker.sock` so Codex can run Docker through the host daemon.

This gives Codex broad access to the host as user `liuyu`, plus Docker daemon
access. Treat the web UI as a remote shell with file and Docker access.

### cloudflare tunnel

Create a Cloudflare Tunnel token, then start the tunnel sidecar:

```bash
export CLOUDFLARE_TUNNEL_TOKEN=...
docker compose --profile tunnel up -d cloudflared
```

Keep `codex-web` bound to `127.0.0.1:8214` and expose it through Cloudflare
Tunnel. Add Cloudflare Access or another authentication layer before exposing it
to the internet.

### github actions deploy

This repo includes `.github/workflows/docker-deploy.yml`. It builds and starts
the Docker service on a self-hosted GitHub Actions runner:

```text
push to main / manual workflow_dispatch
  -> docker compose build codex-web
  -> docker compose up -d codex-web
  -> docker compose --profile tunnel up -d cloudflared when CLOUDFLARE_TUNNEL_TOKEN exists
```

Use a self-hosted runner on the machine that should run the service. GitHub
hosted runners cannot keep this service alive after the workflow exits.

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
codex app-server --listen unix:///tmp/codex-app-server.sock
```

then run `codex-web` with the proxy helper:

```bash
nix shell github:0xcaff/codex-web github:0xcaff/codex-web#codex_remote_proxy -c bash -lc '
  export CODEX_UNIX_SOCKET=/tmp/codex-app-server.sock
  export CODEX_CLI_PATH="$(command -v codex_remote_proxy)"
  codex-web
'
```

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
