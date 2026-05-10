export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A"
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type Card = Readonly<{
  rank: Rank;
  suit: Suit;
}>;

export type Rng = () => number;

const SUIT_INITIALS: Record<Suit, string> = {
  clubs: "c",
  diamonds: "d",
  hearts: "h",
  spades: "s"
};

export const RANK_VALUES: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function cardKey(card: Card): string {
  return `${card.rank}${SUIT_INITIALS[card.suit]}`;
}

export function shuffleDeck(deck: readonly Card[], rng: Rng): Card[] {
  const shuffled = [...deck];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomValue = rng();

    if (randomValue < 0 || randomValue >= 1) {
      throw new Error("RNG must return a number >= 0 and < 1");
    }

    const j = Math.floor(randomValue * (i + 1));
    const current = shuffled[i];
    const replacement = shuffled[j];

    if (current === undefined || replacement === undefined) {
      throw new Error("Deck index out of bounds during shuffle");
    }

    shuffled[i] = replacement;
    shuffled[j] = current;
  }

  return shuffled;
}

export function parseCard(value: string): Card {
  const rank = value[0] as Rank | undefined;
  const suitInitial = value[1];

  if (rank === undefined || !RANKS.includes(rank)) {
    throw new Error(`Invalid card rank: ${value}`);
  }

  const suit = SUITS.find((candidate) => SUIT_INITIALS[candidate] === suitInitial);

  if (suit === undefined) {
    throw new Error(`Invalid card suit: ${value}`);
  }

  return { rank, suit };
}

export function assertUniqueCards(cards: readonly Card[]): void {
  const uniqueCards = new Set(cards.map(cardKey));

  if (uniqueCards.size !== cards.length) {
    throw new Error("Cards must be unique");
  }
}

