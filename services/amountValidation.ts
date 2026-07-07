const AMOUNT_PATTERN = /^(?:\d+|\d*\.\d{1,2})$/;

export const parseAmountInput = (
  value: string,
  { allowZero = false }: { allowZero?: boolean } = {},
) => {
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    return null;
  }

  return Number(amount.toFixed(2));
};
