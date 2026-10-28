import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

export type FileTiming = {
  file: string;
  project: string;
  attempts: number;
  durationMs: number;
  failed: number;
  skipped: number;
};
export function addTiming(
  rows: FileTiming[],
  file: string,
  project: string,
  result: Pick<TestResult, "duration" | "status">,
) {
  let row = rows.find(
    (entry) => entry.file === file && entry.project === project,
  );
  if (!row) {
    row = { file, project, attempts: 0, durationMs: 0, failed: 0, skipped: 0 };
    rows.push(row);
  }
  row.attempts++;
  row.durationMs += result.duration;
  if (["failed", "timedOut", "interrupted"].includes(result.status))
    row.failed++;
  if (result.status === "skipped") row.skipped++;
}

/** Persist durations only, never test titles, bodies, errors or credentials. */
export default class CiTimingReporter implements Reporter {
  private rows: FileTiming[] = [];
  private output = "test-results";
  private root = process.cwd();
  onBegin(config: FullConfig) {
    this.root = config.rootDir;
    this.output = config.projects[0]?.outputDir ?? this.output;
  }
  onTestEnd(test: TestCase, result: TestResult) {
    addTiming(
      this.rows,
      relative(this.root, test.location.file),
      test.parent.project()?.name ?? "default",
      result,
    );
  }
  onEnd(result: FullResult) {
    this.rows.sort((a, b) => b.durationMs - a.durationMs);
    mkdirSync(this.output, { recursive: true });
    writeFileSync(
      join(this.output, "ci-timings.json"),
      JSON.stringify(
        {
          elapsedMs: result.duration,
          status: result.status,
          files: this.rows,
        },
        null,
        2,
      ) + "\n",
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      const clean = (value: string) => value.replace(/[|\r\n]/g, " ");
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "### Playwright execution timing\n\n" +
          "Measured test execution: " +
          Math.round(result.duration / 1000) +
          "s. Runner queue, container pull and setup are separate.\n\n" +
          "| Spec | Project | Attempts | Test seconds |\n| --- | --- | ---: | ---: |\n" +
          this.rows
            .slice(0, 12)
            .map(
              (row) =>
                "| " +
                clean(row.file) +
                " | " +
                clean(row.project) +
                " | " +
                row.attempts +
                " | " +
                Math.round(row.durationMs / 1000) +
                " |",
            )
            .join("\n") +
          "\n",
      );
    }
  }
}
