export type TransactionRecord = {
  id?: string;
  amount?: number | string;
  category?: string;
  date?: string;
  goalId?: string | null;
  note?: string;
  recurring?: string;
  type?: string;
};

export type MonthlyBudgetRecord = {
  id?: string;
  allocations?: Record<string, number>;
  month?: string;
  userId?: string;
};

export type GoalRecord = {
  id?: string;
  title?: string;
  targetAmount?: number;
  type?: string;
};

export type RecurringRecord = {
  amount?: number | string;
  category?: string;
  frequency?: string;
  isActive?: boolean;
  type?: string;
};

export type InsightSeverity = "info" | "success" | "warning" | "danger";

export type InsightItem = {
  amount?: number;
  baselineAmount?: number;
  category?: string;
  confidence?: "Low" | "Medium" | "High";
  currentAmount?: number;
  description: string;
  differenceAmount?: number;
  differencePercent?: number;
  impact?: number;
  metric?: string;
  reason?: string;
  severity: InsightSeverity;
  title: string;
};

export type CategoryBehavior =
  | "Stable Spending"
  | "Growing Spending"
  | "Weekend-Sensitive Spending"
  | "Risk Category";

export type CategoryBehaviorItem = {
  averageMonthly: number;
  behavior: CategoryBehavior;
  category: string;
  confidence?: "Low" | "Medium" | "High";
  currentAmount?: number;
  description: string;
  reason?: string;
};

export type BudgetTransferSuggestion = {
  amount: number;
  fromCategory: string;
  message: string;
  toCategory: string;
};

export type UnusedBudgetOpportunity = {
  allocated: number;
  category: string;
  message: string;
  spent: number;
  unusedAmount: number;
};

export type FinancialIntelligenceResult = {
  abnormalSpending: InsightItem[];
  budgetTransfers: BudgetTransferSuggestion[];
  categoryBehaviors: CategoryBehaviorItem[];
  goalRecommendations: InsightItem[];
  lifestyleChanges: InsightItem[];
  monthlyReview: string[];
  reactiveAlerts: InsightItem[];
  savingOpportunities: InsightItem[];
  underspentRecommendations: InsightItem[];
  unusedBudgetOpportunities: UnusedBudgetOpportunity[];
  weekendPatterns: InsightItem[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASELINE_MONTHS = 3;

const normalizeType = (type?: string) => String(type || "").toLowerCase();

const getParentCategory = (category?: string) =>
  category ? category.split(" - ")[0] : "Uncategorized";

const isGoalCategoryName = (category?: string) => getParentCategory(category).startsWith("🎯");

const getAmount = (value?: number | string) => Number(value) || 0;

const getActiveCategorySet = (activeExpenseCategories?: string[]) => {
  if (!activeExpenseCategories?.length) return null;

  return new Set(
    activeExpenseCategories
      .map((category) => category.trim())
      .filter(Boolean),
  );
};

const isActiveCategory = (category: string, activeCategorySet: Set<string> | null) =>
  !activeCategorySet || activeCategorySet.has(category);

const filterCategoryAmounts = (
  values: Record<string, number>,
  activeCategorySet: Set<string> | null,
) => {
  if (!activeCategorySet) return values;

  return Object.fromEntries(
    Object.entries(values).filter(([category]) => activeCategorySet.has(category)),
  );
};

const filterCategorySeries = (
  values: Record<string, number[]>,
  activeCategorySet: Set<string> | null,
) => {
  if (!activeCategorySet) return values;

  return Object.fromEntries(
    Object.entries(values).filter(([category]) => activeCategorySet.has(category)),
  );
};

export const getLocalDateStr = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const getLocalMonthStr = (date = new Date()) => getLocalDateStr(date).slice(0, 7);

const parseDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const shiftMonth = (month: string, offset: number) => {
  const [year, monthIndex] = month.split("-").map(Number);
  return getLocalMonthStr(new Date(year, monthIndex - 1 + offset, 1));
};

const getMonthRange = (currentMonth: string, count: number) =>
  Array.from({ length: count }, (_, index) => shiftMonth(currentMonth, -index - 1));

const sumValues = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

const average = (values: number[]) => (values.length > 0 ? sumValues(values) / values.length : 0);

const standardDeviation = (values: number[]) => {
  const mean = average(values);
  if (values.length === 0) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

const getExpenseTransactions = (transactions: TransactionRecord[]) =>
  transactions.filter(
    (tx) => normalizeType(tx.type) === "expense" && !isGoalCategoryName(tx.category),
  );

const getSpendByCategoryForMonth = (transactions: TransactionRecord[], month: string) => {
  const byCategory: Record<string, number> = {};

  getExpenseTransactions(transactions).forEach((tx) => {
    if (!String(tx.date || "").startsWith(month)) return;
    const category = getParentCategory(tx.category);
    byCategory[category] = (byCategory[category] || 0) + getAmount(tx.amount);
  });

  return byCategory;
};

const getTotalForMonth = (transactions: TransactionRecord[], month: string, type: string) =>
  transactions.reduce((sum, tx) => {
    if (!String(tx.date || "").startsWith(month) || normalizeType(tx.type) !== type) {
      return sum;
    }
    if (type === "expense" && isGoalCategoryName(tx.category)) {
      return sum;
    }

    return sum + getAmount(tx.amount);
  }, 0);

const getBudgetForMonth = (budgets: MonthlyBudgetRecord[], month: string) =>
  budgets.find((budget) => budget.month === month)?.allocations || {};

const getLastDaysSpendByCategory = (
  transactions: TransactionRecord[],
  endDate: Date,
  days: number,
) => {
  const startTime = endDate.getTime() - days * MS_PER_DAY;
  const byCategory: Record<string, number> = {};

  getExpenseTransactions(transactions).forEach((tx) => {
    const parsed = parseDate(tx.date);
    if (!parsed || parsed.getTime() < startTime || parsed.getTime() > endDate.getTime()) {
      return;
    }

    const category = getParentCategory(tx.category);
    byCategory[category] = (byCategory[category] || 0) + getAmount(tx.amount);
  });

  return byCategory;
};

const getPriorDaysSpendByCategory = (
  transactions: TransactionRecord[],
  endDate: Date,
  recentDays: number,
  priorDays: number,
) => {
  const recentStartTime = endDate.getTime() - recentDays * MS_PER_DAY;
  const priorStartTime = recentStartTime - priorDays * MS_PER_DAY;
  const byCategory: Record<string, number> = {};

  getExpenseTransactions(transactions).forEach((tx) => {
    const parsed = parseDate(tx.date);
    if (!parsed || parsed.getTime() < priorStartTime || parsed.getTime() >= recentStartTime) {
      return;
    }

    const category = getParentCategory(tx.category);
    byCategory[category] = (byCategory[category] || 0) + getAmount(tx.amount);
  });

  return byCategory;
};

const getBudgetProgress = (
  currentSpendByCategory: Record<string, number>,
  currentAllocations: Record<string, number>,
) =>
  Object.keys({ ...currentSpendByCategory, ...currentAllocations }).map((category) => {
    const spent = currentSpendByCategory[category] || 0;
    const allocated = Number(currentAllocations[category] || 0);
    const progress = allocated > 0 ? spent / allocated : spent > 0 ? 1 : 0;

    return { allocated, category, progress, remaining: allocated - spent, spent };
  });

const getMonthlySeriesByCategory = (
  transactions: TransactionRecord[],
  months: string[],
) => {
  const categories = new Set<string>();
  const monthlyMaps = months.map((month) => getSpendByCategoryForMonth(transactions, month));

  monthlyMaps.forEach((monthMap) => {
    Object.keys(monthMap).forEach((category) => categories.add(category));
  });

  const series: Record<string, number[]> = {};
  categories.forEach((category) => {
    series[category] = monthlyMaps.map((monthMap) => monthMap[category] || 0);
  });

  return series;
};

const createAbnormalSpending = (
  currentSpendByCategory: Record<string, number>,
  baselineSeries: Record<string, number[]>,
) =>
  Object.keys(currentSpendByCategory)
    .map((category) => {
      const baseline = average(baselineSeries[category] || []);
      const current = currentSpendByCategory[category] || 0;
      const increase = current - baseline;
      const ratio = baseline > 0 ? current / baseline : current > 0 ? 99 : 0;

      if (baseline < 20 || increase < 25 || ratio < 1.6) return null;

      return {
        amount: current,
        baselineAmount: baseline,
        category,
        confidence: ratio >= 2 || increase >= 100 ? ("High" as const) : ("Medium" as const),
        currentAmount: current,
        description: `${category} is RM ${increase.toFixed(0)} above your personal monthly baseline.`,
        differenceAmount: increase,
        differencePercent: (ratio - 1) * 100,
        impact: increase,
        metric: `+${Math.round((ratio - 1) * 100)}% vs baseline`,
        reason: "Current month spending is compared with the user's previous 3-month category baseline.",
        severity: "danger" as const,
        title: "Abnormal spending detected",
      };
    })
    .filter(Boolean) as InsightItem[];

const createWeekendPatterns = (
  transactions: TransactionRecord[],
  activeCategorySet: Set<string> | null,
) => {
  const stats: Record<
    string,
    { weekdayAmount: number; weekdayDays: Set<string>; weekendAmount: number; weekendDays: Set<string> }
  > = {};

  getExpenseTransactions(transactions).forEach((tx) => {
    const parsed = parseDate(tx.date);
    if (!parsed) return;
    const category = getParentCategory(tx.category);
    if (!isActiveCategory(category, activeCategorySet)) return;

    const day = parsed.getDay();
    const isWeekend = day === 0 || day === 6;

    stats[category] ||= {
      weekdayAmount: 0,
      weekdayDays: new Set<string>(),
      weekendAmount: 0,
      weekendDays: new Set<string>(),
    };

    if (isWeekend) {
      stats[category].weekendAmount += getAmount(tx.amount);
      stats[category].weekendDays.add(tx.date || "");
    } else {
      stats[category].weekdayAmount += getAmount(tx.amount);
      stats[category].weekdayDays.add(tx.date || "");
    }
  });

  return Object.keys(stats)
    .map((category) => {
      const item = stats[category];
      const weekendAvg = item.weekendAmount / Math.max(item.weekendDays.size, 1);
      const weekdayAvg = item.weekdayAmount / Math.max(item.weekdayDays.size, 1);
      const ratio = weekdayAvg > 0 ? weekendAvg / weekdayAvg : weekendAvg > 20 ? 99 : 0;

      if (item.weekendAmount < 40 || ratio < 1.35) return null;

      return {
        amount: item.weekendAmount,
        baselineAmount: weekdayAvg,
        category,
        confidence: ratio >= 2 ? ("High" as const) : ("Medium" as const),
        currentAmount: weekendAvg,
        description: `${category} spending is noticeably higher on weekends than weekdays.`,
        differenceAmount: weekendAvg - weekdayAvg,
        differencePercent: ratio >= 99 ? undefined : (ratio - 1) * 100,
        impact: weekendAvg - weekdayAvg,
        metric: `${ratio >= 99 ? "High" : `${ratio.toFixed(1)}x`} weekend intensity`,
        reason: "Average weekend spending per active day is compared with weekday spending.",
        severity: "warning" as const,
        title: "Weekend-sensitive pattern",
      };
    })
    .filter(Boolean) as InsightItem[];
};

const createLifestyleChanges = (
  transactions: TransactionRecord[],
  now: Date,
  activeCategorySet: Set<string> | null,
) => {
  const recent = filterCategoryAmounts(
    getLastDaysSpendByCategory(transactions, now, 30),
    activeCategorySet,
  );
  const prior = filterCategoryAmounts(
    getPriorDaysSpendByCategory(transactions, now, 30, 90),
    activeCategorySet,
  );
  const categories = new Set([...Object.keys(recent), ...Object.keys(prior)]);

  return Array.from(categories)
    .map((category) => {
      const recentDaily = (recent[category] || 0) / 30;
      const priorDaily = (prior[category] || 0) / 90;
      const diff = recentDaily - priorDaily;
      const ratio = priorDaily > 0 ? recentDaily / priorDaily : recentDaily > 3 ? 99 : 1;

      if (Math.abs(diff) < 2 || (ratio < 1.5 && ratio > 0.55)) return null;

      const direction = diff > 0 ? "increased" : "decreased";
      return {
        amount: recent[category] || 0,
        baselineAmount: priorDaily * 30,
        category,
        confidence: ratio >= 2 || ratio <= 0.4 ? ("High" as const) : ("Medium" as const),
        currentAmount: recent[category] || 0,
        description: `${category} has ${direction} compared with your earlier 90-day pattern.`,
        differenceAmount: diff * 30,
        differencePercent: priorDaily > 0 ? (ratio - 1) * 100 : undefined,
        impact: diff * 30,
        metric: `${diff > 0 ? "+" : ""}RM ${(diff * 30).toFixed(0)} monthly pace`,
        reason: "Recent 30-day spending pace is compared with the earlier 90-day pattern.",
        severity: diff > 0 ? ("warning" as const) : ("info" as const),
        title: "Possible lifestyle adjustment",
      };
    })
    .filter(Boolean) as InsightItem[];
};

const createCategoryBehaviors = (
  baselineSeries: Record<string, number[]>,
  abnormalSpending: InsightItem[],
  weekendPatterns: InsightItem[],
  budgetProgress: ReturnType<typeof getBudgetProgress>,
) => {
  const categories = new Set([
    ...Object.keys(baselineSeries),
    ...abnormalSpending.map((item) => item.category || ""),
    ...weekendPatterns.map((item) => item.category || ""),
    ...budgetProgress.map((item) => item.category),
  ]);

  return Array.from(categories)
    .filter(Boolean)
    .map((category) => {
      const series = baselineSeries[category] || [];
      const avg = average(series);
      const cv = avg > 0 ? standardDeviation(series) / avg : 0;
      const isAbnormal = abnormalSpending.some((item) => item.category === category);
      const isWeekend = weekendPatterns.some((item) => item.category === category);
      const progressItem = budgetProgress.find((item) => item.category === category);
      const progress = progressItem?.progress || 0;
      const firstHalf = average(series.slice(Math.ceil(series.length / 2)));
      const secondHalf = average(series.slice(0, Math.ceil(series.length / 2)));
      const isGrowing = secondHalf > firstHalf * 1.25 && secondHalf - firstHalf > 20;

      if (progress >= 0.85 || isAbnormal) {
        return {
          averageMonthly: avg,
          behavior: "Risk Category" as const,
          category,
          confidence: progress >= 1 || isAbnormal ? ("High" as const) : ("Medium" as const),
          currentAmount: progressItem?.spent || 0,
          description: `${category} needs attention because spending is close to budget or above baseline.`,
          reason: progress >= 0.85
            ? "Current spending is close to or above this category's budget."
            : "Current spending is above the user's personal baseline.",
        };
      }

      if (isWeekend) {
        return {
          averageMonthly: avg,
          behavior: "Weekend-Sensitive Spending" as const,
          category,
          confidence: "Medium" as const,
          currentAmount: progressItem?.spent || 0,
          description: `${category} tends to rise during weekends.`,
          reason: "Weekend spending intensity is higher than weekday spending.",
        };
      }

      if (isGrowing) {
        return {
          averageMonthly: avg,
          behavior: "Growing Spending" as const,
          category,
          confidence: "Medium" as const,
          currentAmount: progressItem?.spent || 0,
          description: `${category} is trending upward compared with earlier months.`,
          reason: "Recent monthly baseline is higher than earlier monthly baseline.",
        };
      }

      return {
        averageMonthly: avg,
        behavior: "Stable Spending" as const,
        category,
        confidence: cv <= 0.3 ? ("High" as const) : ("Medium" as const),
        currentAmount: progressItem?.spent || 0,
        description:
          cv <= 0.3 ? `${category} is relatively consistent.` : `${category} varies, but no major risk is detected.`,
        reason:
          cv <= 0.3
            ? "Monthly category spending has low variation."
            : "Variation exists, but no budget or baseline risk threshold was crossed.",
      };
    })
    .sort((a, b) => {
      const rank: Record<CategoryBehavior, number> = {
        "Risk Category": 0,
        "Growing Spending": 1,
        "Weekend-Sensitive Spending": 2,
        "Stable Spending": 3,
      };
      return rank[a.behavior] - rank[b.behavior] || b.averageMonthly - a.averageMonthly;
    });
};

const createBudgetTransfers = (
  currentSpendByCategory: Record<string, number>,
  currentAllocations: Record<string, number>,
) => {
  const progress = getBudgetProgress(currentSpendByCategory, currentAllocations);
  const overspent = progress.filter((item) => item.allocated > 0 && item.remaining < 0);
  const unused = progress
    .filter((item) => item.allocated > 0 && item.remaining > item.allocated * 0.4)
    .sort((a, b) => b.remaining - a.remaining);

  const suggestions: BudgetTransferSuggestion[] = [];
  overspent.forEach((target) => {
    const source = unused.find((item) => item.category !== target.category && item.remaining > 0);
    if (!source) return;
    const amount = Math.min(Math.abs(target.remaining), source.remaining * 0.5);
    if (amount < 10) return;

    suggestions.push({
      amount,
      fromCategory: source.category,
      message: `${target.category} is over budget. You can transfer RM ${amount.toFixed(0)} from ${source.category}, which still has unused funds.`,
      toCategory: target.category,
    });
  });

  return suggestions;
};

const createUnusedBudgetOpportunities = (
  currentSpendByCategory: Record<string, number>,
  currentAllocations: Record<string, number>,
) =>
  Object.keys(currentAllocations)
    .map((category) => {
      const allocated = Number(currentAllocations[category] || 0);
      const spent = currentSpendByCategory[category] || 0;
      const unusedAmount = allocated - spent;

      if (category.startsWith("\uD83C\uDFAF") || allocated <= 0 || unusedAmount <= 0) {
        return null;
      }

      return {
        allocated,
        category,
        message: `${category} still has RM ${unusedAmount.toFixed(0)} unused. You can carry it to next month or move it to a goal.`,
        spent,
        unusedAmount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.unusedAmount || 0) - (a?.unusedAmount || 0)) as UnusedBudgetOpportunity[];

const createUnderspentRecommendations = (
  budgets: MonthlyBudgetRecord[],
  transactions: TransactionRecord[],
  currentMonth: string,
  activeCategorySet: Set<string> | null,
) => {
  const months = getMonthRange(currentMonth, BASELINE_MONTHS);
  const byCategory: Record<string, { allocated: number[]; spent: number[] }> = {};

  months.forEach((month) => {
    const budget = getBudgetForMonth(budgets, month);
    const spent = filterCategoryAmounts(
      getSpendByCategoryForMonth(transactions, month),
      activeCategorySet,
    );
    Object.keys({ ...budget, ...spent }).forEach((category) => {
      if (!isActiveCategory(category, activeCategorySet)) return;

      byCategory[category] ||= { allocated: [], spent: [] };
      byCategory[category].allocated.push(Number(budget[category] || 0));
      byCategory[category].spent.push(spent[category] || 0);
    });
  });

  return Object.keys(byCategory)
    .map((category) => {
      const allocated = byCategory[category].allocated;
      const spent = byCategory[category].spent;
      const validMonths = allocated.filter((value) => value > 0).length;
      if (validMonths < 3) return null;

      const underspentEveryMonth = allocated.every(
        (budget, index) => budget > 0 && spent[index] <= budget * 0.7,
      );
      const avgUnused = average(allocated.map((budget, index) => Math.max(budget - spent[index], 0)));

      if (!underspentEveryMonth || avgUnused < 15) return null;

      return {
        amount: avgUnused,
        baselineAmount: average(allocated),
        category,
        confidence: avgUnused >= 50 ? ("High" as const) : ("Medium" as const),
        currentAmount: average(spent),
        description: `${category} has stayed at least 30% under budget for 3 months. Consider lowering it and moving around RM ${avgUnused.toFixed(0)} elsewhere.`,
        differenceAmount: avgUnused,
        differencePercent: avgUnused / Math.max(average(allocated), 1) * 100,
        impact: avgUnused,
        metric: `RM ${avgUnused.toFixed(0)} average unused`,
        reason: "This category stayed at least 30% under budget for each of the last 3 months.",
        severity: "success" as const,
        title: "Consistently underspent budget",
      };
    })
    .filter(Boolean) as InsightItem[];
};

const createSavingOpportunities = (
  currentSpendByCategory: Record<string, number>,
  currentAllocations: Record<string, number>,
  recurring: RecurringRecord[],
) => {
  const recurringCategories = new Set(
    recurring
      .filter((item) => item.isActive !== false && normalizeType(item.type) === "expense")
      .map((item) => getParentCategory(item.category)),
  );

  return Object.keys(currentSpendByCategory)
    .filter((category) => !recurringCategories.has(category))
    .map((category) => {
      const spent = currentSpendByCategory[category] || 0;
      const allocated = Number(currentAllocations[category] || 0);
      const saving = Math.min(spent * 0.2, allocated > 0 ? Math.max(spent - allocated * 0.7, 0) : spent * 0.15);

      if (saving < 15) return null;

      return {
        amount: saving,
        baselineAmount: allocated,
        category,
        confidence: saving >= 50 ? ("High" as const) : ("Medium" as const),
        currentAmount: spent,
        description: `Reducing ${category} by about 20% could save around RM ${saving.toFixed(0)} this month.`,
        differenceAmount: saving,
        differencePercent: spent > 0 ? (saving / spent) * 100 : undefined,
        impact: saving,
        metric: `Potential RM ${saving.toFixed(0)} saving`,
        reason: "Flexible non-recurring spending is high enough to support a practical reduction.",
        severity: "success" as const,
        title: "Saving opportunity",
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.impact || 0) - (a?.impact || 0))
    .slice(0, 3) as InsightItem[];
};

const createGoalRecommendations = (
  currentSpendByCategory: Record<string, number>,
  currentAllocations: Record<string, number>,
  goals: GoalRecord[],
  now: Date,
) => {
  const day = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (goals.length === 0 || totalDays - day > 5) return [];

  const unused = Object.keys(currentAllocations)
    .map((category) => ({
      category,
      remaining: Number(currentAllocations[category] || 0) - (currentSpendByCategory[category] || 0),
    }))
    .filter((item) => item.remaining > Number(currentAllocations[item.category] || 0) * 0.4)
    .sort((a, b) => b.remaining - a.remaining);

  const goal = goals[0];
  const source = unused.find((item) => !item.category.startsWith("\uD83C\uDFAF"));
  if (!source || source.remaining < 10) return [];

  return [
    {
      amount: source.remaining,
      baselineAmount: Number(currentAllocations[source.category] || 0),
      category: source.category,
      confidence: source.remaining >= 50 ? ("High" as const) : ("Medium" as const),
      currentAmount: currentSpendByCategory[source.category] || 0,
      description: `You still have RM ${source.remaining.toFixed(0)} unused in ${source.category}. Consider moving part of it to your ${goal.title || "saving"} goal before the cycle ends.`,
      differenceAmount: source.remaining,
      differencePercent: source.remaining / Math.max(Number(currentAllocations[source.category] || 0), 1) * 100,
      impact: source.remaining,
      metric: "Goal-aware recommendation",
      reason: "Unused category budget is available near month end and an active financial goal exists.",
      severity: "success" as const,
      title: "Move unused funds to savings",
    },
  ];
};

export const createReactiveBudgetAlert = (
  transaction: TransactionRecord,
  transactions: TransactionRecord[],
  currentAllocations: Record<string, number>,
) => {
  if (normalizeType(transaction.type) !== "expense") return null;
  if (isGoalCategoryName(transaction.category)) return null;

  const category = getParentCategory(transaction.category);
  const txMonth = String(transaction.date || getLocalDateStr()).slice(0, 7);
  const spent = getSpendByCategoryForMonth(transactions, txMonth)[category] || 0;
  const allocated = Number(currentAllocations[category] || 0);

  if (allocated <= 0) {
    return {
      amount: getAmount(transaction.amount),
      baselineAmount: 0,
      category,
      confidence: "Medium" as const,
      currentAmount: spent,
      description: `${category} has no budget set. Add a budget so future spending can be tracked more accurately.`,
      differenceAmount: spent,
      metric: "Unbudgeted category",
      reason: "This category has spending but no assigned budget for the transaction month.",
      severity: "warning" as const,
      title: "Reactive budget alert",
    };
  }

  const progress = spent / allocated;
  if (progress < 0.8) return null;

  return {
    amount: spent,
    baselineAmount: allocated,
    category,
    confidence: progress >= 1 ? ("High" as const) : ("Medium" as const),
    currentAmount: spent,
    description:
      progress >= 1
        ? `This transaction pushes ${category} over budget at ${Math.round(progress * 100)}%. Consider limiting this category or transferring unused budget.`
        : `This transaction puts ${category} at ${Math.round(progress * 100)}% of its budget. Spend carefully for the rest of the month.`,
    differenceAmount: spent - allocated,
    differencePercent: progress * 100,
    metric: `${Math.round(progress * 100)}% budget used`,
    reason: "This alert is calculated immediately after the transaction is saved.",
    severity: progress >= 1 ? ("danger" as const) : ("warning" as const),
    title: "Reactive budget alert",
  };
};

export const buildFinancialIntelligence = ({
  activeExpenseCategories,
  budgets,
  currentAllocations,
  goals,
  now = new Date(),
  recurring,
  transactions,
}: {
  activeExpenseCategories?: string[];
  budgets: MonthlyBudgetRecord[];
  currentAllocations: Record<string, number>;
  goals: GoalRecord[];
  now?: Date;
  recurring: RecurringRecord[];
  transactions: TransactionRecord[];
}): FinancialIntelligenceResult => {
  const currentMonth = getLocalMonthStr(now);
  const baselineMonths = getMonthRange(currentMonth, BASELINE_MONTHS);
  const activeCategorySet = getActiveCategorySet(activeExpenseCategories);
  const currentSpendByCategory = filterCategoryAmounts(
    getSpendByCategoryForMonth(transactions, currentMonth),
    activeCategorySet,
  );
  const activeAllocations = filterCategoryAmounts(currentAllocations, activeCategorySet);
  const baselineSeries = filterCategorySeries(
    getMonthlySeriesByCategory(transactions, baselineMonths),
    activeCategorySet,
  );
  const abnormalSpending = createAbnormalSpending(currentSpendByCategory, baselineSeries);
  const weekendPatterns = createWeekendPatterns(transactions, activeCategorySet);
  const lifestyleChanges = createLifestyleChanges(transactions, now, activeCategorySet);
  const budgetProgress = getBudgetProgress(currentSpendByCategory, activeAllocations);
  const reactiveAlerts = budgetProgress
    .filter((item) => item.allocated > 0 && item.progress >= 0.8)
    .map((item) => ({
      amount: item.spent,
      baselineAmount: item.allocated,
      category: item.category,
      confidence: item.progress >= 1 ? ("High" as const) : ("Medium" as const),
      currentAmount: item.spent,
      description:
        item.progress >= 1
          ? `${item.category} is over budget by RM ${Math.abs(item.remaining).toFixed(0)}.`
          : `${item.category} has used ${Math.round(item.progress * 100)}% of its budget.`,
      differenceAmount: item.spent - item.allocated,
      differencePercent: item.progress * 100,
      impact: item.remaining,
      metric: `${Math.round(item.progress * 100)}% used`,
      reason: "Current month category spending is compared with the assigned category budget.",
      severity: item.progress >= 1 ? ("danger" as const) : ("warning" as const),
      title: item.progress >= 1 ? "Budget exceeded" : "Budget almost exceeded",
    }));

  const budgetTransfers = createBudgetTransfers(currentSpendByCategory, activeAllocations);
  const unusedBudgetOpportunities = createUnusedBudgetOpportunities(
    currentSpendByCategory,
    activeAllocations,
  );
  const underspentRecommendations = createUnderspentRecommendations(
    budgets,
    transactions,
    currentMonth,
    activeCategorySet,
  );
  const savingOpportunities = createSavingOpportunities(
    currentSpendByCategory,
    activeAllocations,
    recurring,
  );
  const goalRecommendations = createGoalRecommendations(
    currentSpendByCategory,
    activeAllocations,
    goals,
    now,
  );
  const categoryBehaviors = createCategoryBehaviors(
    baselineSeries,
    abnormalSpending,
    weekendPatterns,
    budgetProgress,
  );

  const monthlyReview = [
    abnormalSpending[0]?.description || "No major abnormal spending was detected this month.",
    reactiveAlerts[0]?.description || "No category is currently above the budget risk threshold.",
    savingOpportunities[0]?.description || "No strong saving opportunity is visible yet.",
    goalRecommendations[0]?.description || "Keep unused funds available for savings or next cycle.",
  ];

  return {
    abnormalSpending,
    budgetTransfers,
    categoryBehaviors,
    goalRecommendations,
    lifestyleChanges,
    monthlyReview,
    reactiveAlerts,
    savingOpportunities,
    underspentRecommendations,
    unusedBudgetOpportunities,
    weekendPatterns,
  };
};
