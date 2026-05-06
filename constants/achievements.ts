export type AchievementIconFamily =
  | "FontAwesome5"
  | "Ionicons"
  | "MaterialCommunity";

export type AchievementCategoryData = {
  isDefault?: boolean;
  isGoal?: boolean;
};

export type AchievementTemplateData = Record<string, unknown>;

export type AchievementTransactionData = {
  aiMode?: string;
  date?: string;
  entrySource?: string;
  source?: string;
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
};

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

export const ACHIEVEMENTS_TOTAL = 14;

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
  [transaction.entrySource, transaction.source, transaction.aiMode]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(source));

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
    templateCount: templates.length,
    transactionCount: transactions.length,
    ...calendarMonthProgress,
  };
};

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
    {
      id: "category-creator",
      title: "Category Creator",
      description: "Create the first category",
      iconName: "human-handsup",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.customCategoryCount, 1),
      isUnlocked: metrics.customCategoryCount >= 1,
    },
    {
      id: "template-trailblazer",
      title: "Template Trailblazer",
      description: "Create the first template",
      iconName: "map-signs",
      iconFamily: "FontAwesome5",
      progress: clampProgress(metrics.templateCount, 1),
      isUnlocked: metrics.templateCount >= 1,
    },
    {
      id: "week-one-warrior",
      title: "Week One Warrior",
      description: "Keep tracking for 7 consecutive days",
      iconName: "calendar-week",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.maxTrackingStreak, 7),
      isUnlocked: metrics.maxTrackingStreak >= 7,
    },
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
    {
      id: "half-year-hustler",
      title: "Half-Year Hustler",
      description: "Keep tracking for 180 consecutive days",
      iconName: "calendar-star",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.maxTrackingStreak, 180),
      isUnlocked: metrics.maxTrackingStreak >= 180,
    },
    {
      id: "year-long-legend",
      title: "Year-Long Legend",
      description: "Keep tracking for 365 consecutive days",
      iconName: "calendar-crown",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.maxTrackingStreak, 365),
      isUnlocked: metrics.maxTrackingStreak >= 365,
    },
    {
      id: "perfect-ten",
      title: "Perfect Ten",
      description: "Record a total of 10 transactions",
      iconName: "trophy-outline",
      iconFamily: "Ionicons",
      progress: clampProgress(metrics.transactionCount, 10),
      isUnlocked: metrics.transactionCount >= 10,
    },
    {
      id: "hundred-forged-hero",
      title: "Hundred-Forged Hero",
      description: "Record a total of 100 transactions",
      iconName: "medal",
      iconFamily: "FontAwesome5",
      progress: clampProgress(metrics.transactionCount, 100),
      isUnlocked: metrics.transactionCount >= 100,
    },
    {
      id: "thousand-transaction-titan",
      title: "Thousand-Transaction Titan",
      description: "Record a total of 1000 transactions",
      iconName: "yen-sign",
      iconFamily: "FontAwesome5",
      progress: clampProgress(metrics.transactionCount, 1000),
      isUnlocked: metrics.transactionCount >= 1000,
    },
    {
      id: "template-master",
      title: "Template Master",
      description: "Create more than 3 custom budget templates",
      iconName: "chart-pie",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.templateCount, 4),
      isUnlocked: metrics.templateCount > 3,
    },
    {
      id: "category-connoisseur",
      title: "Category Connoisseur",
      description: "Create more than 5 custom categories",
      iconName: "shape-plus",
      iconFamily: "MaterialCommunity",
      progress: clampProgress(metrics.customCategoryCount, 6),
      isUnlocked: metrics.customCategoryCount > 5,
    },
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
