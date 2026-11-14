# Independent lifecycle regression checks

Run from the repository root after `npm ci`:

```sh
./node_modules/.bin/vitest run --config tools/quality/vitest.config.mts
```

At baseline `0439c62`, all three assertions fail for the defects documented in `docs/quality/REVIEW.md`. This is an intentionally separate diagnostic suite, not a passing release check. It tests desired behavior using mocked frame encoding, network and audio so no keys, cameras or provider calls are required. After the assigned owners fix cancellation, the assertions should pass unchanged (or be adapted to a deliberate public API change while retaining the same behavior).

Run `npm run test` separately for the existing suite. The new tests do not change its configuration or production code. The integrator should require both suites to pass after fixes, and include these regression cases in the normal suite once the owning PRs land.
