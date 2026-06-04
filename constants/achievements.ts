export type AchievementIconFamily =
  | "FontAwesome5"
  | "Ionicons"
  | "MaterialCommunity";

export type AchievementCategoryData = {
  isDefault?: boolean;
  isGoal?: boolean;
};

export type AchievementTemplateData = {
  isDefault?: boolean;
};

export type AchievementTransactionData = {
  date?: string;
  entrySource?: string;
};

export type AchievementEventData = {
  source?: string;
  type?: string;
};

export type AchievementType = {
  id: string;
  title: string;
  description: string;
  iconName: string;
  iconFamily: AchievementIconFamily;
  progress: number;
  isUnlocked: boolean;
  tier?: AchievementTier;
};

export type AchievementTier = "Bronze" | "Silver" | "Gold" | "Platinum";

type AchievementMetrics = {
  customCategoryCount: number;
  hasCompleteCalendarMonth: boolean;
  hasReceiptScan: boolean;
  hasVoiceRecognition: boolean;
  maxCalendarMonthProgress: number;
  maxTrackingStreak: number;
  templateCount: number;
  transactionCount: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const ACHIEVEMENTS_TOTAL = 18;

const TIER_SEQUENCE: AchievementTier[] = ["Bronze", "Silver", "Gold", "Platinum"];

const clampProgress = (current: number, target: number) =>
  Math.min(100, Math.round((current / target) * 100));

const normalizeDate = (date?: string) => {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const getUtcDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const getDaysInMonth = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
};

const getLocalMonthStr = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
};

const getMaxTrackingStreak = (dates: string[]) => {
  const sortedDays = [...new Set(dates.map(getUtcDay))].sort((a, b) => a - b);
  let currentStreak = 0;
  let maxStreak = 0;
  let previousDay: number | null = null;

  sortedDays.forEach((day) => {
    currentStreak = previousDay === day - MS_PER_DAY ? currentStreak + 1 : 1;
    maxStreak = Math.max(maxStreak, currentStreak);
    previousDay = day;
  });

  return maxStreak;
};

const getCalendarMonthProgress = (dates: string[]) => {
  const currentMonth = getLocalMonthStr();
  const currentDay = new Date().getDate();
  const monthDays = dates.reduce<Record<string, Set<number>>>((acc, date) => {
    const month = date.slice(0, 7);
    const day = Number(date.slice(8, 10));
    acc[month] = acc[month] || new Set<number>();
    acc[month].add(day);
    return acc;
  }, {});

  let hasCompleteCalendarMonth = false;
  let maxCalendarMonthProgress = 0;

  Object.entries(monthDays).forEach(([month, days]) => {
    const daysInMonth = getDaysInMonth(month);
    const isCurrentMonth = month === currentMonth;
    const canBeComplete = month < currentMonth || (isCurrentMonth && currentDay === daysInMonth);

    if (canBeComplete) {
      const isComplete = Array.from(
        { length: daysInMonth },
        (_, index) => index + 1,
      ).every((day) => days.has(day));
      hasCompleteCalendarMonth = hasCompleteCalendarMonth || isComplete;
    }

    maxCalendarMonthProgress = Math.max(
      maxCalendarMonthProgress,
      Math.min(100, Math.round((days.size / daysInMonth) * 100)),
    );
  });

  return { hasCompleteCalendarMonth, maxCalendarMonthProgress };
};

const hasSource = (transaction: AchievementTransactionData, source: string) =>
  String(transaction.entrySource || "").toLowerCase().includes(source);

const getMetrics = (
  categories: AchievementCategoryData[],
  templates: AchievementTemplateData[],
  transactions: AchievementTransactionData[],
  events: AchievementEventData[] = [],
): AchievementMetrics => {
  const transactionDates = transactions
    .map((transaction) => normalizeDate(transaction.date))
    .filter((date): date is string => Boolean(date));
  const calendarMonthProgress = getCalendarMonthProgress(transactionDates);

  return {
    customCategoryCount: categories.filter(
      (category) => !category.isDefault && !category.isGoal,
    ).length,
    hasReceiptScan:
      transactions.some(
        (transaction) =>
          hasSource(transaction, "receipt") || hasSource(transaction, "ocr"),
      ) ||
      events.some(
        (event) =>
          String(event.type || "").toLowerCase() === "receipt_scan" ||
          String(event.source || "").toLowerCase().includes("receipt") ||
          String(event.source || "").toLowerCase().includes("ocr"),
      ),
    hasVoiceRecognition: transactions.some((transaction) =>
      hasSource(transaction, "voice"),
    ),
    maxTrackingStreak: getMaxTrackingStreak(transactionDates),
    templateCount: templates.filter((template) => !template.isDefault).length,
    transactionCount: transactions.length,
    ...calendarMonthProgress,
  };
};

const tierId = (tier: AchievementTier) => tier.toLowerCase();

const buildTieredSet = ({
  baseId,
  description,
  iconFamily,
  iconName,
  title,
  value,
  targets,
}: {
  baseId: string;
  description: (target: number, tier: AchievementTier) => string;
  iconFamily: AchievementIconFamily;
  iconName: string;
  title: string;
  value: number;
  targets: number[];
}): AchievementType[] =>
  targets.map((target, index) => {
    const tier = TIER_SEQUENCE[index];
    return {
      id: `${baseId}-${tierId(tier)}`,
      title: `${tier} ${title}`,
      description: description(target, tier),
      iconName,
      iconFamily,
      progress: clampProgress(value, target),
      isUnlocked: value >= target,
      tier,
    };
  });

export const buildAchievements = (
  categories: AchievementCategoryData[],
  templates: AchievementTemplateData[],
  transactions: AchievementTransactionData[],
  events: AchievementEventData[] = [],
): AchievementType[] => {
  const metrics = getMetrics(categories, templates, transactions, events);

  return [
    {
      id: "first-step-to-wealth",
      title: "First Step to Wealth",
      description: "Create the first transaction",
      iconName: "piggy-bank",
      iconFamily: "FontAwesome5",
      progress: clampProgress(metrics.transactionCount, 1),
      isUnlocked: metrics.transactionCount >= 1,
    },
    ...buildTieredSet({
      baseId: "transaction-tracker",
      title: "Transaction Tracker",
      description: (target) => `Record a total of ${target} transactions`,
      iconName: "trophy-outline",
      iconFamily: "Ionicons",
      value: metrics.transactionCount,
      targets: [10, 50, 100, 500],
    }),
    ...buildTieredSet({
      baseId: "streak-builder",
      title: "Streak Builder",
      description: (target) => `Keep tracking for ${target} consecutive days`,
      iconName: "calendar-star",
      iconFamily: "MaterialCommunity",
      value: metrics.maxTrackingStreak,
      targets: [7, 30, 180, 365],
    }),
    {
      id: "monthly-mastery",
      title: "Monthly Mastery",
      description: "Keep tracking for a complete calendar month",
      iconName: "calendar-check",
      iconFamily: "MaterialCommunity",
      progress: metrics.hasCompleteCalendarMonth
        ? 100
        : metrics.maxCalendarMonthProgress,
      isUnlocked: metrics.hasCompleteCalendarMonth,
    },
    ...buildTieredSet({
      baseId: "template-architect",
      title: "Template Architect",
      description: (target) => `Create ${target} custom budget template${target > 1 ? "s" : ""}`,
      iconName: "chart-pie",
      iconFamily: "MaterialCommunity",
      value: metrics.templateCount,
      targets: [1, 2, 4, 8],
    }),
    ...buildTieredSet({
      baseId: "category-architect",
      title: "Category Architect",
      description: (target) => `Create ${target} custom categor${target > 1 ? "ies" : "y"}`,
      iconName: "shape-plus",
      iconFamily: "MaterialCommunity",
      value: metrics.customCategoryCount,
      targets: [1, 3, 6, 10],
    }),
    {
      id: "voice-tracking-victory",
      title: "Voice Tracking Victory",
      description: "Successfully record a transaction using voice recognition for the first time",
      iconName: "microphone-alt",
      iconFamily: "FontAwesome5",
      progress: metrics.hasVoiceRecognition ? 100 : 0,
      isUnlocked: metrics.hasVoiceRecognition,
    },
    {
      id: "scan-savvy-start",
      title: "Scan Savvy Start",
      description: "Successfully record a transaction draft using OCR ticket scanning for the first time",
      iconName: "scan-helper",
      iconFamily: "MaterialCommunity",
      progress: metrics.hasReceiptScan ? 100 : 0,
      isUnlocked: metrics.hasReceiptScan,
    },
  ];
};

export const getAchievementSummary = (
  categories: AchievementCategoryData[],
  templates: AchievementTemplateData[],
  transactions: AchievementTransactionData[],
  events: AchievementEventData[] = [],
) => {
  const achievements = buildAchievements(
    categories,
    templates,
    transactions,
    events,
  );
  return {
    achievements,
    totalCount: achievements.length,
    unlockedCount: achievements.filter((achievement) => achievement.isUnlocked)
      .length,
  };
};
