export type DefaultCategory = {
  name: string;
  type: "Expense" | "Income";
  icon: string;
  isDefault: true;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Food & Drinks", type: "Expense", icon: "restaurant-outline", isDefault: true },
  { name: "Groceries", type: "Expense", icon: "basket-outline", isDefault: true },
  { name: "Transport", type: "Expense", icon: "car-outline", isDefault: true },
  { name: "Shopping", type: "Expense", icon: "cart-outline", isDefault: true },
  { name: "Housing", type: "Expense", icon: "home-outline", isDefault: true },
  { name: "Utilities", type: "Expense", icon: "flash-outline", isDefault: true },
  { name: "Health", type: "Expense", icon: "medkit-outline", isDefault: true },
  { name: "Personal Care", type: "Expense", icon: "sparkles-outline", isDefault: true },
  { name: "Entertainment", type: "Expense", icon: "film-outline", isDefault: true },
  { name: "Education", type: "Expense", icon: "school-outline", isDefault: true },
  { name: "Travel", type: "Expense", icon: "airplane-outline", isDefault: true },
  { name: "Gifts & Donations", type: "Expense", icon: "gift-outline", isDefault: true },
  { name: "Fees & Charges", type: "Expense", icon: "card-outline", isDefault: true },
  { name: "Other", type: "Expense", icon: "ellipsis-horizontal-circle-outline", isDefault: true },
  { name: "Salary", type: "Income", icon: "cash-outline", isDefault: true },
  { name: "Business", type: "Income", icon: "briefcase-outline", isDefault: true },
  { name: "Investment", type: "Income", icon: "trending-up-outline", isDefault: true },
  { name: "Allowance", type: "Income", icon: "wallet-outline", isDefault: true },
  { name: "Gift", type: "Income", icon: "gift-outline", isDefault: true },
  { name: "Other Income", type: "Income", icon: "add-circle-outline", isDefault: true },
];

export const getDefaultCategoryDocId = (
  userId: string,
  type: string,
  name: string,
) =>
  `${userId}_default_${type.toLowerCase()}_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
