import type { PostSessionMaterial } from "../post-session.server";

/**
 * Post-session material for the array, hashing and binary-search problems.
 * Server-only: see `post-session.server.ts`. Each model solution keeps the
 * exact entry name and parameters of the problem's starter code, because the
 * verify script runs it through the same harness the browser uses.
 */
export const ARRAY_MATERIAL: Readonly<Record<string, PostSessionMaterial>> = {
  "pair-sum": {
    approach: [
      "The brute-force answer checks every pair of indices and returns the first pair whose values add up to the target. It is easy to get right, but with n values that is about n²/2 checks.",
      "The insight is to flip the question. When you stand on a value, you already know exactly which partner you need: target minus the current value. So the real question is \"have I already seen that partner, and where?\"",
      "A dictionary (hash map) from value to index answers that in constant time. Scan once from left to right; for each value, look up its partner first, and only then remember the current value. Looking up before inserting is what stops a value from pairing with itself.",
      "Strong candidates also say out loud what happens with duplicates such as [3, 3] and with no answer at all, and confirm that the returned indices come out in ascending order.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the map of values already seen.",
    pitfalls: [
      "Inserting the current value before looking up its partner, which lets a value pair with itself (for example 3 + 3 = 6 with only one 3).",
      "Sorting the list to use two pointers, which loses the original indices the problem asks for.",
      "Forgetting to return an empty list when no pair exists, so the function returns None or undefined.",
    ],
    modelSolutions: {
      python: String.raw`def pair_sum(numbers, target):
    # Map each value we have already passed to the index where we saw it.
    index_by_value = {}

    for index, value in enumerate(numbers):
        partner = target - value
        # Only earlier values are in the map, so a value never pairs with itself.
        if partner in index_by_value:
            return [index_by_value[partner], index]
        index_by_value[value] = index

    # No two values add up to the target.
    return []
`,
      javascript: String.raw`function pair_sum(numbers, target) {
  // Map each value we have already passed to the index where we saw it.
  const indexByValue = new Map();

  for (let index = 0; index < numbers.length; index += 1) {
    const partner = target - numbers[index];
    // Only earlier values are in the map, so a value never pairs with itself.
    if (indexByValue.has(partner)) {
      return [indexByValue.get(partner), index];
    }
    indexByValue.set(numbers[index], index);
  }

  // No two values add up to the target.
  return [];
}
`,
    },
  },

  "merge-ordered": {
    approach: [
      "The simplest idea is to concatenate both lists and sort the result. It works, but it throws away the fact that each list is already sorted and costs O((n + m) log(n + m)).",
      "The insight: the smallest value not yet placed must be at the front of one of the two lists. Nothing deeper in either list can be smaller, because each list is ascending.",
      "So keep one pointer into each list. While both lists still have values, compare the two front values, copy the smaller one to the output, and advance that pointer. When one list runs out, everything left in the other is already in order and can be copied as is.",
      "Taking from the left list on ties (<= rather than <) keeps the merge stable and handles duplicates naturally.",
    ].join("\n\n"),
    complexity: "O(n + m) time, O(n + m) space for the merged output.",
    pitfalls: [
      "Forgetting to copy the leftover values after one list runs out.",
      "Using < instead of <= and then mishandling equal values, or dropping duplicates by accident.",
      "Calling a built-in sort, which hides the two-pointer reasoning the interviewer wants to hear.",
    ],
    modelSolutions: {
      python: String.raw`def merge_ordered(left, right):
    merged = []
    left_index = 0
    right_index = 0

    # While both lists have values, take the smaller front value.
    while left_index < len(left) and right_index < len(right):
        if left[left_index] <= right[right_index]:
            merged.append(left[left_index])
            left_index += 1
        else:
            merged.append(right[right_index])
            right_index += 1

    # One list is exhausted; the rest of the other is already sorted.
    merged.extend(left[left_index:])
    merged.extend(right[right_index:])
    return merged
`,
      javascript: String.raw`function merge_ordered(left, right) {
  const merged = [];
  let leftIndex = 0;
  let rightIndex = 0;

  // While both lists have values, take the smaller front value.
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] <= right[rightIndex]) {
      merged.push(left[leftIndex]);
      leftIndex += 1;
    } else {
      merged.push(right[rightIndex]);
      rightIndex += 1;
    }
  }

  // One list is exhausted; the rest of the other is already sorted.
  return merged.concat(left.slice(leftIndex), right.slice(rightIndex));
}
`,
    },
  },

  "deduplicate-sorted": {
    approach: [
      "A general way to remove duplicates is to put every value into a set. That works for any list, but a set does not keep order, and you would need to sort again afterwards.",
      "The insight is that sorting puts equal values next to each other. A value is a duplicate exactly when it equals the value right before it, so you never need to remember more than the previous value.",
      "Walk through the list once and keep a value only if it is the first element or differs from the previous element. The output stays sorted because you never reorder anything.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the output list.",
    pitfalls: [
      "Comparing each value with the next one without a bounds check, which reads past the end of the list.",
      "Using a set and returning its contents, which may come back in a different order.",
      "Forgetting the empty list, where there is no first element to compare.",
    ],
    modelSolutions: {
      python: String.raw`def deduplicate_sorted(values):
    unique_values = []

    for index, value in enumerate(values):
        # Sorted input puts equal values side by side, so a value is new
        # exactly when it differs from the one just before it.
        if index == 0 or value != values[index - 1]:
            unique_values.append(value)

    return unique_values
`,
      javascript: String.raw`function deduplicate_sorted(values) {
  const uniqueValues = [];

  for (let index = 0; index < values.length; index += 1) {
    // Sorted input puts equal values side by side, so a value is new
    // exactly when it differs from the one just before it.
    if (index === 0 || values[index] !== values[index - 1]) {
      uniqueValues.push(values[index]);
    }
  }

  return uniqueValues;
}
`,
    },
  },

  "maximum-trade-gain": {
    approach: [
      "The brute-force approach tries every buy day and every later sell day and keeps the best difference. That is O(n²) comparisons.",
      "The insight: for a sale on a given day, the only purchase that matters is the cheapest price on any earlier day. You do not need to remember all earlier prices, just their minimum.",
      "So scan once. At each price, first ask \"what would I gain if I sold today, having bought at the lowest price so far?\" and update the best gain. Then update the lowest price so far. Starting the best gain at 0 covers the case where prices only fall.",
      "This is a tiny dynamic program: the state is (lowest price so far, best gain so far), and each day updates it in constant time.",
    ].join("\n\n"),
    complexity: "O(n) time, O(1) space.",
    pitfalls: [
      "Subtracting the global minimum from the global maximum, which ignores that the purchase must come before the sale.",
      "Returning a negative number when prices only fall instead of 0.",
      "Crashing on an empty list by reading prices[0] without a check.",
    ],
    modelSolutions: {
      python: String.raw`def maximum_trade_gain(prices):
    lowest_price_so_far = float("inf")
    best_gain = 0  # Not trading is always allowed, so 0 is the floor.

    for price in prices:
        # Best sale today uses the cheapest earlier (or same-day) purchase.
        best_gain = max(best_gain, price - lowest_price_so_far)
        lowest_price_so_far = min(lowest_price_so_far, price)

    return best_gain
`,
      javascript: String.raw`function maximum_trade_gain(prices) {
  let lowestPriceSoFar = Infinity;
  let bestGain = 0; // Not trading is always allowed, so 0 is the floor.

  for (const price of prices) {
    // Best sale today uses the cheapest earlier (or same-day) purchase.
    bestGain = Math.max(bestGain, price - lowestPriceSoFar);
    lowestPriceSoFar = Math.min(lowestPriceSoFar, price);
  }

  return bestGain;
}
`,
    },
  },

  "move-zeroes": {
    approach: [
      "One brute-force idea is to repeatedly find a zero and shift everything after it one place left, which costs O(n²) on a list full of zeroes.",
      "The insight is to describe the answer instead of the moves: it is every non-zero value in its original order, followed by as many zeroes as were removed.",
      "Build that directly in one pass: copy each non-zero value into the output, count the zeroes, then append that many zeroes. The output has the same length as the input by construction.",
      "If the interviewer asks for an in-place version, the same idea becomes a write pointer: copy each non-zero value to the write position, then fill the tail with zeroes.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the new list.",
    pitfalls: [
      "Sorting the list, which moves zeroes but destroys the order of the other values.",
      "Removing items from a list while iterating over it, which skips elements.",
      "Modifying the input list when the problem asks for a new one.",
    ],
    modelSolutions: {
      python: String.raw`def move_zeroes(values):
    # Keep non-zero values in their original order.
    non_zero_values = [value for value in values if value != 0]
    # Pad with exactly as many zeroes as were removed.
    zero_count = len(values) - len(non_zero_values)
    return non_zero_values + [0] * zero_count
`,
      javascript: String.raw`function move_zeroes(values) {
  // Keep non-zero values in their original order.
  const nonZeroValues = values.filter((value) => value !== 0);
  // Pad with exactly as many zeroes as were removed.
  const zeroCount = values.length - nonZeroValues.length;
  return nonZeroValues.concat(new Array(zeroCount).fill(0));
}
`,
    },
  },

  "search-insert": {
    approach: [
      "The straightforward answer scans from the left and returns the first index whose value is at least the target, or the length of the list if there is none. That is correct but O(n).",
      "The insight is that the answer is a boundary: every value before it is smaller than the target, and every value from it onwards is not. A sorted list lets you find such a boundary with binary search.",
      "Keep a half-open range [low, high) that always contains the answer, starting with [0, len(values)]. Look at the middle. If the middle value is smaller than the target, the answer is to its right, so move low past it. Otherwise the middle could be the answer, so move high to it. Stop when low equals high.",
      "Using len(values) as the starting high is what makes \"insert after the last element\" and the empty list fall out naturally.",
    ].join("\n\n"),
    complexity: "O(log n) time, O(1) space.",
    pitfalls: [
      "Starting high at len(values) - 1, which can never return the past-the-end position.",
      "Mixing closed and half-open bounds, which causes an infinite loop or an off-by-one result.",
      "Returning -1 when the target is missing instead of the insertion index.",
    ],
    modelSolutions: {
      python: String.raw`def search_insert(values, target):
    # The answer always lies in the half-open range [low, high).
    low, high = 0, len(values)

    while low < high:
        middle = (low + high) // 2
        if values[middle] < target:
            # Everything up to middle is too small.
            low = middle + 1
        else:
            # middle might be the first position that is >= target.
            high = middle

    return low
`,
      javascript: String.raw`function search_insert(values, target) {
  // The answer always lies in the half-open range [low, high).
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) {
      // Everything up to middle is too small.
      low = middle + 1;
    } else {
      // middle might be the first position that is >= target.
      high = middle;
    }
  }

  return low;
}
`,
    },
  },

  "reverse-values": {
    approach: [
      "Reversing is simple, so the interview signal is in how cleanly you state the index mapping and handle the edges.",
      "Output position i takes its value from input position n - 1 - i. Walking the input from the last index down to 0 and appending each value builds the reversed list in one pass.",
      "A built-in reverse or slice is fine in real code, but in an interview say what it does and what it costs, and show you could write the loop. Check the empty and single-value lists out loud.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the new list.",
    pitfalls: [
      "An off-by-one that starts at index n instead of n - 1, or stops before index 0.",
      "Reversing the input in place when a new list is required.",
      "Swapping in place and running the loop to n instead of n / 2, which reverses the list twice and returns it unchanged.",
    ],
    modelSolutions: {
      python: String.raw`def reverse_values(values):
    reversed_values = []

    # Walk from the last index down to 0.
    for index in range(len(values) - 1, -1, -1):
        reversed_values.append(values[index])

    return reversed_values
`,
      javascript: String.raw`function reverse_values(values) {
  const reversedValues = [];

  // Walk from the last index down to 0.
  for (let index = values.length - 1; index >= 0; index -= 1) {
    reversedValues.push(values[index]);
  }

  return reversedValues;
}
`,
    },
  },

  "missing-number": {
    approach: [
      "A brute-force answer checks each number from 0 to n and asks whether it is in the list, which is O(n²) with a list lookup. Sorting first and finding the gap is O(n log n).",
      "Using a set makes each lookup constant, giving O(n) time, but it needs O(n) extra space.",
      "The insight is arithmetic: you know exactly which numbers should be there, 0 through n, and their sum is n(n + 1) / 2. Subtract the sum of the values you were given, and what remains is the missing number.",
      "Here n is the length of the list, because n + 1 numbers were possible and one is missing. XOR of every index and value is an equally good constant-space alternative that some interviewers prefer because it cannot overflow.",
    ].join("\n\n"),
    complexity: "O(n) time, O(1) space.",
    pitfalls: [
      "Using the largest value in the list as n, which fails when n itself is the missing number.",
      "Assuming the list is sorted and looking for the first index where values[i] != i without sorting.",
      "Forgetting the empty list, where the missing number is 0.",
    ],
    modelSolutions: {
      python: String.raw`def missing_number(values):
    # The full range is 0..n, where n is the list length.
    n = len(values)
    expected_sum = n * (n + 1) // 2
    # Every present value cancels out; only the missing one is left.
    return expected_sum - sum(values)
`,
      javascript: String.raw`function missing_number(values) {
  // The full range is 0..n, where n is the list length.
  const n = values.length;
  const expectedSum = (n * (n + 1)) / 2;
  // Every present value cancels out; only the missing one is left.
  let actualSum = 0;
  for (const value of values) actualSum += value;
  return expectedSum - actualSum;
}
`,
    },
  },

  "contains-duplicate": {
    approach: [
      "Comparing every pair of values finds a duplicate in O(n²). Sorting first brings equal values together, so a single scan of neighbours works in O(n log n).",
      "The insight is that a duplicate is proven the moment you meet a value you have already seen. A set answers \"have I seen this?\" in constant time.",
      "Scan once, check the set before adding each value, and return true immediately on a repeat. If the scan finishes, every value was distinct, so return false.",
    ].join("\n\n"),
    complexity: "O(n) time, O(n) space for the set.",
    pitfalls: [
      "Adding the value to the set before checking it, which makes every value look like a duplicate.",
      "Using a list instead of a set for the seen values, which quietly makes the solution O(n²).",
      "Returning false inside the loop on the first non-duplicate instead of after the whole scan.",
    ],
    modelSolutions: {
      python: String.raw`def contains_duplicate(values):
    seen_values = set()

    for value in values:
        # A repeat is proven the moment we meet a value we have seen.
        if value in seen_values:
            return True
        seen_values.add(value)

    return False
`,
      javascript: String.raw`function contains_duplicate(values) {
  const seenValues = new Set();

  for (const value of values) {
    // A repeat is proven the moment we meet a value we have seen.
    if (seenValues.has(value)) return true;
    seenValues.add(value);
  }

  return false;
}
`,
    },
  },
};
