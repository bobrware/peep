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
