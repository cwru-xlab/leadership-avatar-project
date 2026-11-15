import type { PostSessionMaterial } from "../post-session.server";

/**
 * Post-session material for the tree, graph, dynamic-programming, interval
 * and harder binary-search problems. Server-only: see `post-session.server.ts`.
 */
export const ALGORITHM_MATERIAL: Readonly<Record<string, PostSessionMaterial>> = {
  "tree-depth": {
    approach: [
      "Start by defining the base case: the empty tree has depth 0. Saying that first makes the rest of the solution almost write itself.",
      "The insight is a recurrence. A non-empty node's depth is one level for the node itself plus the depth of its deeper child. Each child is itself a tree in the same [value, left, right] shape, so the same function answers that question.",
      "Recursion visits every node once. If the interviewer worries about very deep trees, mention that an explicit stack or a level-by-level breadth-first search gives the same answer without relying on the call stack.",
    ].join("\n\n"),
    complexity: "O(n) time, O(h) stack space where h is the tree height (O(n) for a fully skewed tree).",
    pitfalls: [
      "Returning 1 for the empty tree, which shifts every answer up by one.",
      "Adding the depths of both children instead of taking the larger one.",
      "Indexing into a None or null child without checking for the empty tree first.",
    ],
    modelSolutions: {
      python: String.raw`def tree_depth(tree):
    # The empty tree has no levels.
    if tree is None:
        return 0

    _value, left_subtree, right_subtree = tree
    # This node adds one level on top of its deeper child.
    return 1 + max(tree_depth(left_subtree), tree_depth(right_subtree))
`,
      javascript: String.raw`function tree_depth(tree) {
  // The empty tree has no levels.
  if (tree === null) return 0;

  const [, leftSubtree, rightSubtree] = tree;
  // This node adds one level on top of its deeper child.
  return 1 + Math.max(tree_depth(leftSubtree), tree_depth(rightSubtree));
}
`,
    },
  },

  "invert-binary-tree": {
    approach: [
      "Look at a single node first. Mirroring it means its value stays put, its left subtree moves to the right, and its right subtree moves to the left. Each of those subtrees must itself be mirrored.",
      "That gives a recursive definition: the mirror of the empty tree is the empty tree, and the mirror of [value, left, right] is [value, mirror(right), mirror(left)].",
      "Building a new list for every node means the input is never modified, and nothing is lost by overwriting one side before reading it. Every node is visited once.",
    ].join("\n\n"),
    complexity: "O(n) time, O(h) stack space for the recursion plus O(n) for the new tree.",
    pitfalls: [
      "Swapping only the root's children and forgetting to mirror the subtrees below them.",
      "Mutating in place by assigning left = invert(right) and then right = invert(left), which reads the already-overwritten side.",
      "Returning an empty list instead of None or null for the empty tree.",
    ],
    modelSolutions: {
      python: String.raw`def invert_tree(tree):
    # The mirror of the empty tree is the empty tree.
    if tree is None:
        return None

    value, left_subtree, right_subtree = tree
    # Keep the value; the mirrored right subtree becomes the new left, and vice versa.
    return [value, invert_tree(right_subtree), invert_tree(left_subtree)]
`,
      javascript: String.raw`function invert_tree(tree) {
  // The mirror of the empty tree is the empty tree.
  if (tree === null) return null;

  const [value, leftSubtree, rightSubtree] = tree;
  // Keep the value; the mirrored right subtree becomes the new left, and vice versa.
  return [value, invert_tree(rightSubtree), invert_tree(leftSubtree)];
}
`,
    },
  },

  "climbing-steps": {
    approach: [
      "A brute-force recursion tries a 1-step and a 2-step move from every position and counts the paths that land exactly on n. It recomputes the same positions over and over, so it grows exponentially.",
      "The insight comes from the last move. Every way to reach step n ends with either a 1-step from n - 1 or a 2-step from n - 2, and those two groups never overlap. So ways(n) = ways(n - 1) + ways(n - 2), the Fibonacci recurrence.",
      "The base cases matter: there is exactly one way to climb 0 steps (do nothing) and one way to climb 1 step. From there, build upwards. You only ever need the two previous totals, so two variables replace the whole table.",
    ].join("\n\n"),
    complexity: "O(n) time, O(1) space.",
    pitfalls: [
      "Returning 0 for n = 0 when there is exactly one way to climb no steps.",
      "Plain recursion without memoization, which is exponential and times out for larger n.",
      "An off-by-one in the loop that returns ways(n + 1) or ways(n - 1).",
    ],
    modelSolutions: {
      python: String.raw`def climbing_steps(n):
    # ways_to_current = ways(i), ways_to_next = ways(i + 1), starting at i = 0.
    ways_to_current, ways_to_next = 1, 1

    for _ in range(n):
        # ways(i + 2) = ways(i + 1) + ways(i): the last move was 1 or 2 steps.
        ways_to_current, ways_to_next = ways_to_next, ways_to_current + ways_to_next

    return ways_to_current
`,
      javascript: String.raw`function climbing_steps(n) {
  // waysToCurrent = ways(i), waysToNext = ways(i + 1), starting at i = 0.
  let waysToCurrent = 1;
  let waysToNext = 1;

  for (let step = 0; step < n; step += 1) {
    // ways(i + 2) = ways(i + 1) + ways(i): the last move was 1 or 2 steps.
    const waysAfterNext = waysToCurrent + waysToNext;
    waysToCurrent = waysToNext;
    waysToNext = waysAfterNext;
  }

  return waysToCurrent;
}
`,
    },
  },

  "flood-fill": {
    approach: [
      "Begin by defining the region: the starting cell plus every cell with the same original color that you can reach by moving up, down, left or right through cells of that color.",
      "That is a graph search where each cell is a node and its four neighbours are edges. Depth-first search with an explicit stack, or breadth-first search with a queue, both work. Copy the grid first so the input is not modified.",
      "Recolor a cell as soon as you take it off the stack. Because a recolored cell no longer has the original color, it will never be accepted again, so the recoloring doubles as the \"visited\" mark.",
      "One edge case breaks that trick: if the new color equals the original color, recoloring changes nothing and the search would loop forever. Return the copy immediately in that case.",
    ].join("\n\n"),
    complexity: "O(rows × columns) time and space in the worst case.",
    pitfalls: [
      "Not handling new color == original color, which causes an infinite loop.",
      "Including diagonal neighbours, which the problem does not allow.",
      "Checking bounds after indexing, or forgetting that rows can have a different count than columns.",
      "Modifying the input grid instead of a copy.",
    ],
    modelSolutions: {
      python: String.raw`def flood_fill(grid, row, col, color):
    filled = [list(grid_row) for grid_row in grid]  # Never modify the input.
    original_color = filled[row][col]
    # Recoloring to the same color would never mark cells as done.
    if original_color == color:
        return filled

    row_count, column_count = len(filled), len(filled[0])
    cells_to_visit = [(row, col)]

    while cells_to_visit:
        current_row, current_col = cells_to_visit.pop()
        inside = 0 <= current_row < row_count and 0 <= current_col < column_count
        if not inside or filled[current_row][current_col] != original_color:
            continue
        # Recoloring also marks the cell as visited.
        filled[current_row][current_col] = color
        cells_to_visit.extend([
            (current_row + 1, current_col),
            (current_row - 1, current_col),
            (current_row, current_col + 1),
            (current_row, current_col - 1),
        ])

    return filled
`,
      javascript: String.raw`function flood_fill(grid, row, col, color) {
  const filled = grid.map((gridRow) => [...gridRow]); // Never modify the input.
  const originalColor = filled[row][col];
  // Recoloring to the same color would never mark cells as done.
  if (originalColor === color) return filled;

  const rowCount = filled.length;
  const columnCount = filled[0].length;
  const cellsToVisit = [[row, col]];

  while (cellsToVisit.length > 0) {
    const [currentRow, currentCol] = cellsToVisit.pop();
    const inside = currentRow >= 0 && currentRow < rowCount && currentCol >= 0 && currentCol < columnCount;
    if (!inside || filled[currentRow][currentCol] !== originalColor) continue;
    // Recoloring also marks the cell as visited.
    filled[currentRow][currentCol] = color;
    cellsToVisit.push(
      [currentRow + 1, currentCol],
      [currentRow - 1, currentCol],
      [currentRow, currentCol + 1],
      [currentRow, currentCol - 1],
    );
  }

  return filled;
}
`,
    },
  },

  "merge-overlapping-windows": {
    approach: [
      "Without any ordering, deciding which windows overlap means comparing every pair, and merges can chain (A overlaps B, B overlaps C), so the brute force is messy and at least O(n²).",
      "The insight is to sort by start. Once windows are in start order, a new window can only overlap the most recent merged window, never an earlier one, because everything before that has already ended.",
      "Walk the sorted windows, keeping a list of merged results. If the current window starts at or before the end of the last merged window, extend that window's end to the larger of the two ends. Otherwise the last merged window is finished, so start a new one.",
      "Sorting dominates the cost. Use the larger of the two ends when extending, because a short window can sit entirely inside a long one.",
    ].join("\n\n"),
    complexity: "O(n log n) time for the sort, O(n) space for the sorted copy and the output.",
    pitfalls: [
      "Forgetting to sort first, which misses overlaps between windows that are far apart in the input.",
      "Setting the merged end to the current window's end instead of the larger of the two, which shrinks [1, 10] when [2, 3] arrives.",
      "Using < instead of <= so touching windows like [1, 4] and [4, 5] do not merge.",
      "Mutating the caller's window lists while extending ends.",
    ],
    modelSolutions: {
      python: String.raw`def merge_overlapping_windows(windows):
    merged = []

    # In start order, a window can only overlap the most recent merged one.
    for start, end in sorted(windows):
        if merged and start <= merged[-1][1]:
            # Overlapping or touching: stretch the current merged window.
            merged[-1][1] = max(merged[-1][1], end)
        else:
            # A gap: the previous merged window is final; begin a new one.
            merged.append([start, end])

    return merged
`,
      javascript: String.raw`function merge_overlapping_windows(windows) {
  // Sort a copy by start (then end) so the input is untouched.
  const sorted = [...windows].sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const merged = [];

  // In start order, a window can only overlap the most recent merged one.
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      // Overlapping or touching: stretch the current merged window.
      last[1] = Math.max(last[1], end);
    } else {
      // A gap: the previous merged window is final; begin a new one.
      merged.push([start, end]);
    }
  }

  return merged;
}
`,
    },
  },

  "word-break-reachable": {
    approach: [
      "The brute-force recursion tries every word that matches at the start of the text, then recurses on the rest. With repetitive input such as \"aaaaaaa\" and words \"aaa\" and \"aaaa\", it re-solves the same suffixes many times and becomes exponential.",
      "The insight is to ask a smaller question about prefixes: can the first i characters be split into words? The empty prefix can (zero words). A longer prefix can if some earlier split point j can be reached and the piece text[j:i] is a word.",
      "Fill a list of booleans reachable[0..n] from left to right, then return reachable[n]. Put the words in a set so each piece check is fast. Because no word is longer than the longest word in the list, you only need to try split points within that distance, which keeps the inner loop short.",
      "This is the memoized version of the recursion, written bottom-up. Mention either form; the key is that each prefix is solved once.",
    ].join("\n\n"),
    complexity: "O(n² · k) time in the worst case (n split pairs, k to slice and hash each piece), O(n) space for the table plus the word set.",
    pitfalls: [
      "Greedily taking the longest (or first) matching word, which fails on cases like \"cars\" with [\"car\", \"ca\", \"rs\"].",
      "Plain recursion without memoization, which times out on repetitive input.",
      "Forgetting that an empty text is segmentable, so reachable[0] must start as true.",
    ],
    modelSolutions: {
      python: String.raw`def word_break_reachable(text, words):
    word_set = set(words)
    longest_word = max((len(word) for word in words), default=0)

    # reachable[i] is True when text[:i] can be split into words.
    reachable = [False] * (len(text) + 1)
    reachable[0] = True  # The empty prefix needs zero words.

    for end in range(1, len(text) + 1):
        # Only split points within one word's length of end can matter.
        for start in range(max(0, end - longest_word), end):
            if reachable[start] and text[start:end] in word_set:
                reachable[end] = True
                break

    return reachable[len(text)]
`,
      javascript: String.raw`function word_break_reachable(text, words) {
  const wordSet = new Set(words);
  const longestWord = words.reduce((longest, word) => Math.max(longest, word.length), 0);

  // reachable[i] is true when text.slice(0, i) can be split into words.
  const reachable = new Array(text.length + 1).fill(false);
  reachable[0] = true; // The empty prefix needs zero words.

  for (let end = 1; end <= text.length; end += 1) {
    // Only split points within one word's length of end can matter.
    for (let start = Math.max(0, end - longestWord); start < end; start += 1) {
      if (reachable[start] && wordSet.has(text.slice(start, end))) {
        reachable[end] = true;
        break;
      }
    }
  }

  return reachable[text.length];
}
`,
    },
  },

  "course-order": {
    approach: [
      "Model the courses as a directed graph: a pair [a, b] is an edge from b to a, because b must be taken before a. A valid order is a topological order of that graph, and none exists when the graph has a cycle.",
      "Kahn's algorithm builds the order directly. Count each course's unmet prerequisites (its in-degree). Every course with zero unmet prerequisites can be taken now, so put them in a queue.",
      "Repeatedly take a course from the queue, add it to the order, and for each course that depended on it, reduce that course's count by one. When a count reaches zero, that course becomes available and joins the queue.",
      "If the order ends up containing all n courses, return it. If the queue empties early, the remaining courses all wait on each other in a cycle, so return an empty list. Depth-first search with three colors is an equally good alternative; say which one you choose and why.",
    ].join("\n\n"),
    complexity: "O(n + e) time and O(n + e) space, where e is the number of prerequisite pairs.",
    pitfalls: [
      "Reversing the edge direction, which produces the order backwards.",
      "Forgetting courses with no prerequisites and no dependents, so they never appear in the output.",
      "Not detecting a cycle and returning a partial order instead of an empty list.",
      "Using list.pop(0) or Array.shift() for the queue, which quietly makes the algorithm O(n²).",
    ],
    modelSolutions: {
      python: String.raw`from collections import deque


def course_order(n, prerequisites):
    unlocks = [[] for _ in range(n)]  # unlocks[b] = courses that need b first.
    unmet_count = [0] * n             # How many prerequisites each course still needs.
    for course, prerequisite in prerequisites:
        unlocks[prerequisite].append(course)
        unmet_count[course] += 1

    # Courses with no prerequisites can be taken right away.
    available = deque(course for course in range(n) if unmet_count[course] == 0)
    order = []

    while available:
        course = available.popleft()
        order.append(course)
        for next_course in unlocks[course]:
            unmet_count[next_course] -= 1
            if unmet_count[next_course] == 0:
                available.append(next_course)

    # If some courses were never freed, they sit on a cycle.
    return order if len(order) == n else []
`,
      javascript: String.raw`function course_order(n, prerequisites) {
  const unlocks = Array.from({ length: n }, () => []); // unlocks[b] = courses that need b first.
  const unmetCount = new Array(n).fill(0); // How many prerequisites each course still needs.
  for (const [course, prerequisite] of prerequisites) {
    unlocks[prerequisite].push(course);
    unmetCount[course] += 1;
  }

  // Courses with no prerequisites can be taken right away.
  // The order array doubles as the queue: next is the read position.
  const order = [];
  for (let course = 0; course < n; course += 1) {
    if (unmetCount[course] === 0) order.push(course);
  }

  for (let next = 0; next < order.length; next += 1) {
    for (const nextCourse of unlocks[order[next]]) {
      unmetCount[nextCourse] -= 1;
      if (unmetCount[nextCourse] === 0) order.push(nextCourse);
    }
  }

  // If some courses were never freed, they sit on a cycle.
  return order.length === n ? order : [];
}
`,
    },
  },

  "median-of-two-sorted": {
    approach: [
      "The simplest correct answer merges the two lists (or concatenates and sorts them) and reads the middle. Merging is O(n + m), and that is a fine first answer to say out loud, but the target is O(log(min(n, m))), so the interviewer is looking for something that does not touch every value.",
      "The insight is to stop thinking about merging and think about a split. The median divides all values into a left half and a right half of equal size (the left gets the extra value when the total is odd), where everything on the left is at most everything on the right. If you take i values from the shorter list for the left half, the size rule forces exactly j = half - i values from the longer list.",
      "So the only unknown is i, and you can binary-search it over the shorter list. For a candidate i, compare the four boundary values: the last value taken from each list and the first value left behind in each. If the shorter list's left boundary is bigger than the longer list's right boundary, you took too many from the shorter list, so move i left. If the longer list's left boundary is bigger than the shorter list's right boundary, move i right. Otherwise the split is valid.",
      "With a valid split, the median is the larger left boundary when the total is odd, or the average of the larger left boundary and the smaller right boundary when it is even. Treat a boundary past either end of a list as negative or positive infinity so empty sides need no special cases. Searching the shorter list is what keeps j in range and gives the O(log(min(n, m))) bound.",
    ].join("\n\n"),
    complexity: "O(log(min(n, m))) time, O(1) space.",
    pitfalls: [
      "Concatenating and sorting, which is correct but O((n + m) log(n + m)) and misses the target.",
      "Binary-searching the longer list, which can push j below 0 or past the end of the shorter side.",
      "Forgetting the infinity sentinels, so an empty list or a split at either end raises an index error.",
      "Integer division when averaging the two middle values, which turns 2.5 into 2.",
    ],
    modelSolutions: {
      python: String.raw`def median_of_two_sorted(left, right):
    # Binary-search the shorter list so the partner split always fits.
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    total = len(shorter) + len(longer)
    if total == 0:
        raise ValueError("At least one list must contain a value")
    left_half_size = (total + 1) // 2  # The left half takes the extra value.

    low, high = 0, len(shorter)
    while low <= high:
        take_short = (low + high) // 2           # Values taken from the shorter list.
        take_long = left_half_size - take_short  # The rest come from the longer list.

        # Boundary values; infinities stand in for "nothing on this side".
        short_left = shorter[take_short - 1] if take_short > 0 else float("-inf")
        short_right = shorter[take_short] if take_short < len(shorter) else float("inf")
        long_left = longer[take_long - 1] if take_long > 0 else float("-inf")
        long_right = longer[take_long] if take_long < len(longer) else float("inf")

        if short_left > long_right:
            high = take_short - 1  # Took too many from the shorter list.
        elif long_left > short_right:
            low = take_short + 1   # Took too few from the shorter list.
        else:
            # Valid split: every left value <= every right value.
            if total % 2 == 1:
                return float(max(short_left, long_left))
            return (max(short_left, long_left) + min(short_right, long_right)) / 2

    raise ValueError("Inputs must be sorted in ascending order")
`,
      javascript: String.raw`function median_of_two_sorted(left, right) {
  // Binary-search the shorter list so the partner split always fits.
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const total = shorter.length + longer.length;
  if (total === 0) throw new Error("At least one list must contain a value");
  const leftHalfSize = Math.floor((total + 1) / 2); // The left half takes the extra value.

  let low = 0;
  let high = shorter.length;
  while (low <= high) {
    const takeShort = Math.floor((low + high) / 2); // Values taken from the shorter list.
    const takeLong = leftHalfSize - takeShort; // The rest come from the longer list.

    // Boundary values; infinities stand in for "nothing on this side".
    const shortLeft = takeShort > 0 ? shorter[takeShort - 1] : -Infinity;
    const shortRight = takeShort < shorter.length ? shorter[takeShort] : Infinity;
    const longLeft = takeLong > 0 ? longer[takeLong - 1] : -Infinity;
    const longRight = takeLong < longer.length ? longer[takeLong] : Infinity;

    if (shortLeft > longRight) {
      high = takeShort - 1; // Took too many from the shorter list.
    } else if (longLeft > shortRight) {
      low = takeShort + 1; // Took too few from the shorter list.
    } else {
      // Valid split: every left value <= every right value.
      const leftMax = Math.max(shortLeft, longLeft);
      if (total % 2 === 1) return leftMax;
      return (leftMax + Math.min(shortRight, longRight)) / 2;
    }
  }

  throw new Error("Inputs must be sorted in ascending order");
}
`,
    },
  },
};
