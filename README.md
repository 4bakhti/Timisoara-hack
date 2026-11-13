# Framewise

A camera coach in your phone's browser: point it at a scene, pick one of three suggested shots, and it guides the photographer and the person in the photo until the shot is right.

Hackathon project for UNIHACK 8 (Timișoara, 13–15 November 2026). **Status:** in development during the event.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add keys to switch on the AI features
npm run dev                  # http://localhost:3000
```

Without keys the app runs on sample data. Camera access needs HTTPS or `localhost`.

## Contributing

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: it explains the modules and who owns which folder.
- Run `npm run check` before every push. Keep `main` working.
- Never commit secrets. Keys go in `.env.local`, which git ignores.
- List anything third-party in [docs/CREDITS.md](docs/CREDITS.md).
