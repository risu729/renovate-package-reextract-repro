import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { git, logger, scm } from "~test/util.ts";
import { GlobalConfig } from "../../../../config/global.ts";
import type { BranchConfig, BranchUpgradeConfig } from "../../../types.ts";
import { getUpdatedPackageFiles } from "./get-updated.ts";

vi.unmock("../../../../util/exec/common.ts");

type Repro = {
  manager: "bun" | "gradle" | "npm";
  packageFile: string;
  lockFiles: string[];
  upgrade: BranchUpgradeConfig;
};

const repros: Repro[] = [
  {
    manager: "bun",
    packageFile: "fixtures/bun/package.json",
    lockFiles: ["fixtures/bun/bun.lock"],
    upgrade: {
      branchName: "renovate/wrangler-4.x",
      currentValue: "4.118.0",
      currentVersion: "4.118.0",
      datasource: "npm",
      depName: "wrangler",
      depType: "devDependencies",
      lockFiles: ["fixtures/bun/bun.lock"],
      manager: "bun",
      newValue: "4.120.1",
      newVersion: "4.120.1",
      packageFile: "fixtures/bun/package.json",
      pendingVersions: ["4.121.0", "4.122.0", "4.123.0"],
      updateType: "minor",
    },
  },
  {
    manager: "npm",
    packageFile: "fixtures/npm/package.json",
    lockFiles: ["fixtures/npm/pnpm-lock.yaml"],
    upgrade: {
      branchName: "renovate/pnpm-10.x",
      currentValue:
        "10.13.1+sha512.37ebf1a5c7a30d5fabe0c5df44ee8da4c965ca0c5af3dbab28c3a1681b70a256218d05c81c9c0dcf767ef6b8551eb5b960042b9ed4300c59242336377e01cfad",
      currentVersion: "10.13.1",
      datasource: "npm",
      depName: "pnpm",
      depType: "packageManager",
      lockFiles: ["fixtures/npm/pnpm-lock.yaml"],
      manager: "npm",
      newValue: "10.14.0",
      newVersion: "10.14.0",
      packageFile: "fixtures/npm/package.json",
      pendingVersions: ["10.15.0"],
      updateType: "minor",
    },
  },
  {
    manager: "gradle",
    packageFile: "fixtures/gradle/build.gradle",
    lockFiles: ["fixtures/gradle/gradle.lockfile"],
    upgrade: {
      branchName: "renovate/guava-33.x",
      currentValue: "33.4.0-jre",
      currentVersion: "33.4.0-jre",
      datasource: "maven",
      depName: "com.google.guava:guava",
      lockFiles: ["fixtures/gradle/gradle.lockfile"],
      manager: "gradle",
      managerData: { fileReplacePosition: 122 },
      newValue: "33.4.8-jre",
      newVersion: "33.4.8-jre",
      packageFile: "fixtures/gradle/build.gradle",
      pendingVersions: ["33.5.0-jre"],
      updateType: "patch",
    },
  },
];

describe("missing package-file re-extractors", () => {
  const localDir = process.env.RENOVATE_REEXTRACT_REPRO_DIR!;
  const expectedWarnings = new Set(
    process.env.EXPECT_MISSING_REEXTRACTORS?.split(",").filter(Boolean),
  );

  beforeEach(() => {
    GlobalConfig.set({
      allowedUnsafeExecutions: ["gradleWrapper"],
      allowScripts: false,
      binarySource: "global",
      cacheDir: join(localDir, ".renovate-cache"),
      containerbaseDir: join(localDir, ".renovate-cache/containerbase"),
      executionTimeout: 5,
      localDir,
      platform: "github",
    });
    git.getFile.mockImplementation(async (fileName: string) =>
      readFile(join(localDir, fileName), "utf8"),
    );
    git.getFiles.mockImplementation(async (fileNames: string[]) =>
      Object.fromEntries(
        await Promise.all(
          fileNames.map(async (fileName) => [
            fileName,
            await readFile(join(localDir, fileName), "utf8"),
          ]),
        ),
      ),
    );
    git.getRepoStatus.mockResolvedValue({
      modified: ["fixtures/gradle/gradle.lockfile"],
    } as never);
    scm.getFileList.mockResolvedValue(
      repros.flatMap(({ packageFile, lockFiles }) => [
        packageFile,
        ...lockFiles,
      ]),
    );
  });

  it.each(repros)(
    "$manager reaches the pending-version re-extraction check",
    async (repro) => {
      const config = {
        baseBranch: "main",
        branchName: repro.upgrade.branchName,
        constraints: { bun: "1.3.14" },
        ignoreScripts: true,
        manager: repro.manager,
        minimumReleaseAgeBehaviour: "timestamp-required",
        packageFiles: {
          [repro.manager]: [
            {
              deps: [],
              lockFiles: repro.lockFiles,
              packageFile: repro.packageFile,
            },
          ],
        },
        reuseExistingBranch: false,
        upgrades: [repro.upgrade],
      } satisfies BranchConfig;

      const result = await getUpdatedPackageFiles(config);
      const reextractWarnings = logger.logger.warn.mock.calls.filter(
        ([, message]) =>
          message === "Could not re-extract the packageFile after updating it",
      );

      expect(result.artifactErrors).toEqual([]);
      expect(result.updatedArtifacts).not.toEqual([]);
      expect(reextractWarnings).toHaveLength(
        expectedWarnings.has(repro.manager) ? 1 : 0,
      );
    },
    60_000,
  );
});
