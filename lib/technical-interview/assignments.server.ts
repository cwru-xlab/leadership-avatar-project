import { createHash } from "node:crypto";
import type {
  TechnicalAssignmentPrivate,
  TechnicalAssignmentPublic,
  TechnicalDifficulty,
  TechnicalTestCase,
  TechnicalTopic,
} from "./types";
import { toPublicTechnicalAssignment } from "./types";

type Pair = readonly [unknown, unknown];
const LIMITS = { timeoutMs: 2_000, memoryMb: 128, maxOutputBytes: 16_000 } as const;
const ANCHORS = ["Clarifies assumptions before implementation.", "Explains the algorithm and data structures.", "States time and space complexity accurately.", "Uses test results to narrate debugging."];
const p = (input: unknown, expected: unknown): Pair => [input, expected];

/**
 * Topic and difficulty for each catalog entry, keyed by id.
 *
 * Kept as a table rather than extra `make(...)` arguments so the catalog
 * one-liners stay readable, and so a missing tag is a loud lookup failure
 * instead of a silently-shifted positional argument. `validateTechnicalAssignmentCatalog`
 * rejects a catalog with an untagged entry, so this table cannot fall behind.
 *
 * Difficulty is relative to a 30-minute practice interview, not to any external
 * rating: "easy" is a single pass or a direct counting argument, "medium" needs
 * a non-obvious data structure or a two-phase approach, "hard" needs a
 * recurrence or a traversal the candidate has to design.
 */
const TAGS: Readonly<
  Record<string, { topics: readonly TechnicalTopic[]; difficulty: TechnicalDifficulty }>
> = {
  "pair-sum": { topics: ["arrays", "hashing"], difficulty: "easy" },
  "valid-delimiters": { topics: ["strings", "stack-queue"], difficulty: "easy" },
  "merge-ordered": { topics: ["arrays", "two-pointer"], difficulty: "easy" },
  "deduplicate-sorted": { topics: ["arrays", "two-pointer"], difficulty: "easy" },
  "maximum-trade-gain": { topics: ["arrays", "dynamic-programming"], difficulty: "medium" },
  "tree-depth": { topics: ["trees"], difficulty: "easy" },
  "invert-binary-tree": { topics: ["trees"], difficulty: "easy" },
  "first-unique": { topics: ["strings", "hashing"], difficulty: "easy" },
  "valid-anagram": { topics: ["strings", "hashing", "sorting"], difficulty: "easy" },
  "move-zeroes": { topics: ["arrays", "two-pointer"], difficulty: "easy" },
  "search-insert": { topics: ["arrays", "binary-search"], difficulty: "easy" },
  "climbing-steps": { topics: ["dynamic-programming", "math"], difficulty: "medium" },
  "flood-fill": { topics: ["graphs"], difficulty: "medium" },
  "reverse-values": { topics: ["arrays"], difficulty: "easy" },
  "normalized-palindrome": { topics: ["strings", "two-pointer"], difficulty: "easy" },
  "ransom-note": { topics: ["strings", "hashing"], difficulty: "easy" },
  "queue-operations": { topics: ["stack-queue"], difficulty: "easy" },
  "min-stack-operations": { topics: ["stack-queue", "greedy"], difficulty: "medium" },
  "missing-number": { topics: ["arrays", "math"], difficulty: "easy" },
  "contains-duplicate": { topics: ["arrays", "hashing"], difficulty: "easy" },
  "longest-unique-window": { topics: ["strings", "two-pointer", "hashing"], difficulty: "medium" },
  "merge-overlapping-windows": { topics: ["arrays", "sorting", "greedy"], difficulty: "medium" },
  "word-break-reachable": { topics: ["dynamic-programming", "strings"], difficulty: "hard" },
  "course-order": { topics: ["graphs", "sorting"], difficulty: "hard" },
  "median-of-two-sorted": { topics: ["binary-search", "arrays"], difficulty: "hard" },
};

/** Three private, problem-specific interview nudges: contract → approach → key invariant. */
const HINTS: Readonly<Record<string, readonly [string, string, string]>> = {
  "pair-sum": ["Start by stating what makes two indices valid: they must be different and their values must total the target.", "As you scan from left to right, ask what information about earlier values would let you recognize a matching current value immediately.", "Your key invariant is that every remembered value came from an earlier index, so a match can never reuse the current element."],
  "valid-delimiters": ["List the exact event that should make an opening delimiter stop being unmatched.", "Walk through a nested example one character at a time and describe what pending context must survive until a closing character appears.", "The key invariant is that each closing delimiter must match the most recent still-unmatched opening delimiter."],
  "merge-ordered": ["Name what is known about the first unconsumed value in each input list.", "Before writing code, explain how you would choose the next output value while both lists still have values.", "Keep the invariant that the output is ordered and contains exactly the consumed prefixes; then account for the unconsumed suffix."],
  "deduplicate-sorted": ["What useful relationship does sorting guarantee between a value and the value immediately before it?", "Describe the condition under which a value earns a place in the output rather than being skipped.", "Your invariant should make every output value distinct while preserving the first occurrence and sorted order."],
  "maximum-trade-gain": ["A sale can only use a purchase that happened earlier. What past fact matters most at each price?", "For every new price, compare the best sale ending here with the best result already seen.", "Maintain the lowest earlier price and the best gain seen so far; update both without allowing a later buy to support an earlier sale."],
  "tree-depth": ["Define the depth of the empty tree before considering a non-empty node.", "Explain how the answer for a node relates to the answers for its two children.", "Use a recurrence where each non-empty node contributes one level above its deeper child."],
  "invert-binary-tree": ["For one node, identify exactly which two parts change and which part stays the same.", "Describe how the same transformation applies to each child subtree.", "Build the result from mirrored child results; do not mutate one side before you have preserved the other."],
  "first-unique": ["A character is first unique only after you know whether it appears anywhere else.", "Separate the question of counting occurrences from the question of choosing the earliest qualifying position.", "Preserve original order for the final scan; a count alone cannot tell you which qualifying character appears first."],
  "valid-anagram": ["Before comparing, identify the quickest condition that makes two strings impossible to match.", "Explain how you will compare multiplicities rather than only whether characters appear.", "Your final comparison must account for every occurrence on both sides, including repeated characters."],
  "move-zeroes": ["State which relative order the output is required to preserve.", "Think of the result as a non-zero portion followed by enough zeroes to restore the original length.", "Keep the count of emitted values aligned with the input length; zeroes should never overtake non-zero values."],
  "search-insert": ["Describe the answer as the first position that is not smaller than the target.", "At each comparison, say which half can no longer contain that first valid position.", "Maintain bounds around the insertion point, including the empty-list and after-the-last-element cases."],
  "climbing-steps": ["Write out the number of ways for the first few step counts and look for what the final move implies.", "Explain which earlier totals can lead directly into a given step count.", "Only the two immediately preceding totals are needed to advance the recurrence, so preserve the base cases carefully."],
  "flood-fill": ["First define which cells belong to the region: matching color and connected by allowed moves.", "Describe how you will avoid visiting the same cell repeatedly while exploring neighboring positions.", "Mark or otherwise distinguish a cell when it is scheduled for exploration so the region cannot expand forever or cross its boundary."],
  "reverse-values": ["For an output position, identify which input position supplies its value.", "Walk through a three-value example and state the order in which values should be emitted.", "Ensure the empty and single-value inputs work without a special invalid index."],
  "normalized-palindrome": ["Clarify which characters participate in the comparison and how case affects them.", "Describe how you will compare matching positions from opposite ends while skipping irrelevant characters.", "Stop only after every participating pair agrees; the middle character of an odd-length normalized string needs no partner."],
  "ransom-note": ["A character used once cannot be used again. What resource does the larger string provide?", "Explain how each required character changes the available supply.", "Never let an availability count become negative; that is the precise point at which construction is impossible."],
  "queue-operations": ["For each operation, say whether it changes the collection, observes it, or contributes an output.", "Trace the public sequence and write down what order values should leave the collection.", "Preserve first-in-first-out order across every operation, and append results only for the operations that request one."],
  "min-stack-operations": ["Identify why knowing only the top value is insufficient for a minimum query after removals.", "For each push, describe what minimum information must remain available if that value is later removed.", "Keep the current minimum synchronized with stack depth so a pop restores the correct earlier minimum."],
  "missing-number": ["Compare the values that should exist in the full range with the values that are actually present.", "Find a way to combine the expected range and observed values so matched values cancel conceptually.", "Your running total must include the endpoint of the full range as well as every index/value pair."],
  "contains-duplicate": ["What fact about a value would prove it is a duplicate at the moment you encounter it?", "Describe what prior values you need to remember and when you should stop scanning.", "Maintain the invariant that remembered values are exactly the distinct values from the prefix already inspected."],
  "longest-unique-window": ["Consider a contiguous region with no repeated character. What makes it stop being valid?", "When a repeated character appears, explain how the left boundary should move without discarding a potentially longer later region.", "Track a valid window and its best length; after moving the left boundary, the repeated character must no longer occur twice inside it."],
  "merge-overlapping-windows": ["What ordering would make it possible to decide whether a new window can affect the current merged result?", "After establishing that order, compare each new start against the end of the current merged window.", "Maintain one active merged window: extend it when overlap continues, otherwise finalize it before beginning a new one."],
  "word-break-reachable": ["Define a smaller prefix question whose answer would help decide whether the full text is segmentable.", "For a prefix ending at a position, explain which earlier split points are worth checking.", "Use a reachability fact for prefixes: a prefix is reachable only when an earlier reachable prefix is followed by an allowed word."],
  "course-order": ["Translate each prerequisite pair into a direction: which course becomes available only after which other course?", "Describe how you would identify courses that currently have no unmet prerequisites and what changes when one is scheduled.", "A valid ordering processes every course; if progress stops before that, the remaining dependency cycle is the decisive signal."],
  "median-of-two-sorted": ["Start by defining what must be true of the values on the left and right sides of a valid median split.", "Use the fact that both inputs are ordered to adjust a split based on only its boundary values.", "Choose partitions whose left side has the required total size and whose largest left boundary does not exceed either right boundary."],
};

function javascriptStarterFromPython(starterCode: string): string {
  const match = /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/m.exec(starterCode);
  if (!match) throw new Error("Technical starter code must declare a Python function");
  return `function ${match[1]}(${match[2]}) {\n  // Write your solution here.\n}\n`;
}

function make(id: string, title: string, statement: string, starterCode: string, expectedComplexity: string, publicCases: Pair[], hiddenCases: Pair[], referenceSolution: string): TechnicalAssignmentPrivate {
  const testCases = (rows: Pair[], scope: string): TechnicalTestCase[] => rows.map(([input, expected], index) => ({ id: `${scope}-${index + 1}`, input, expected }));
  const publicTestCases = testCases(publicCases, "public");
  const tags = TAGS[id];
  const hintLadder = HINTS[id];
  if (!tags) throw new Error(`Technical assignment "${id}" has no topic/difficulty tag`);
  if (!hintLadder) throw new Error(`Technical assignment "${id}" has no hint ladder`);
  return { id, version: "2", topics: tags.topics, difficulty: tags.difficulty, contentHash: createHash("sha256").update(JSON.stringify({ id, title, statement, starterCode, expectedComplexity, topics: tags.topics, difficulty: tags.difficulty, hintLadder })).digest("hex"), title, statement, constraints: ["Use the documented function signature.", "Handle stated boundary cases."], examples: [{ input: "See visible tests.", output: "See expected result." }], starterCode, starterCodeByLanguage: { python: starterCode, javascript: javascriptStarterFromPython(starterCode) }, expectedComplexity, publicTests: publicTestCases.map(({ id, input, expected }, index) => ({ id, label: `Visible test ${index + 1}`, input, expected })), referenceSolution, hintLadder, publicTestCases, hiddenTests: testCases(hiddenCases, "hidden"), rubricAnchors: ANCHORS, executionLimits: { ...LIMITS } };
}

/** Original prompts, reference code and private tests. Never import in client code. */
export const TECHNICAL_ASSIGNMENTS: readonly TechnicalAssignmentPrivate[] = [
  make("pair-sum", "Pair Sum", "Return indices of two distinct numbers whose sum equals target, or an empty list.", "def pair_sum(numbers, target):\n    pass\n", "O(n) time, O(n) space", [p([[2,7,11,15],9],[0,1]),p([[3,2,4],6],[1,2])], [p([[3,3],6],[0,1]),p([[],0],[])], "def pair_sum(a,t):\n s={}\n for i,n in enumerate(a):\n  if t-n in s:return [s[t-n],i]\n  s[n]=i\n return []\n"),
  make("valid-delimiters", "Valid Delimiters", "Return whether delimiter characters are balanced and correctly nested.", "def valid_delimiters(text):\n    pass\n", "O(n) time, O(n) space", [p(["()[]{}"],true),p(["(]"],false)], [p(["([)]"],false),p([""],true)], "def valid_delimiters(t):\n p={')':'(',']':'[','}':'{'};s=[]\n for c in t:\n  if c in p:\n   if not s or s.pop()!=p[c]:return False\n  else:s.append(c)\n return not s\n"),
  make("merge-ordered", "Merge Ordered Values", "Merge two ascending lists, preserving duplicates.", "def merge_ordered(left, right):\n    pass\n", "O(n + m) time, O(n + m) space", [p([[1,3],[2,4]],[1,2,3,4]),p([[],[1]],[1])], [p([[1,1],[1]],[1,1,1]),p([[5],[]],[5])], "def merge_ordered(a,b):\n o=[];i=j=0\n while i<len(a) and j<len(b):\n  if a[i]<=b[j]:o.append(a[i]);i+=1\n  else:o.append(b[j]);j+=1\n return o+a[i:]+b[j:]\n"),
  make("deduplicate-sorted", "Deduplicate Sorted Values", "Return a sorted list with duplicate values removed.", "def deduplicate_sorted(values):\n    pass\n", "O(n) time, O(n) space", [p([[1,1,2,3,3]],[1,2,3]),p([[1]],[1])], [p([[]],[]),p([[-1,-1,0]],[-1,0])], "def deduplicate_sorted(a):\n return [v for i,v in enumerate(a) if i==0 or v!=a[i-1]]\n"),
  make("maximum-trade-gain", "Maximum Trade Gain", "Return the largest gain from buying and later selling once, or 0.", "def maximum_trade_gain(prices):\n    pass\n", "O(n) time, O(1) space", [p([[7,1,5,3,6,4]],5),p([[7,6,4,3,1]],0)], [p([[]],0),p([[2,4,1]],2)], "def maximum_trade_gain(a):\n lo=float('inf');best=0\n for p in a:lo=min(lo,p);best=max(best,p-lo)\n return best\n"),
  make("tree-depth", "Binary Tree Depth", "Return depth of a [value, left, right] tree; empty tree is None.", "def tree_depth(tree):\n    pass\n", "O(n) time, O(h) stack space", [p([[1,[2,null,null],[3,null,null]]],2),p([null],0)], [p([[1,[2,[3,null,null],null],null]],3)], "def tree_depth(t):\n return 0 if t is None else 1+max(tree_depth(t[1]),tree_depth(t[2]))\n"),
  make("invert-binary-tree", "Invert Binary Tree", "Return a mirrored copy of a [value, left, right] tree.", "def invert_tree(tree):\n    pass\n", "O(n) time, O(h) stack space", [p([[1,[2,null,null],[3,null,null]]],[1,[3,null,null],[2,null,null]]),p([null],null)], [p([[4,[2,null,null],[7,null,null]]],[4,[7,null,null],[2,null,null]])], "def invert_tree(t):\n return None if t is None else [t[0],invert_tree(t[2]),invert_tree(t[1])]\n"),
  make("first-unique", "First Unique Character", "Return the index of the first non-repeated character, or -1.", "def first_unique(text):\n    pass\n", "O(n) time, O(n) space", [p(["swiss"],1),p(["aabb"],-1)], [p(["leetcode"],0),p([""],-1)], "def first_unique(t):\n c={}\n for x in t:c[x]=c.get(x,0)+1\n return next((i for i,x in enumerate(t) if c[x]==1),-1)\n"),
  make("valid-anagram", "Valid Anagram", "Return whether two strings contain identical character counts.", "def valid_anagram(left, right):\n    pass\n", "O(n) time, O(n) space", [p(["listen","silent"],true),p(["rat","car"],false)], [p(["",""],true),p(["a","aa"],false)], "def valid_anagram(a,b):\n return sorted(a)==sorted(b)\n"),
  make("move-zeroes", "Move Zeroes", "Return a new list with zeroes at the end and non-zero order preserved.", "def move_zeroes(values):\n    pass\n", "O(n) time, O(n) space", [p([[0,1,0,3,12]],[1,3,12,0,0]),p([[0,0]],[0,0])], [p([[1,2]],[1,2]),p([[]],[])], "def move_zeroes(a):\n o=[x for x in a if x!=0]\n return o+[0]*(len(a)-len(o))\n"),
  make("search-insert", "Search Insert Position", "Return target's sorted-list index or its insertion position.", "def search_insert(values, target):\n    pass\n", "O(log n) time, O(1) space", [p([[1,3,5,6],5],2),p([[1,3,5,6],2],1)], [p([[1,3,5,6],7],4),p([[],1],0)], "def search_insert(a,t):\n lo,hi=0,len(a)\n while lo<hi:\n  m=(lo+hi)//2\n  if a[m]<t:lo=m+1\n  else:hi=m\n return lo\n"),
  make("climbing-steps", "Climbing Steps", "Return ways to reach n using one- or two-step moves.", "def climbing_steps(n):\n    pass\n", "O(n) time, O(1) space", [p([0],1),p([4],5)], [p([1],1),p([10],89)], "def climbing_steps(n):\n a=b=1\n for _ in range(n):a,b=b,a+b\n return a\n"),
  make("flood-fill", "Flood Fill", "Return a new grid with the connected region at row, col replaced.", "def flood_fill(grid, row, col, color):\n    pass\n", "O(rows × columns) time and space", [p([[[1,1],[1,0]],0,0,2],[[2,2],[2,0]])], [p([[[0]],0,0,0],[[0]])], "def flood_fill(g,r,c,x):\n o=[a[:] for a in g];old=o[r][c]\n if old==x:return o\n s=[(r,c)]\n while s:\n  i,j=s.pop()\n  if 0<=i<len(o) and 0<=j<len(o[0]) and o[i][j]==old:o[i][j]=x;s += [(i+1,j),(i-1,j),(i,j+1),(i,j-1)]\n return o\n"),
  make("reverse-values", "Reverse Values", "Return a new list containing values in reverse order.", "def reverse_values(values):\n    pass\n", "O(n) time, O(n) space", [p([[1,2,3]],[3,2,1]),p([[]],[])], [p([[1]],[1]),p([[-1,0]],[0,-1])], "def reverse_values(a):\n return a[::-1]\n"),
  make("normalized-palindrome", "Normalized Palindrome", "Return whether text reads identically after ignoring case and non-alphanumeric characters.", "def normalized_palindrome(text):\n    pass\n", "O(n) time, O(n) space", [p(["Never odd, or even."],true),p(["hello"],false)], [p([""],true),p(["A man, a plan, a canal: Panama"],true)], "def normalized_palindrome(t):\n a=[c.lower() for c in t if c.isalnum()]\n return a==a[::-1]\n"),
  make("ransom-note", "Ransom Note Check", "Return whether note can be assembled from magazine characters without reuse.", "def can_build_note(note, magazine):\n    pass\n", "O(n + m) time, O(n) space", [p(["cat","taco"],true),p(["aa","ab"],false)], [p(["","abc"],true),p(["abc","cab"],true)], "def can_build_note(a,b):\n c={}\n for x in b:c[x]=c.get(x,0)+1\n for x in a:\n  if c.get(x,0)==0:return False\n  c[x]-=1\n return True\n"),
  make("queue-operations", "Queue Operations", "Apply enqueue, dequeue, and peek operations; return dequeue/peek outputs.", "def queue_operations(operations):\n    pass\n", "Amortized O(1) per operation", [p([[["enqueue",1],["enqueue",2],["peek"],["dequeue"]]],[1,1])], [p([[["enqueue",3],["dequeue"],["enqueue",4],["peek"]]],[3,4])], "def queue_operations(ops):\n q=[];out=[]\n for op in ops:\n  if op[0]=='enqueue':q.append(op[1])\n  elif op[0]=='peek':out.append(q[0])\n  else:out.append(q.pop(0))\n return out\n"),
  make("min-stack-operations", "Minimum Stack Operations", "Apply push, pop, top, and get_min; return top/get_min outputs.", "def min_stack_operations(operations):\n    pass\n", "O(1) per operation", [p([[["push",-2],["push",0],["get_min"]]],[-2])], [p([[["push",2],["push",1],["top"],["get_min"],["pop"],["get_min"]]],[1,1,2])], "def min_stack_operations(ops):\n s=[];m=[];o=[]\n for x in ops:\n  if x[0]=='push':s.append(x[1]);m.append(x[1] if not m else min(x[1],m[-1]))\n  elif x[0]=='pop':s.pop();m.pop()\n  elif x[0]=='top':o.append(s[-1])\n  else:o.append(m[-1])\n return o\n"),
  make("missing-number", "Find Missing Number", "A list contains distinct numbers from 0 through n with one missing. Return it.", "def missing_number(values):\n    pass\n", "O(n) time, O(1) space", [p([[3,0,1]],2),p([[0,1]],2)], [p([[9,6,4,2,3,5,7,0,1]],8),p([[]],0)], "def missing_number(a):\n s=len(a)\n for i,x in enumerate(a):s+=i-x\n return s\n"),
  make("contains-duplicate", "Contains Duplicate", "Return whether any integer occurs more than once.", "def contains_duplicate(values):\n    pass\n", "O(n) time, O(n) space", [p([[1,2,3,1]],true),p([[1,2,3]],false)], [p([[]],false),p([[0,0]],true)], "def contains_duplicate(a):\n return len(a)!=len(set(a))\n"),
  make("longest-unique-window", "Longest Unique Window", "Return the length of the longest substring containing no repeated character.", "def longest_unique_window(text):\n    pass\n", "O(n) time, O(k) space where k is the alphabet size", [p(["abcabcbb"],3),p(["bbbbb"],1)], [p([""],0),p(["pwwkew"],3),p(["abcdef"],6)], "def longest_unique_window(t):\n seen={};best=0;lo=0\n for hi,c in enumerate(t):\n  if c in seen and seen[c]>=lo:lo=seen[c]+1\n  seen[c]=hi;best=max(best,hi-lo+1)\n return best\n"),
  make("merge-overlapping-windows", "Merge Overlapping Windows", "Given a list of [start, end] windows that may be unsorted and may overlap, return the merged windows in ascending order.", "def merge_overlapping_windows(windows):\n    pass\n", "O(n log n) time, O(n) space", [p([[[1,3],[2,6],[8,10]]],[[1,6],[8,10]]),p([[[1,4],[4,5]]],[[1,5]])], [p([[]],[]),p([[[5,6],[1,2]]],[[1,2],[5,6]]),p([[[1,10],[2,3]]],[[1,10]])], "def merge_overlapping_windows(w):\n o=[]\n for s,e in sorted(w):\n  if o and s<=o[-1][1]:o[-1][1]=max(o[-1][1],e)\n  else:o.append([s,e])\n return o\n"),
  make("word-break-reachable", "Word Break Reachable", "Return whether text can be segmented into a sequence of zero or more words from the given list. Words may be reused.", "def word_break_reachable(text, words):\n    pass\n", "O(n^2 * k) time, O(n) space", [p(["applepie",["apple","pie"]],true),p(["applepen",["apple","pear"]],false)], [p(["",["a"]],true),p(["aaaaaaa",["aaa","aaaa"]],true),p(["cars",["car","ca","rs"]],true)], "def word_break_reachable(t,w):\n s=set(w);n=len(t);ok=[False]*(n+1);ok[0]=True\n for i in range(1,n+1):\n  for j in range(i):\n   if ok[j] and t[j:i] in s:ok[i]=True;break\n return ok[n]\n"),
  make("course-order", "Course Order", "Given n courses labeled 0..n-1 and prerequisite pairs [a, b] meaning b must come before a, return any valid order, or an empty list if none exists.", "def course_order(n, prerequisites):\n    pass\n", "O(n + e) time, O(n + e) space", [p([2,[[1,0]]],[0,1]),p([2,[[1,0],[0,1]]],[])], [p([1,[]],[0]),p([3,[[1,0],[2,1]]],[0,1,2]),p([3,[[0,1],[1,2],[2,0]]],[])], "def course_order(n,pre):\n adj=[[] for _ in range(n)];deg=[0]*n\n for a,b in pre:adj[b].append(a);deg[a]+=1\n q=[i for i in range(n) if deg[i]==0];o=[]\n while q:\n  x=q.pop(0);o.append(x)\n  for y in adj[x]:\n   deg[y]-=1\n   if deg[y]==0:q.append(y)\n return o if len(o)==n else []\n"),
  make("median-of-two-sorted", "Median of Two Sorted Lists", "Return the median of two ascending lists as a float, considering all values from both lists together.", "def median_of_two_sorted(left, right):\n    pass\n", "O(log(min(n, m))) time, O(1) space", [p([[1,3],[2]],2.0),p([[1,2],[3,4]],2.5)], [p([[],[1]],1.0),p([[0,0],[0,0]],0.0),p([[1,2,3,4,5],[6]],3.5)], "def median_of_two_sorted(a,b):\n m=sorted(a+b);n=len(m)\n return float(m[n//2]) if n%2 else (m[n//2-1]+m[n//2])/2\n"),
];

export function getTechnicalAssignment(id: string): TechnicalAssignmentPrivate | null { return TECHNICAL_ASSIGNMENTS.find((assignment) => assignment.id === id) ?? null; }
export function listPublicTechnicalAssignments(): TechnicalAssignmentPublic[] { return TECHNICAL_ASSIGNMENTS.map(toPublicTechnicalAssignment); }
