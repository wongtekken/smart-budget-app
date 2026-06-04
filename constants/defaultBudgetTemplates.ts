import { getDefaultCategoryDocId } from "./defaultCategories";

export type DefaultBudgetTemplateAllocation = {
  categoryName: string;
  mode: "Fixed" | "Percentage";
  value: number;
};

export type DefaultBudgetTemplate = {
  key: string;
  name: string;
  isDefault: true;
  allocations: DefaultBudgetTemplateAllocation[];
};

export const DEFAULT_BUDGET_TEMPLATES: DefaultBudgetTemplate[] = [
  {
    key: "balanced_monthly_plan",
    name: "Balanced Monthly Plan",
    isDefault: true,
    allocations: [
      { categoryName: "Groceries", mode: "Percentage", value: 22 },
      { categoryName: "Food & Drinks", mode: "Percentage", value: 18 },
      { categoryName: "Shopping", mode: "Percentage", value: 12 },
      { categoryName: "Utilities", mode: "Percentage", value: 10 },
      { categoryName: "Health", mode: "Percentage", value: 7 },
      { categoryName: "Personal Care", mode: "Percentage", value: 8 },
      { categoryName: "Entertainment", mode: "Percentage", value: 8 },
      { categoryName: "Education", mode: "Percentage", value: 8 },
      { categoryName: "Other", mode: "Percentage", value: 7 },
    ],
  },
];

export const getDefaultBudgetTemplateDocId = (userId: string, key: string) =>
  `${userId}_default_budget_template_${key}`;

export const buildDefaultBudgetTemplateDoc = (
  userId: string,
  template: DefaultBudgetTemplate,
) => ({
  userId,
  name: template.name,
  isDefault: template.isDefault,
  templateKey: template.key,
  allocations: template.allocations.map((allocation) => ({
    categoryId: getDefaultCategoryDocId(
      userId,
      "Expense",
      allocation.categoryName,
    ),
    categoryName: allocation.categoryName,
    mode: allocation.mode,
    value: allocation.value,
  })),
});
