import type { GitCommit } from "../../electron/shared/git";

/**
 * Lays commits out in lanes for the commit graph, the way VS Code and most Git
 * clients draw it. Commits come in topological order (children first), and
 * each row is drawn on its own: lines enter from the top, meet at the commit's
 * dot in the middle, and leave from the bottom towards its parents.
 */

/** Number of distinct lane colors; see `--git-graph-*` in index.css. */
export const GRAPH_COLOR_COUNT = 8;

/** A line in one row. Columns are lane indexes; y runs top → middle → bottom. */
export type GraphSegment = {
  fromColumn: number;
  fromY: "top" | "middle";
  toColumn: number;
  toY: "middle" | "bottom";
  color: number;
};

export type GraphRow = {
  /** The lane the commit's dot is in. */
  column: number;
  color: number;
  segments: GraphSegment[];
  /** Lanes still running below the commit (by color), to continue under expanded rows. */
  lanesBelow: (number | null)[];
  /** Lanes used by this row, for its width. */
  width: number;
};

type Lane = { hash: string; color: number } | null;

const firstFree = (lanes: Lane[]) => {
  const index = lanes.indexOf(null);
  return index === -1 ? lanes.length : index;
};

export const layoutGraph = (commits: GitCommit[]): GraphRow[] => {
  // Each lane waits for the commit it leads to.
  let lanes: Lane[] = [];
  let nextColor = 0;
  const newColor = () => nextColor++ % GRAPH_COLOR_COUNT;

  return commits.map((commit) => {
    let column = lanes.findIndex((lane) => lane?.hash === commit.hash);
    // A branch tip nothing above leads to starts a lane of its own.
    const color = column === -1 ? newColor() : lanes[column]!.color;
    if (column === -1) column = firstFree(lanes);

    const segments: GraphSegment[] = [];
    const below: Lane[] = [...lanes];
    while (below.length <= column) below.push(null);

    lanes.forEach((lane, index) => {
      if (!lane) return;
      if (lane.hash === commit.hash) {
        // Every child's lane ends at this commit.
        segments.push({
          fromColumn: index,
          fromY: "top",
          toColumn: column,
          toY: "middle",
          color: lane.color,
        });
        below[index] = null;
      } else {
        segments.push({
          fromColumn: index,
          fromY: "top",
          toColumn: index,
          toY: "bottom",
          color: lane.color,
        });
      }
    });

    commit.parents.forEach((parent, parentIndex) => {
      let target: number;
      if (parentIndex === 0 && !below[column]) {
        // The first parent carries on the commit's own lane, even if another
        // lane already waits for it: that one joins this lane at the parent.
        target = column;
        below[target] = { hash: parent, color };
      } else {
        target = below.findIndex((lane) => lane?.hash === parent);
        if (target === -1) {
          target = firstFree(below);
          below[target] = { hash: parent, color: newColor() };
        }
      }
      segments.push({
        fromColumn: column,
        fromY: "middle",
        toColumn: target,
        toY: "bottom",
        color: below[target]!.color,
      });
    });

    while (below.length > 0 && below[below.length - 1] === null) below.pop();
    const width = Math.max(lanes.length, below.length, column + 1);
    lanes = below;

    return {
      column,
      color,
      segments,
      lanesBelow: below.map((lane) => lane?.color ?? null),
      width,
    };
  });
};
