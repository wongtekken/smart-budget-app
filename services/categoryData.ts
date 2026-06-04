export type CategoryRecord = {
  id: string;
  isGoal?: boolean;
  name?: string;
  parentId?: string | null;
  type?: string;
};

export type CategoryBackedRecord = {
  categoryId?: string | null;
  categoryName?: string;
  categoryParentId?: string | null;
  categoryParentName?: string;
  type?: string;
};

export type CategorySelection = {
  category: string;
  categoryId: string;
  categoryName: string;
  categoryParentId: string;
  categoryParentName: string;
};

export const getLegacyParentCategoryName = (category?: string) =>
  category ? category.split(" - ")[0] : "Uncategorized";

export const getDisplayCategoryName = (record?: CategoryBackedRecord | null) =>
  record?.categoryName || "Uncategorized";

export const getCategoryPathName = (
  category: CategoryRecord,
  categories: CategoryRecord[],
) => {
  if (!category.parentId) return category.name || "Uncategorized";
  const parent = categories.find((item) => item.id === category.parentId);
  return parent?.name
    ? `${parent.name} - ${category.name || "Uncategorized"}`
    : category.name || "Uncategorized";
};

export const getParentCategoryRecord = (
  record: CategoryBackedRecord,
  categories: CategoryRecord[],
) => {
  if (record.categoryParentId) {
    const parentById = categories.find((item) => item.id === record.categoryParentId);
    if (parentById) return parentById;
  }

  if (record.categoryId) {
    const selected = categories.find((item) => item.id === record.categoryId);
    if (selected) {
      if (!selected.parentId) return selected;
      const parent = categories.find((item) => item.id === selected.parentId);
      if (parent) return parent;
    }
  }

  const parentName =
    record.categoryParentName ||
    getLegacyParentCategoryName(getDisplayCategoryName(record));
  return categories.find(
    (item) =>
      !item.parentId &&
      item.name?.trim().toLowerCase() === parentName.trim().toLowerCase() &&
      (!record.type || !item.type || item.type === record.type),
  );
};

export const getParentCategoryName = (
  record: CategoryBackedRecord,
  categories: CategoryRecord[] = [],
) =>
  getParentCategoryRecord(record, categories)?.name ||
  record.categoryParentName ||
  getLegacyParentCategoryName(getDisplayCategoryName(record));

export const getParentCategoryKey = (
  record: CategoryBackedRecord,
  categories: CategoryRecord[] = [],
) =>
  getParentCategoryRecord(record, categories)?.id ||
  record.categoryParentId ||
  getParentCategoryName(record, categories);

export const getAllocationAmount = (
  allocations: Record<string, number> | undefined,
  category: CategoryRecord,
) => {
  if (!allocations || !category.id) return 0;
  return Number(allocations[category.id] ?? 0);
};

export const allocationsByCategoryName = (
  allocations: Record<string, number> | undefined,
  categories: CategoryRecord[],
) => {
  const normalized: Record<string, number> = {};

  categories
    .filter((category) => !category.parentId && category.name)
    .forEach((category) => {
      const amount = getAllocationAmount(allocations, category);
      if (amount > 0) normalized[category.name as string] = amount;
    });

  return normalized;
};

export const findCategorySelection = (
  categoryName: string,
  type: string,
  categories: CategoryRecord[],
): CategorySelection | null => {
  const normalizedName = categoryName.trim().toLowerCase();
  if (!normalizedName) return null;

  const candidates = categories.filter(
    (category) => !type || !category.type || category.type === type,
  );

  for (const category of candidates) {
    const pathName = getCategoryPathName(category, categories);
    if (pathName.trim().toLowerCase() !== normalizedName) continue;

    const parent = category.parentId
      ? categories.find((item) => item.id === category.parentId)
      : category;

    return {
      category: pathName,
      categoryId: category.id,
      categoryName: pathName,
      categoryParentId: parent?.id || category.id,
      categoryParentName: parent?.name || pathName,
    };
  }

  return null;
};
