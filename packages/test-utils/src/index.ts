export function createRepeatingRng(values: readonly number[]) {
  let index = 0;

  return () => {
    const value = values[index % values.length];
    index += 1;

    if (value === undefined) {
      throw new Error("At least one RNG value is required");
    }

    return value;
  };
}

