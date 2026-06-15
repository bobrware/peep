import type { Finding } from "../../core/schema.js";

export type GitHubReviewComment = {
  path: string;
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
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

    if (!locations.has(key)) {
      return [];
    }

    const comment: GitHubReviewComment = {
      path: finding.path,
      line: finding.line,
      side: finding.side,
      body: finding.message,
    };

    if (isMappableRange(finding, locations)) {
      comment.start_line = finding.startLine;
      comment.start_side = finding.startSide;
    }

    return [comment];
  });
}

function isMappableRange(finding: Finding, locations: Set<string>): boolean {
  if (finding.startLine === undefined || finding.startSide === undefined) {
    return false;
  }

  if (finding.startSide !== finding.side || finding.startLine >= finding.line) {
    return false;
  }

  for (let line = finding.startLine; line <= finding.line; line += 1) {
    if (!locations.has(formatLocationKey(finding.path, line, finding.side))) {
      return false;
    }
  }

  return true;
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
