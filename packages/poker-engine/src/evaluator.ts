import { type Card, RANK_VALUES } from "./cards.js";

export const HAND_CATEGORIES = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush"
] as const;

export type HandCategory = (typeof HAND_CATEGORIES)[number];

export type HandRank = Readonly<{
  category: HandCategory;
  categoryValue: number;
  ranks: readonly number[];
}>;

export function compareHandRanks(left: HandRank, right: HandRank): number {
  if (left.categoryValue !== right.categoryValue) {
    return left.categoryValue - right.categoryValue;
  }

  const maxLength = Math.max(left.ranks.length, right.ranks.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftRank = left.ranks[index] ?? 0;
    const rightRank = right.ranks[index] ?? 0;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
  }

  return 0;
}

export function evaluateTexasHoldem(cards: readonly Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error("Texas Hold'em evaluation requires 5 to 7 cards");
  }

  let bestRank: HandRank | null = null;

  for (const combination of fiveCardCombinations(cards)) {
    const rank = evaluateFiveCards(combination);

    if (bestRank === null || compareHandRanks(rank, bestRank) > 0) {
      bestRank = rank;
    }
  }

  if (bestRank === null) {
    throw new Error("Unable to evaluate hand");
  }

  return bestRank;
}

function evaluateFiveCards(cards: readonly Card[]): HandRank {
  const values = cards
    .map((card) => RANK_VALUES[card.rank])
    .sort((left, right) => right - left);
  const valueCounts = countValues(values);
  const groups = [...valueCounts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return right.value - left.value;
    });

  const isFlush = cards.every((card) => card.suit === cards[0]?.suit);
  const straightHighCard = getStraightHighCard(values);

  if (isFlush && straightHighCard !== null) {
    return handRank("straight-flush", [straightHighCard]);
  }

  const fourOfAKind = groups.find((group) => group.count === 4);

  if (fourOfAKind !== undefined) {
    return handRank("four-of-a-kind", [
      fourOfAKind.value,
      highestExcept(values, [fourOfAKind.value])
    ]);
  }

  const threeOfAKind = groups.find((group) => group.count === 3);
  const pairGroups = groups.filter((group) => group.count === 2);

  if (threeOfAKind !== undefined && pairGroups.length > 0) {
    const bestPair = pairGroups[0];

    if (bestPair === undefined) {
      throw new Error("Expected full house pair");
    }

    return handRank("full-house", [threeOfAKind.value, bestPair.value]);
  }

  if (isFlush) {
    return handRank("flush", values);
  }

  if (straightHighCard !== null) {
    return handRank("straight", [straightHighCard]);
  }

  if (threeOfAKind !== undefined) {
    return handRank("three-of-a-kind", [
      threeOfAKind.value,
      ...highestValuesExcept(values, [threeOfAKind.value], 2)
    ]);
  }

  if (pairGroups.length >= 2) {
    const highPair = pairGroups[0];
    const lowPair = pairGroups[1];

    if (highPair === undefined || lowPair === undefined) {
      throw new Error("Expected two pair groups");
    }

    return handRank("two-pair", [
      highPair.value,
      lowPair.value,
      highestExcept(values, [highPair.value, lowPair.value])
    ]);
  }

  if (pairGroups.length === 1) {
    const pair = pairGroups[0];

    if (pair === undefined) {
      throw new Error("Expected pair group");
    }

    return handRank("pair", [
      pair.value,
      ...highestValuesExcept(values, [pair.value], 3)
    ]);
  }

  return handRank("high-card", values);
}

function handRank(category: HandCategory, ranks: readonly number[]): HandRank {
  const categoryValue = HAND_CATEGORIES.indexOf(category);

  if (categoryValue === -1) {
    throw new Error(`Unknown hand category: ${category}`);
  }

  return {
    category,
    categoryValue,
    ranks
  };
}

function countValues(values: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function getStraightHighCard(values: readonly number[]): number | null {
  const uniqueValues = [...new Set(values)].sort((left, right) => right - left);

  if (uniqueValues.includes(14)) {
    uniqueValues.push(1);
  }

  for (let index = 0; index <= uniqueValues.length - 5; index += 1) {
    const window = uniqueValues.slice(index, index + 5);
    const first = window[0];

    if (first === undefined) {
      continue;
    }

    const isStraight = window.every((value, offset) => value === first - offset);

    if (isStraight) {
      return first;
    }
  }

  return null;
}

function highestExcept(values: readonly number[], excluded: readonly number[]): number {
  const value = values.find((candidate) => !excluded.includes(candidate));

  if (value === undefined) {
    throw new Error("Expected kicker");
  }

  return value;
}

function highestValuesExcept(
  values: readonly number[],
  excluded: readonly number[],
  count: number
): number[] {
  return values.filter((candidate) => !excluded.includes(candidate)).slice(0, count);
}

function fiveCardCombinations(cards: readonly Card[]): Card[][] {
  const combinations: Card[][] = [];

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const combination = [
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e]
            ];

            if (combination.some((card) => card === undefined)) {
              throw new Error("Invalid card combination");
            }

            combinations.push(combination as Card[]);
          }
        }
      }
    }
  }

  return combinations;
}
