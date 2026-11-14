# Deploying on Vultr

This puts Framewise on a Vultr server with a real HTTPS address. Phones need HTTPS to open the camera. The app code is unchanged: the server runs `next start` behind [Caddy](https://caddyserver.com/), which gets the certificate automatically.

You need about 20 minutes. Most of it is the first build.

## 1. Create the server

1. Claim the free Vultr credits from the MLH prize page: **Best Use of Vultr** → "Build with Vultr".
2. In Vultr, choose **Deploy → Cloud Compute (Shared CPU)**:
   - **Location**: Frankfurt or Warsaw, the closest to Timișoara.
   - **Image**: Ubuntu 24.04 LTS x64.
   - **Plan**: at least **2 GB RAM**; 4 GB builds faster. The setup adds 2 GB of swap either way.
   - **SSH key**: add yours, or use the root password shown on the server page.
3. Deploy it and copy the server's **IP address**.

## 2. Install the app

From your laptop:

```bash
ssh root@<IP>
```

On the server:

```bash
curl -fsSL https://raw.githubusercontent.com/4bakhti/Timisoara-hack/main/deploy/vultr/setup.sh -o setup.sh
```

```bash
bash setup.sh
```

At the end it prints the address, for example `https://203-0-113-5.sslip.io`. [sslip.io](https://sslip.io) turns the IP into a hostname, so you don't need to buy a domain. To use your own domain instead, point its DNS at the IP and run `DOMAIN=your.domain bash setup.sh`.

## 3. Add the keys (never in git)

```bash
nano /opt/framewise/app/.env.local
```

Fill in what you have; every value is optional:

| Variable | What it switches on |
|---|---|
| `GEMINI_API_KEY` | Real scene reading, ideas and review |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (`ELEVENLABS_VOICE_ID_RO`) | Studio voice |
| `ELEVENLABS_AGENT_ID` | Talking to the coach |
| `DATABASE_URL` | Durable storage on Tiger Data |
| `RECIPES_ADMIN_TOKEN` | Hiding abusive recipes |

If you set `DATABASE_URL`, create the tables once:

```bash
cd /opt/framewise/app && sudo -u framewise npm run db:migrate
```

Then rebuild and restart:

```bash
bash /opt/framewise/app/deploy/vultr/update.sh
```

## 4. Check it

- On a phone, open `https://<ip-with-dashes>.sslip.io/shoot` and allow the camera.
- `https://<ip-with-dashes>.sslip.io/api/health` shows which services the server can see, for example `"gemini": true`.

## After every merge to `main`

```bash
bash /opt/framewise/app/deploy/vultr/update.sh
```

## If something is wrong

| Symptom | Look at |
|---|---|
| The address does not load at all | `journalctl -u caddy -n 50`. Ports 80 and 443 must be open: check the server's Vultr firewall group if you added one. The certificate needs port 80 reachable. |
| "Bad gateway" | `journalctl -u framewise -n 50`. The app may still be starting, or the build failed. |
| AI or voice shows sample data | `/api/health`. A key is missing from `.env.local`, or you did not run `update.sh` after adding it. |

## Notes

- Without `DATABASE_URL`, feedback, recipes and stats live in the server's memory. On a single server they survive until the next restart or update, which is fine for a demo but not durable.
- The setup script contains no secrets. Keys stay in `/opt/framewise/app/.env.local`, readable only by the app's user.
