export type ParsedDiff = {
  files: DiffFile[];
};

export type DiffFile = {
  path: string;
  oldPath?: string;
  hunks: DiffHunk[];
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

export type DiffLine = {
  kind: "context" | "addition" | "deletion";
  content: string;
  leftLine?: number;
  rightLine?: number;
};

export function annotateDiff(diff: string): string {
  let leftLine = 0;
  let rightLine = 0;

  return diff
    .split("\n")
    .map((line) => {
      const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

      if (hunkMatch !== null) {
        leftLine = Number(hunkMatch[1]);
        rightLine = Number(hunkMatch[2]);
        return line;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        const annotated = `RIGHT:${rightLine} ${line}`;
        rightLine += 1;
        return annotated;
      }

      if (line.startsWith("-") && !line.startsWith("---")) {
        const annotated = `LEFT:${leftLine} ${line}`;
        leftLine += 1;
        return annotated;
      }

      if (line.startsWith(" ")) {
        const annotated = `LEFT:${leftLine} RIGHT:${rightLine} ${line}`;
        leftLine += 1;
        rightLine += 1;
        return annotated;
      }

      return line;
    })
    .join("\n");
}

export function parseDiff(diff: string): ParsedDiff {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | undefined;
  let currentHunk: DiffHunk | undefined;
  let leftLine = 0;
  let rightLine = 0;

  for (const line of diff.split("\n")) {
    const fileMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(line);

    if (fileMatch !== null) {
      currentFile = { oldPath: fileMatch[1], path: fileMatch[2], hunks: [] };
      files.push(currentFile);
      currentHunk = undefined;
      continue;
    }

    const newPathMatch = /^\+\+\+ b\/(.+)$/.exec(line);

    if (newPathMatch !== null && currentFile !== undefined) {
      currentFile.path = newPathMatch[1];
      continue;
    }

    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunkMatch !== null && currentFile !== undefined) {
      leftLine = Number(hunkMatch[1]);
      rightLine = Number(hunkMatch[2]);
      currentHunk = {
        header: line,
        oldStart: leftLine,
        newStart: rightLine,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk === undefined) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentHunk.lines.push({ kind: "addition", content: line.slice(1), rightLine });
      rightLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentHunk.lines.push({ kind: "deletion", content: line.slice(1), leftLine });
      leftLine += 1;
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        kind: "context",
        content: line.slice(1),
        leftLine,
        rightLine,
      });
      leftLine += 1;
      rightLine += 1;
    }
  }

  return { files };
}
