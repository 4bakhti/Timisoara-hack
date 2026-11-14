# Lifecycle regression checks

These tests come from the quality review (`docs/quality/REVIEW.md`). At baseline `0439c62` all three failed. The fixes have landed, so they now pass and run in the normal suite (`npm run test`, and so in `npm run check`).

To run only these, from the repository root:

```sh
./node_modules/.bin/vitest run --config tools/quality/vitest.config.mts
```

They use mocked frame encoding, network and audio, so no keys, cameras or provider calls are needed. When the engines or the voice player change their internals, update the mocks but keep the behaviour each test checks: a stopped session never delivers a photo, and muting stops pending speech for good.
