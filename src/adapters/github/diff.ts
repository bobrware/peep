import type { Finding } from "../../core/schema.js";

export type GitHubReviewComment = {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
};

export function mapFindingsToReviewComments(
  findings: Finding[],
  diff: string,
): GitHubReviewComment[] {
  const locations = parseDiffLocations(diff);

  return findings.flatMap((finding) => {
    const key = formatLocationKey(finding.path, finding.line, finding.side);

    return locations.has(key)
      ? [{ path: finding.path, line: finding.line, side: finding.side, body: finding.message }]
      : [];
  });
}

function parseDiffLocations(diff: string): Set<string> {
  const locations = new Set<string>();
  let currentPath: string | undefined;
  let leftLine = 0;
  let rightLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git")) {
      currentPath = undefined;
      continue;
    }

    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);

    if (fileMatch !== null) {
      currentPath = fileMatch[1];
      continue;
    }

    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunkMatch !== null) {
      leftLine = Number(hunkMatch[1]);
      rightLine = Number(hunkMatch[2]);
      continue;
    }

    if (currentPath === undefined) {
      continue;
    }

    if (line.startsWith("+")) {
      locations.add(formatLocationKey(currentPath, rightLine, "RIGHT"));
      rightLine += 1;
    } else if (line.startsWith("-")) {
      locations.add(formatLocationKey(currentPath, leftLine, "LEFT"));
      leftLine += 1;
    } else if (line.startsWith(" ")) {
      locations.add(formatLocationKey(currentPath, leftLine, "LEFT"));
      locations.add(formatLocationKey(currentPath, rightLine, "RIGHT"));
      leftLine += 1;
      rightLine += 1;
    }
  }

  return locations;
}

function formatLocationKey(path: string, line: number, side: "LEFT" | "RIGHT"): string {
  return `${path}:${line}:${side}`;
}
