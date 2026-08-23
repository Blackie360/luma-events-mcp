export type NpmDownloadStats = {
  downloads: number;
  start: string;
  end: string;
  isFallback: boolean;
};

type NpmPointResponse = {
  downloads: number;
  start: string;
  end: string;
  package: string;
};

type NextFetchInit = RequestInit & {
  next?: {
    revalidate: number;
  };
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: NextFetchInit,
) => Promise<Response>;

type DownloadStatsOptions = {
  fetchImpl?: FetchLike;
  now?: Date;
};

export const NPM_PACKAGE = "luma-events";
export const RELEASE_DATE = "2026-07-29";
export const VERIFIED_DATE = "2026-08-23";
export const VERIFIED_DOWNLOADS = 497;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function createYearlyRanges(start: string, end: string) {
  const endDate = parseUtcDate(end);
  const ranges: Array<{ start: string; end: string }> = [];
  let cursor = parseUtcDate(start);

  while (cursor <= endDate) {
    const nextYear = new Date(
      Date.UTC(
        cursor.getUTCFullYear() + 1,
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
      ),
    );
    const candidateEnd = new Date(nextYear.getTime() - ONE_DAY_MS);
    const rangeEnd = candidateEnd < endDate ? candidateEnd : endDate;

    ranges.push({
      start: formatUtcDate(cursor),
      end: formatUtcDate(rangeEnd),
    });
    cursor = new Date(rangeEnd.getTime() + ONE_DAY_MS);
  }

  return ranges;
}

function isPointResponse(value: unknown): value is NpmPointResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<NpmPointResponse>;

  return (
    Number.isInteger(response.downloads) &&
    Number(response.downloads) >= 0 &&
    typeof response.start === "string" &&
    typeof response.end === "string" &&
    response.package === NPM_PACKAGE
  );
}

function fallbackStats(): NpmDownloadStats {
  return {
    downloads: VERIFIED_DOWNLOADS,
    start: RELEASE_DATE,
    end: VERIFIED_DATE,
    isFallback: true,
  };
}

export async function getNpmDownloadStats({
  fetchImpl = fetch,
  now = new Date(),
}: DownloadStatsOptions = {}): Promise<NpmDownloadStats> {
  const end = formatUtcDate(now);

  if (end < RELEASE_DATE) {
    return fallbackStats();
  }

  try {
    const ranges = createYearlyRanges(RELEASE_DATE, end);
    const totals = await Promise.all(
      ranges.map(async (range) => {
        const url = `https://api.npmjs.org/downloads/point/${range.start}:${range.end}/${NPM_PACKAGE}`;
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          next: { revalidate: 86_400 },
        });

        if (!response.ok) {
          throw new Error(`npm download request failed with ${response.status}`);
        }

        const payload: unknown = await response.json();

        if (!isPointResponse(payload)) {
          throw new Error("npm download response did not match the expected shape");
        }

        return payload.downloads;
      }),
    );

    return {
      downloads: totals.reduce((sum, downloads) => sum + downloads, 0),
      start: RELEASE_DATE,
      end,
      isFallback: false,
    };
  } catch {
    return fallbackStats();
  }
}
