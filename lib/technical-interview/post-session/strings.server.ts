import type { PostSessionMaterial } from "../post-session.server";

/**
 * Post-session material for the string, counting, stack and queue problems.
 * Server-only: see `post-session.server.ts`.
 */
export const STRING_MATERIAL: Readonly<Record<string, PostSessionMaterial>> = {
  "valid-delimiters": {
    approach: [
      "A tempting first idea is to count each kind of delimiter and check that opens equal closes. That accepts \"([)]\", which has the right counts but the wrong nesting, so counting alone is not enough.",
      "The insight is that a closing delimiter must match the most recent opening delimiter that is still unmatched. \"Most recent first\" is exactly what a stack gives you.",
      "Scan the text once. Push every opening delimiter. On a closing delimiter, the stack must be non-empty and its top must be the matching opener; pop it, or return false. At the end, the text is balanced only if the stack is empty, meaning nothing was left open.",
      "A small map from each closer to its opener keeps the matching logic to one line and makes adding a new delimiter type trivial.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the stack in the worst case (all openers).",
    pitfalls: [
      "Counting delimiters instead of checking order, which accepts crossed pairs like \"([)]\".",
      "Popping from an empty stack when the text starts with a closer.",
      "Returning true at the end without checking that the stack is empty, which accepts \"((\".",
    ],
    modelSolutions: {
      python: String.raw`def valid_delimiters(text):
    opener_for = {")": "(", "]": "[", "}": "{"}
    still_open = []  # Stack of openers waiting for their closer.

    for character in text:
        if character in opener_for:
            # A closer must match the most recent unmatched opener.
            if not still_open or still_open.pop() != opener_for[character]:
                return False
        elif character in "([{":
            still_open.append(character)

    # Anything left open means the text is unbalanced.
    return not still_open
`,
      javascript: String.raw`function valid_delimiters(text) {
  const openerFor = { ")": "(", "]": "[", "}": "{" };
  const stillOpen = []; // Stack of openers waiting for their closer.

  for (const character of text) {
    if (character in openerFor) {
      // A closer must match the most recent unmatched opener.
      if (stillOpen.length === 0 || stillOpen.pop() !== openerFor[character]) {
        return false;
      }
    } else if ("([{".includes(character)) {
      stillOpen.push(character);
    }
  }

  // Anything left open means the text is unbalanced.
  return stillOpen.length === 0;
}
`,
    },
  },

  "first-unique": {
    approach: [
      "The brute-force answer takes each character in turn and scans the whole string to see whether it appears anywhere else. That is O(n²).",
      "The insight is to separate two questions: \"how many times does each character appear?\" and \"which qualifying character comes first?\" Neither question needs the other's work repeated.",
      "First pass: count every character with a dictionary. Second pass: walk the string in its original order and return the first index whose character has a count of 1. If none does, return -1.",
      "The second pass has to walk the string, not the dictionary, because the string is what defines \"first\".",
    ].join("\n\n"),
    complexity: "O(n) time, O(k) space where k is the number of distinct characters (at most n).",
    pitfalls: [
      "Returning a character instead of its index.",
      "Scanning the count dictionary for the first count of 1 and assuming it preserves string order.",
      "Treating \"a\" and \"A\" as the same character when the problem is case-sensitive.",
    ],
    modelSolutions: {
      python: String.raw`def first_unique(text):
    # Pass 1: how many times does each character appear?
    count_by_character = {}
    for character in text:
        count_by_character[character] = count_by_character.get(character, 0) + 1

    # Pass 2: the first character, in original order, that appears once.
    for index, character in enumerate(text):
        if count_by_character[character] == 1:
            return index

    return -1
`,
      javascript: String.raw`function first_unique(text) {
  // Pass 1: how many times does each character appear?
  const countByCharacter = new Map();
  for (const character of text) {
    countByCharacter.set(character, (countByCharacter.get(character) ?? 0) + 1);
  }

  // Pass 2: the first character, in original order, that appears once.
  for (let index = 0; index < text.length; index += 1) {
    if (countByCharacter.get(text[index]) === 1) return index;
  }

  return -1;
}
`,
    },
  },

  "valid-anagram": {
    approach: [
      "One correct answer sorts both strings and compares them. It is short, but sorting costs O(n log n), which misses the O(n) target.",
      "The insight is that two strings are anagrams exactly when every character appears the same number of times in each. Counting is linear.",
      "Check the lengths first: different lengths can never match, and the check is free. Then count the characters of the first string, and walk the second string decrementing those counts. If a character's count is already zero when you need it, the strings differ. Because the lengths match, reaching the end without a failure means every count is back to zero.",
    ].join("\n\n"),
    complexity: "O(n) time, O(k) space where k is the number of distinct characters.",
    pitfalls: [
      "Comparing sets of characters, which ignores multiplicity and calls \"a\" and \"aa\" anagrams.",
      "Skipping the length check and then forgetting to confirm every count returned to zero.",
      "Sorting and calling it O(n).",
    ],
    modelSolutions: {
      python: String.raw`def valid_anagram(left, right):
    # Different lengths can never be anagrams.
    if len(left) != len(right):
        return False

    remaining = {}
    for character in left:
        remaining[character] = remaining.get(character, 0) + 1

    for character in right:
        # right needs a character that left has run out of.
        if remaining.get(character, 0) == 0:
            return False
        remaining[character] -= 1

    # Equal lengths and no shortfall mean every count is back to zero.
    return True
`,
      javascript: String.raw`function valid_anagram(left, right) {
  // Different lengths can never be anagrams.
  if (left.length !== right.length) return false;

  const remaining = new Map();
  for (const character of left) {
    remaining.set(character, (remaining.get(character) ?? 0) + 1);
  }

  for (const character of right) {
    // right needs a character that left has run out of.
    const available = remaining.get(character) ?? 0;
    if (available === 0) return false;
    remaining.set(character, available - 1);
  }

  // Equal lengths and no shortfall mean every count is back to zero.
  return true;
}
`,
    },
  },

  "normalized-palindrome": {
    approach: [
      "The direct approach builds a cleaned string of lowercase letters and digits, then compares it with its reverse. It is clear and linear, and it meets the O(n) space target.",
      "A strong candidate also mentions the two-pointer version, which avoids building the cleaned copy. Put one pointer at each end. Move each pointer inward past anything that is not a letter or digit, compare the two characters case-insensitively, and stop at the first mismatch.",
      "When the pointers meet or cross, every participating pair has matched, so the text is a palindrome. A middle character in an odd-length string has no partner and needs no check.",
      "Say out loud what counts as a character to compare, and confirm that an empty or all-punctuation string is a palindrome.",
    ].join("\n\n"),
    complexity: "O(n) time; O(n) space for the cleaned copy, or O(1) extra space with two pointers.",
    pitfalls: [
      "Forgetting to lowercase, so \"A\" and \"a\" do not match.",
      "Skipping punctuation on one side but not the other, which misaligns the pointers.",
      "Letting a skip loop run past the other pointer or off the end of the string.",
    ],
    modelSolutions: {
      python: String.raw`def normalized_palindrome(text):
    left = 0
    right = len(text) - 1

    while left < right:
        # Skip anything that is not a letter or digit, on each side.
        if not text[left].isalnum():
            left += 1
        elif not text[right].isalnum():
            right -= 1
        elif text[left].lower() != text[right].lower():
            return False
        else:
            # This pair matches; move both pointers inward.
            left += 1
            right -= 1

    return True
`,
      javascript: String.raw`function normalized_palindrome(text) {
  const isLetterOrDigit = (character) => /[\p{L}\p{N}]/u.test(character);
  let left = 0;
  let right = text.length - 1;

  while (left < right) {
    // Skip anything that is not a letter or digit, on each side.
    if (!isLetterOrDigit(text[left])) {
      left += 1;
    } else if (!isLetterOrDigit(text[right])) {
      right -= 1;
    } else if (text[left].toLowerCase() !== text[right].toLowerCase()) {
      return false;
    } else {
      // This pair matches; move both pointers inward.
      left += 1;
      right -= 1;
    }
  }

  return true;
}
`,
    },
  },

  "ransom-note": {
    approach: [
      "A brute-force approach finds each note character in the magazine and deletes it, which costs O(n · m) because each search and delete is linear.",
      "The insight is that the magazine is a supply of characters and the note is a demand. Only the count of each character matters, not where it sits.",
      "Count the magazine's characters once. Then walk the note and spend one unit of supply per character. The moment a character has no supply left, the note cannot be built. If you finish the note, it can.",
    ].join("\n\n"),
    complexity: "O(n + m) time, O(k) space where k is the number of distinct magazine characters.",
    pitfalls: [
      "Checking only that each note character appears somewhere in the magazine, ignoring how many times it is needed.",
      "Counting the note instead of the magazine and then comparing in the wrong direction.",
      "Letting a count go negative and only checking at the end, which still works but hides the early exit.",
    ],
    modelSolutions: {
      python: String.raw`def can_build_note(note, magazine):
    # How many of each character the magazine can supply.
    supply = {}
    for character in magazine:
        supply[character] = supply.get(character, 0) + 1

    for character in note:
        # No copies left: the note cannot be assembled.
        if supply.get(character, 0) == 0:
            return False
        supply[character] -= 1

    return True
`,
      javascript: String.raw`function can_build_note(note, magazine) {
  // How many of each character the magazine can supply.
  const supply = new Map();
  for (const character of magazine) {
    supply.set(character, (supply.get(character) ?? 0) + 1);
  }

  for (const character of note) {
    const available = supply.get(character) ?? 0;
    // No copies left: the note cannot be assembled.
    if (available === 0) return false;
    supply.set(character, available - 1);
  }

  return true;
}
`,
    },
  },

  "longest-unique-window": {
    approach: [
      "The brute-force answer checks every substring and asks whether it has a repeated character. There are O(n²) substrings, and checking each is up to O(n) more.",
      "The insight is a sliding window. Keep a window [start, end] that never contains a repeat. Extend it one character at a time on the right. When the new character already appears inside the window, the window is no longer valid, and the only fix is to move start just past that earlier copy.",
      "To make that jump in constant time, remember the last index where each character appeared. When you see a character whose last index is inside the current window (at or after start), set start to that index plus one. Then record the new index and update the best length, end - start + 1.",
      "The left edge only ever moves right, so each character enters and leaves the window at most once, and the whole scan is linear.",
    ].join("\n\n"),
    complexity: "O(n) time, O(k) space where k is the alphabet size.",
    pitfalls: [
      "Moving start back to an earlier position when the repeated character's last index is before the current window; start must never move left.",
      "Resetting the window to empty on every repeat, which discards valid characters and gives too small an answer.",
      "Counting a subsequence instead of a contiguous substring.",
    ],
    modelSolutions: {
      python: String.raw`def longest_unique_window(text):
    last_index_of = {}  # Most recent index of each character.
    window_start = 0
    longest = 0

    for window_end, character in enumerate(text):
        # A repeat inside the window: move the start just past its earlier copy.
        if character in last_index_of and last_index_of[character] >= window_start:
            window_start = last_index_of[character] + 1
        last_index_of[character] = window_end
        longest = max(longest, window_end - window_start + 1)

    return longest
`,
      javascript: String.raw`function longest_unique_window(text) {
  const lastIndexOf = new Map(); // Most recent index of each character.
  let windowStart = 0;
  let longest = 0;

  for (let windowEnd = 0; windowEnd < text.length; windowEnd += 1) {
    const character = text[windowEnd];
    // A repeat inside the window: move the start just past its earlier copy.
    if (lastIndexOf.has(character) && lastIndexOf.get(character) >= windowStart) {
      windowStart = lastIndexOf.get(character) + 1;
    }
    lastIndexOf.set(character, windowEnd);
    longest = Math.max(longest, windowEnd - windowStart + 1);
  }

  return longest;
}
`,
    },
  },

  "queue-operations": {
    approach: [
      "A queue is first in, first out: values leave in the order they arrived. The problem is really about choosing a structure where both ends are cheap.",
      "The obvious choice in many languages is a plain list with \"remove the first element\". That is correct, but removing from the front of an array shifts every other element, so each dequeue costs O(n).",
      "In Python, collections.deque supports constant-time appends on the right and pops on the left. In JavaScript, a common pattern is to keep an array plus a head index: enqueue pushes to the end, dequeue reads at the head and advances it, and peek reads at the head without advancing.",
      "Then the operations themselves are simple: enqueue changes the queue and produces nothing; dequeue and peek each produce one output value, in order.",
    ].join("\n\n"),
    complexity: "Amortized O(1) per operation; O(n) space for the stored values.",
    pitfalls: [
      "Using list.pop(0) or Array.shift() and calling it O(1); both shift every remaining element.",
      "Appending an output for enqueue operations, which should produce nothing.",
      "Making peek remove the value, or making dequeue forget to record it.",
    ],
    modelSolutions: {
      python: String.raw`from collections import deque


def queue_operations(operations):
    queue = deque()  # O(1) append on the right, O(1) pop on the left.
    outputs = []

    for operation in operations:
        name = operation[0]
        if name == "enqueue":
            queue.append(operation[1])
        elif name == "dequeue":
            outputs.append(queue.popleft())
        elif name == "peek":
            outputs.append(queue[0])

    return outputs
`,
      javascript: String.raw`function queue_operations(operations) {
  // An array plus a head index: dequeue just advances the head, so it is O(1).
  const stored = [];
  let head = 0;
  const outputs = [];

  for (const operation of operations) {
    const name = operation[0];
    if (name === "enqueue") {
      stored.push(operation[1]);
    } else if (name === "dequeue") {
      outputs.push(stored[head]);
      head += 1;
    } else if (name === "peek") {
      outputs.push(stored[head]);
    }
  }

  return outputs;
}
`,
    },
  },

  "min-stack-operations": {
    approach: [
      "Answering get_min by scanning the whole stack works, but it costs O(n) per query, and the target is O(1) for every operation.",
      "Keeping a single \"current minimum\" variable is not enough either: after you pop the minimum, you have no idea what the previous minimum was.",
      "The insight is to remember the minimum at every depth. Each time you push a value, also record the minimum of the stack as it stands after the push, which is the smaller of the new value and the previous minimum. Store the pair together, or keep a second stack in lockstep.",
      "Now pop removes both the value and its minimum, which automatically restores the earlier minimum. top reads the value on top, and get_min reads the minimum on top, both in constant time.",
    ].join("\n\n"),
    complexity: "O(1) time per operation, O(n) space.",
    pitfalls: [
      "Tracking only one minimum variable, which becomes wrong after the minimum is popped.",
      "Pushing to the minimum stack only when a new minimum arrives, then popping it unconditionally, so the two stacks drift apart.",
      "Producing output for push or pop, which should produce nothing.",
    ],
    modelSolutions: {
      python: String.raw`def min_stack_operations(operations):
    # Each entry is (value, minimum of the stack at this depth).
    stack = []
    outputs = []

    for operation in operations:
        name = operation[0]
        if name == "push":
            value = operation[1]
            minimum_here = value if not stack else min(value, stack[-1][1])
            stack.append((value, minimum_here))
        elif name == "pop":
            # Removing the pair restores the previous minimum automatically.
            stack.pop()
        elif name == "top":
            outputs.append(stack[-1][0])
        elif name == "get_min":
            outputs.append(stack[-1][1])

    return outputs
`,
      javascript: String.raw`function min_stack_operations(operations) {
  // Each entry is [value, minimum of the stack at this depth].
  const stack = [];
  const outputs = [];

  for (const operation of operations) {
    const name = operation[0];
    if (name === "push") {
      const value = operation[1];
      const minimumHere = stack.length === 0 ? value : Math.min(value, stack[stack.length - 1][1]);
      stack.push([value, minimumHere]);
    } else if (name === "pop") {
      // Removing the pair restores the previous minimum automatically.
      stack.pop();
    } else if (name === "top") {
      outputs.push(stack[stack.length - 1][0]);
    } else if (name === "get_min") {
      outputs.push(stack[stack.length - 1][1]);
    }
  }

  return outputs;
}
`,
    },
  },
};
