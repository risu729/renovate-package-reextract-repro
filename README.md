# Renovate package-file re-extraction reproductions

This repository contains minimal fixtures for Renovate managers that update
artifacts but do not expose a single-file `extractPackageFile()` implementation:

| Manager | Package file                   | Artifact path exercised                      |
| ------- | ------------------------------ | -------------------------------------------- |
| Bun     | `fixtures/bun/package.json`    | `bun install` updates `bun.lock`             |
| npm     | `fixtures/npm/package.json`    | `corepack use` adds the updated pnpm hash    |
| Gradle  | `fixtures/gradle/build.gradle` | the Gradle wrapper updates `gradle.lockfile` |

When an upgrade has `pendingVersions`, each artifact result reaches Renovate's
post-artifact safety check. On `upstream/main`, all three managers then emit:

```text
Could not re-extract the packageFile after updating it
```

## Reproduction snapshots

The comparisons were run on 2026-08-14 with these explicit upgrades:

| Manager | Upgrade                                 | Pending version(s)        |
| ------- | --------------------------------------- | ------------------------- |
| Bun     | `wrangler` 4.118.0 → 4.120.1            | 4.121.0, 4.122.0, 4.123.0 |
| npm     | `packageManager` pnpm 10.13.1 → 10.14.0 | 10.15.0                   |
| Gradle  | Guava 33.4.0-jre → 33.4.8-jre           | 33.5.0-jre                |

The version lists are recorded directly in the harness, so the comparison does
not depend on package release ages changing after the snapshot date.

Results from Renovate's real `getUpdatedPackageFiles()` path:

| Renovate source                                     | Bun        | npm   | Gradle | Artifact errors |
| --------------------------------------------------- | ---------- | ----- | ------ | --------------- |
| `renovatebot/renovate@72266403b6` (`upstream/main`) | warns      | warns | warns  | none            |
| `risu729/renovate@72290d94f4` (Bun fix)             | no warning | warns | warns  | none            |

The updated package and lock files were byte-identical between the two source
versions for all three managers. The Bun fix changes only its re-extraction
result.

## Running the harness

Install the Renovate repository's normal development dependencies, then copy
the harness into the source tree so its relative imports resolve:

```sh
cp harness/reextract-repro.spec.ts \
  /path/to/renovate/lib/workers/repository/update/branch/reextract-repro.spec.ts
cp -a . /tmp/renovate-package-reextract-target
```

Run from the Renovate checkout with Bun 1.3.14, Corepack, Java, and Gradle
available on `PATH`:

```sh
RENOVATE_REEXTRACT_REPRO_DIR=/tmp/renovate-package-reextract-target \
EXPECT_MISSING_REEXTRACTORS=bun,npm,gradle \
pnpm vitest lib/workers/repository/update/branch/reextract-repro.spec.ts --run
```

For the Bun-fix branch, use
`EXPECT_MISSING_REEXTRACTORS=npm,gradle` instead. Always use a fresh target copy
for each run because artifact generation intentionally modifies the fixtures.

## Related Renovate reports

No earlier Renovate issue or pull request containing the exact warning was
found as of 2026-08-14. The closest existing reports concern the generic safety
check rather than these missing manager extractors:

- [#41622](https://github.com/renovatebot/renovate/issues/41622) introduced the
  requirement to detect artifact updates that select pending versions.
- [#41624](https://github.com/renovatebot/renovate/issues/41624) tracks passing
  exact versions to artifact-producing package managers.
- [#41652](https://github.com/renovatebot/renovate/issues/41652) tracks passing
  minimum-release-age settings to package managers.
- [#43348](https://github.com/renovatebot/renovate/pull/43348) made the safety
  check tolerate extracted dependencies without a resolvable version.
