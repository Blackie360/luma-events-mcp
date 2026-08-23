import assert from "node:assert/strict";
import test from "node:test";

import {
  createYearlyRanges,
  getNpmDownloadStats,
  NPM_PACKAGE,
  VERIFIED_DATE,
  VERIFIED_DOWNLOADS,
} from "./npm-stats.ts";

function pointResponse(downloads: number, start: string, end: string) {
  return new Response(
    JSON.stringify({ downloads, start, end, package: NPM_PACKAGE }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("returns the verified live total for a single range", async () => {
  const urls: string[] = [];
  const stats = await getNpmDownloadStats({
    now: new Date("2026-08-23T12:00:00.000Z"),
    fetchImpl: async (input) => {
      urls.push(String(input));
      return pointResponse(497, "2026-07-29", "2026-08-23");
    },
  });

  assert.deepEqual(stats, {
    downloads: 497,
    start: "2026-07-29",
    end: "2026-08-23",
    isFallback: false,
  });
  assert.deepEqual(urls, [
    "https://api.npmjs.org/downloads/point/2026-07-29:2026-08-23/luma-events",
  ]);
});

test("splits long-lived totals into yearly ranges and sums them", async () => {
  const ranges = createYearlyRanges("2026-07-29", "2028-08-01");
  assert.deepEqual(ranges, [
    { start: "2026-07-29", end: "2027-07-28" },
    { start: "2027-07-29", end: "2028-07-28" },
    { start: "2028-07-29", end: "2028-08-01" },
  ]);

  const totals = [500, 300, 25];
  let requestIndex = 0;
  const stats = await getNpmDownloadStats({
    now: new Date("2028-08-01T08:00:00.000Z"),
    fetchImpl: async () => {
      const range = ranges[requestIndex];
      const downloads = totals[requestIndex];
      requestIndex += 1;
      return pointResponse(downloads, range.start, range.end);
    },
  });

  assert.equal(stats.downloads, 825);
  assert.equal(stats.isFallback, false);
});

test("uses the verified fallback when npm returns malformed data", async () => {
  const stats = await getNpmDownloadStats({
    now: new Date("2026-08-23T12:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({ downloads: "497" })),
  });

  assert.deepEqual(stats, {
    downloads: VERIFIED_DOWNLOADS,
    start: "2026-07-29",
    end: VERIFIED_DATE,
    isFallback: true,
  });
});

test("uses the verified fallback when npm is unavailable", async () => {
  const stats = await getNpmDownloadStats({
    now: new Date("2026-08-23T12:00:00.000Z"),
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(stats.downloads, VERIFIED_DOWNLOADS);
  assert.equal(stats.end, VERIFIED_DATE);
  assert.equal(stats.isFallback, true);
});
