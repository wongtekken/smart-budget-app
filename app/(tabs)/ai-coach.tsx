import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../../components/app-header";
import { palette, radius, shadow, spacing } from "../../constants/ui";
import { auth, db } from "../../firebaseConfig";
import {
  FinancialCoachResponse,
  generateFinancialCoach,
} from "../../services/aiService";
import {
  buildFinancialIntelligence,
  BudgetTransferSuggestion,
  GoalRecord,
  InsightItem,
  InsightSeverity,
  MonthlyBudgetRecord,
  RecurringRecord,
  TransactionRecord,
  UnusedBudgetOpportunity,
} from "../../services/financialIntelligence";
import { useAppDialog } from "../../components/app-dialog";
import {
  allocationsByCategoryName,
  getAllocationAmount,
} from "../../services/categoryData";

type ExpenseCategoryRecord = {
  goalId?: string;
  id: string;
  isGoal?: boolean;
  name?: string;
  parentId?: string | null;
  type?: string;
};

type FocusTone = "danger" | "success" | "warning" | "primary";

type FocusItem = {
  actionLabel?: string;
  description: string;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  meta: string;
  onPress?: () => void;
  title: string;
  tone: FocusTone;
};

const getLocalDateStr = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getLocalMonthStr = (date = new Date()) => getLocalDateStr(date).slice(0, 7);

const getNextMonthStr = (month: string) => {
  const [year, monthIndex] = month.split("-").map(Number);
  return getLocalMonthStr(new Date(year, monthIndex, 1));
};

const getSeverityColor = (severity: InsightSeverity) => {
  if (severity === "danger") return palette.danger;
  if (severity === "warning") return palette.warning;
  if (severity === "success") return palette.success;
  return palette.primary;
};

const formatAmount = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `RM ${value.toFixed(0)}` : "";

const formatPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(0)}%` : "";

const InsightCard = ({
  baselineAmount,
  confidence,
  currentAmount,
  description,
  differenceAmount,
  differencePercent,
  evidenceLabels,
  metric,
  reason,
  severity,
  title,
}: Pick<
  InsightItem,
  | "baselineAmount"
  | "confidence"
  | "currentAmount"
  | "description"
  | "differenceAmount"
  | "differencePercent"
  | "metric"
  | "reason"
  | "severity"
  | "title"
> & {
  evidenceLabels?: {
    baseline?: string;
    current?: string;
    difference?: string;
    percent?: string;
  };
}) => {
  const color = getSeverityColor(severity);
  const evidence = [
    currentAmount !== undefined
      ? { label: evidenceLabels?.current || "Current", value: formatAmount(currentAmount) }
      : null,
    baselineAmount !== undefined
      ? { label: evidenceLabels?.baseline || "Baseline", value: formatAmount(baselineAmount) }
      : null,
    differenceAmount !== undefined
      ? { label: evidenceLabels?.difference || "Diff", value: formatAmount(differenceAmount) }
      : null,
    differencePercent !== undefined
      ? { label: evidenceLabels?.percent || "Change", value: formatPercent(differencePercent) }
      : null,
    confidence ? { label: "Confidence", value: confidence } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={styles.insightCard}>
      <View style={[styles.severityRail, { backgroundColor: color }]} />
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightDescription}>{description}</Text>
        {evidence.length > 0 ? (
          <View style={styles.evidenceRow}>
            {evidence.map((item) => (
              <View key={`${item.label}-${item.value}`} style={styles.evidencePill}>
                <Text style={styles.evidenceLabel}>{item.label}</Text>
                <Text style={styles.evidenceValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {reason ? <Text style={styles.reasonText}>{reason}</Text> : null}
        {metric ? <Text style={[styles.metricText, { color }]}>{metric}</Text> : null}
      </View>
    </View>
  );
};

export default function AiCoachScreen() {
  const { showConfirm, showDialog } = useAppDialog();
  const currentMonth = getLocalMonthStr();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudgetRecord[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryRecord[]>([]);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringRecord[]>([]);
  const [coachResponse, setCoachResponse] = useState<FinancialCoachResponse | null>(null);
  const [coachError, setCoachError] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [lastCoachRefreshAt, setLastCoachRefreshAt] = useState("");
  const [transferInProgress, setTransferInProgress] = useState(false);
  const [rolloverInProgress, setRolloverInProgress] = useState(false);
  const [savingActionInProgress, setSavingActionInProgress] = useState(false);
  const [expandedSection, setExpandedSection] = useState<
    "coach" | "review" | "patterns" | "categories" | "actions" | null
  >(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const txQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
    const budgetQuery = query(collection(db, "monthly_budgets"), where("userId", "==", user.uid));
    const categoryQuery = query(
      collection(db, "categories"),
      where("userId", "==", user.uid),
    );
    const goalQuery = query(collection(db, "goals"), where("userId", "==", user.uid));
    const recurringQuery = query(
      collection(db, "recurring_transactions"),
      where("userId", "==", user.uid),
    );

    const unsubscribeTransactions = onSnapshot(txQuery, (snapshot) => {
      setTransactions(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as TransactionRecord[],
      );
    });

    const unsubscribeBudgets = onSnapshot(budgetQuery, (snapshot) => {
      setBudgets(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as MonthlyBudgetRecord[],
      );
    });

    const unsubscribeCategories = onSnapshot(categoryQuery, (snapshot) => {
      setExpenseCategories(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ExpenseCategoryRecord[],
      );
    });

    const unsubscribeGoals = onSnapshot(goalQuery, (snapshot) => {
      setGoals(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as GoalRecord[]);
    });

    const unsubscribeRecurring = onSnapshot(recurringQuery, (snapshot) => {
      setRecurringTransactions(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as RecurringRecord[],
      );
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeBudgets();
      unsubscribeCategories();
      unsubscribeGoals();
      unsubscribeRecurring();
    };
  }, []);

  const currentRawAllocations = useMemo(
    () => budgets.find((budget) => budget.month === currentMonth)?.allocations || {},
    [budgets, currentMonth],
  );

  const currentAllocations = useMemo(
    () => allocationsByCategoryName(currentRawAllocations, expenseCategories),
    [currentRawAllocations, expenseCategories],
  );

  const normalizedBudgets = useMemo(
    () =>
      budgets.map((budget) => ({
        ...budget,
        allocations: allocationsByCategoryName(budget.allocations, expenseCategories),
      })),
    [budgets, expenseCategories],
  );

  const activeExpenseCategories = useMemo(
    () =>
      expenseCategories
        .filter(
          (category) =>
            !category.parentId &&
            category.name &&
            category.type === "Expense" &&
            !category.isGoal &&
            !category.name.startsWith("🎯"),
        )
        .map((category) => category.name as string),
    [expenseCategories],
  );

  const aiInsights = useMemo(
    () =>
      buildFinancialIntelligence({
        activeExpenseCategories:
          activeExpenseCategories.length > 0 ? activeExpenseCategories : undefined,
        budgets: normalizedBudgets,
        currentAllocations,
        goals,
        recurring: recurringTransactions,
        transactions,
      }),
    [
      activeExpenseCategories,
      normalizedBudgets,
      currentAllocations,
      goals,
      recurringTransactions,
      transactions,
    ],
  );

  const insightCards = [
    ...aiInsights.abnormalSpending,
    ...aiInsights.weekendPatterns,
    ...aiInsights.lifestyleChanges,
  ].slice(0, 5);
  const coachCards = [
    ...aiInsights.reactiveAlerts,
    ...aiInsights.underspentRecommendations,
    ...aiInsights.goalRecommendations,
  ].slice(0, 6);
  const highRiskCount = [
    ...aiInsights.abnormalSpending,
    ...aiInsights.reactiveAlerts,
  ].filter((item) => item.severity === "danger" || item.severity === "warning").length;
  const opportunityCount =
    aiInsights.budgetTransfers.length +
    aiInsights.savingOpportunities.length +
    aiInsights.underspentRecommendations.length +
    aiInsights.goalRecommendations.length +
    aiInsights.unusedBudgetOpportunities.length;
  const totalUnusedBudget = aiInsights.unusedBudgetOpportunities.reduce(
    (sum, item) => sum + item.unusedAmount,
    0,
  );
  const goalCategoryName = goals[0]?.title ? `\uD83C\uDFAF ${goals[0].title}` : "";
  const goalCategory = expenseCategories.find(
    (category) =>
      !category.parentId &&
      (category.goalId === goals[0]?.id || category.name === goalCategoryName),
  );
  const goalCategoryKey = goalCategory?.id || goalCategoryName;
  const getBudgetCategoryKey = (categoryName: string) =>
    expenseCategories.find(
      (category) =>
        !category.parentId &&
        category.name?.trim().toLowerCase() === categoryName.trim().toLowerCase(),
    )?.id || categoryName;
  const setBudgetAllocation = (
    baseAllocations: Record<string, number>,
    categoryName: string,
    amount: number,
  ) => {
    const key = getBudgetCategoryKey(categoryName);
    const nextAllocations = { ...baseAllocations, [key]: Number(amount.toFixed(2)) };
    delete nextAllocations[categoryName];
    return nextAllocations;
  };
  const primaryAction =
    coachResponse?.recommendations[0] ||
    coachCards[0]?.description ||
    aiInsights.budgetTransfers[0]?.message ||
    "Keep tracking transactions to strengthen your personal spending baseline.";
  const primaryNotice =
    coachResponse?.notices[0] ||
    insightCards[0]?.description ||
    "No urgent abnormal pattern is visible right now.";

  const coachPayload = useMemo(
    () => ({
      abnormalSpending: aiInsights.abnormalSpending,
      budgetTransfers: aiInsights.budgetTransfers,
      categoryBehaviors: aiInsights.categoryBehaviors,
      goalRecommendations: aiInsights.goalRecommendations,
      lifestyleChanges: aiInsights.lifestyleChanges,
      monthlyReview: aiInsights.monthlyReview,
      reactiveAlerts: aiInsights.reactiveAlerts,
      savingOpportunities: aiInsights.savingOpportunities,
      underspentRecommendations: aiInsights.underspentRecommendations,
      unusedBudgetOpportunities: aiInsights.unusedBudgetOpportunities,
      weekendPatterns: aiInsights.weekendPatterns,
    }),
    [aiInsights],
  );

  useEffect(() => {
    if (transactions.length === 0) {
      setCoachResponse(null);
      setCoachError("");
      setLastCoachRefreshAt("");
    }
  }, [transactions.length]);

  const handleRefreshCoach = async () => {
    if (coachLoading) return;

    if (transactions.length === 0) {
      setCoachResponse(null);
      setCoachError("");
      setLastCoachRefreshAt("");
      showDialog({
        message: "Add transactions first so Gemini has spending patterns to explain.",
        title: "No Data Yet",
        type: "info",
      });
      return;
    }

    setCoachLoading(true);
    setCoachError("");

    try {
      const response = await generateFinancialCoach(currentMonth, coachPayload);
      setCoachResponse(response);
      setLastCoachRefreshAt(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (error) {
      setCoachError(
        error instanceof Error
          ? error.message
          : "Gemini could not generate coaching right now.",
      );
    } finally {
      setCoachLoading(false);
    }
  };

  const toggleSection = (
    section: "coach" | "review" | "patterns" | "categories" | "actions",
  ) => {
    setExpandedSection((current) => (current === section ? null : section));
  };

  const handleBudgetTransfer = async (transfer: BudgetTransferSuggestion) => {
    if (transferInProgress) return;

    const user = auth.currentUser;
    const amount = Number(transfer.amount.toFixed(2));
    const sourceAllocated = Number(currentAllocations[transfer.fromCategory] || 0);
    const targetAllocated = Number(currentAllocations[transfer.toCategory] || 0);

    if (!user) {
      showDialog({
        title: "Login Required",
        message: "Please log in before transferring budget.",
        type: "warning",
      });
      return;
    }

    if (
      amount <= 0 ||
      transfer.fromCategory === transfer.toCategory ||
      sourceAllocated <= 0 ||
      sourceAllocated < amount
    ) {
      showDialog({
        title: "Transfer Unavailable",
        message: "This budget transfer is no longer valid. Please refresh your budget data.",
        type: "warning",
      });
      return;
    }

    const confirmed = await showConfirm({
      title: "Transfer Budget",
      message: `Move RM ${amount.toFixed(2)} from ${transfer.fromCategory} to ${transfer.toCategory}?`,
      confirmLabel: "Transfer",
      type: "confirm",
    });

    if (!confirmed) return;

    setTransferInProgress(true);
    try {
      let nextAllocations = setBudgetAllocation(
        currentRawAllocations,
        transfer.fromCategory,
        Math.max(sourceAllocated - amount, 0),
      );
      nextAllocations = setBudgetAllocation(
        nextAllocations,
        transfer.toCategory,
        targetAllocated + amount,
      );

      await setDoc(
        doc(db, "monthly_budgets", `${user.uid}_${currentMonth}`),
        {
          userId: user.uid,
          month: currentMonth,
          allocations: nextAllocations,
        },
        { merge: true },
      );

      showDialog({
        title: "Budget Transferred",
        message: `RM ${amount.toFixed(2)} has been moved from ${transfer.fromCategory} to ${transfer.toCategory}.`,
        type: "success",
      });
    } catch {
      showDialog({
        title: "Transfer Failed",
        message: "Failed to update your budget. Please try again.",
        type: "error",
      });
    } finally {
      setTransferInProgress(false);
    }
  };

  const addToNextMonthBudget = async (
    category: string,
    amount: number,
    successMessage: string,
  ) => {
    const user = auth.currentUser;
    const nextMonth = getNextMonthStr(currentMonth);

    if (!user) {
      showDialog({
        title: "Login Required",
        message: "Please log in before updating next month's budget.",
        type: "warning",
      });
      return;
    }

    if (!category || amount <= 0) {
      showDialog({
        title: "Rollover Unavailable",
        message: "This unused budget action is no longer valid.",
        type: "warning",
      });
      return;
    }

    setRolloverInProgress(true);
    try {
      const nextBudgetRef = doc(db, "monthly_budgets", `${user.uid}_${nextMonth}`);
      const nextBudgetSnapshot = await getDoc(nextBudgetRef);
      const nextBudgetData = nextBudgetSnapshot.exists()
        ? nextBudgetSnapshot.data()
        : {};
      const nextAllocations = nextBudgetData.allocations || {};
      const nextRolloverIncome = Number(nextBudgetData.rolloverIncome) || 0;
      const categoryKey = getBudgetCategoryKey(category);
      const nextCategoryAmount = Number(
        (getAllocationAmount(nextAllocations, {
          id: categoryKey,
          name: category,
        }) + amount).toFixed(2),
      );
      const normalizedNextAllocations = {
        ...nextAllocations,
        [categoryKey]: nextCategoryAmount,
      };
      delete normalizedNextAllocations[category];

      await setDoc(
        nextBudgetRef,
        {
          userId: user.uid,
          month: nextMonth,
          allocations: normalizedNextAllocations,
          rolloverIncome: Number((nextRolloverIncome + amount).toFixed(2)),
        },
        { merge: true },
      );

      showDialog({
        title: "Next Month Updated",
        message: successMessage,
        type: "success",
      });
    } catch {
      showDialog({
        title: "Update Failed",
        message: "Failed to update next month's budget. Please try again.",
        type: "error",
      });
    } finally {
      setRolloverInProgress(false);
    }
  };

  const handleCarryUnusedBudget = async (opportunity: UnusedBudgetOpportunity) => {
    if (rolloverInProgress) return;

    const currentAllocated = Number(currentAllocations[opportunity.category] || 0);
    const amount = Number(opportunity.unusedAmount.toFixed(2));

    if (currentAllocated <= 0 || amount <= 0 || currentAllocated < amount) {
      showDialog({
        title: "Rollover Unavailable",
        message: "This category no longer has enough unused budget to carry forward.",
        type: "warning",
      });
      return;
    }

    const confirmed = await showConfirm({
      title: "Carry Budget Forward",
      message: `Add RM ${amount.toFixed(2)} from ${opportunity.category} to next month's ${opportunity.category} budget?`,
      confirmLabel: "Carry",
      type: "confirm",
    });

    if (!confirmed) return;

    await addToNextMonthBudget(
      opportunity.category,
      amount,
      `RM ${amount.toFixed(2)} has been added to next month's ${opportunity.category} budget.`,
    );
  };

  const handleMoveUnusedToGoal = async (opportunity: UnusedBudgetOpportunity) => {
    if (rolloverInProgress || !goalCategoryName) return;

    const amount = Number(opportunity.unusedAmount.toFixed(2));
    const confirmed = await showConfirm({
      title: "Plan Goal Budget",
      message: `Assign RM ${amount.toFixed(2)} from ${opportunity.category} to next month's ${goalCategoryName} planned budget?`,
      confirmLabel: "Assign",
      type: "confirm",
    });

    if (!confirmed) return;

    await addToNextMonthBudget(
      goalCategoryName,
      amount,
      `RM ${amount.toFixed(2)} has been assigned to next month's ${goalCategoryName} planned budget.`,
    );
  };

  const executeSavingBudgetAction = async (
    opportunity: InsightItem,
    mode: "reduce" | "goal",
  ) => {
    if (savingActionInProgress) return;

    const user = auth.currentUser;
    const category = opportunity.category || "";
    const currentAllocated = Number(currentAllocations[category] || 0);
    const currentSpent = Number(opportunity.currentAmount || 0);
    const requestedSaving = Number((opportunity.amount || opportunity.impact || 0).toFixed(2));
    const availableReduction = Number(Math.max(currentAllocated - currentSpent, 0).toFixed(2));
    const amount = Number(Math.min(requestedSaving, availableReduction).toFixed(2));

    if (!user) {
      showDialog({
        title: "Login Required",
        message: "Please log in before updating your budget.",
        type: "warning",
      });
      return;
    }

    if (!category || currentAllocated <= 0 || amount <= 0) {
      showDialog({
        title: "Saving Action Unavailable",
        message: "This recommendation can no longer be applied because the budget has changed.",
        type: "warning",
      });
      return;
    }

    if (mode === "goal" && !goalCategoryName) return;

    const confirmed = await showConfirm({
      title: mode === "goal" ? "Plan Goal Budget" : "Reduce Category Budget",
      message:
        mode === "goal"
          ? `Reduce ${category} by RM ${amount.toFixed(2)} and assign it to ${goalCategoryName} planned budget?`
          : `Reduce ${category} budget by RM ${amount.toFixed(2)}?`,
      confirmLabel: mode === "goal" ? "Assign" : "Reduce",
      type: "confirm",
    });

    if (!confirmed) return;

    setSavingActionInProgress(true);
    try {
      let nextAllocations = setBudgetAllocation(
        currentRawAllocations,
        category,
        Math.max(currentAllocated - amount, currentSpent),
      );

      if (mode === "goal") {
        nextAllocations = setBudgetAllocation(
          nextAllocations,
          goalCategoryName,
          Number(currentAllocations[goalCategoryName] || currentAllocations[goalCategoryKey] || 0) + amount,
        );
      }

      await setDoc(
        doc(db, "monthly_budgets", `${user.uid}_${currentMonth}`),
        {
          userId: user.uid,
          month: currentMonth,
          allocations: nextAllocations,
        },
        { merge: true },
      );

      showDialog({
        title: mode === "goal" ? "Goal Budget Planned" : "Budget Reduced",
        message:
          mode === "goal"
            ? `RM ${amount.toFixed(2)} was assigned from ${category} to ${goalCategoryName} planned budget.`
            : `RM ${amount.toFixed(2)} was released from ${category}.`,
        type: "success",
      });
    } catch {
      showDialog({
        title: "Update Failed",
        message: "Failed to update your budget. Please try again.",
        type: "error",
      });
    } finally {
      setSavingActionInProgress(false);
    }
  };

  const firstTransfer = aiInsights.budgetTransfers[0];
  const firstUnusedBudget = aiInsights.unusedBudgetOpportunities[0];
  const firstSavingOpportunity = aiInsights.savingOpportunities[0];
  const focusItems: FocusItem[] = [
    firstTransfer
      ? {
          actionLabel: "Transfer",
          description: firstTransfer.message,
          disabled: transferInProgress,
          icon: "swap-horizontal",
          meta: `${firstTransfer.fromCategory} to ${firstTransfer.toCategory}`,
          onPress: () => handleBudgetTransfer(firstTransfer),
          title: `Move RM ${firstTransfer.amount.toFixed(2)}`,
          tone: "primary",
        }
      : null,
    firstUnusedBudget
      ? {
          actionLabel: "Carry",
          description: firstUnusedBudget.message,
          disabled: rolloverInProgress,
          icon: "archive-outline",
          meta: `${firstUnusedBudget.category} has unused budget`,
          onPress: () => handleCarryUnusedBudget(firstUnusedBudget),
          title: `Carry RM ${firstUnusedBudget.unusedAmount.toFixed(0)}`,
          tone: "success",
        }
      : null,
    firstSavingOpportunity
      ? {
          actionLabel: "Review",
          description: firstSavingOpportunity.description,
          disabled: savingActionInProgress,
          icon: "leaf-outline",
          meta: firstSavingOpportunity.category || "Saving opportunity",
          onPress: () => executeSavingBudgetAction(firstSavingOpportunity, "reduce"),
          title: firstSavingOpportunity.title,
          tone: "success",
        }
      : null,
    {
      description: primaryAction,
      icon: highRiskCount > 0 ? "warning-outline" : "sparkles-outline",
      meta: coachResponse
        ? `${coachResponse.tone} coaching${lastCoachRefreshAt ? ` · ${lastCoachRefreshAt}` : ""}`
        : "Manual Gemini refresh",
      title: highRiskCount > 0 ? "Review this month's risk" : "Keep building your baseline",
      tone: highRiskCount > 0 ? "warning" : "primary",
    },
  ].filter(Boolean).slice(0, 3) as FocusItem[];

  const compactSignals = [...insightCards, ...aiInsights.reactiveAlerts].slice(0, 3);
  const coachStateTitle = highRiskCount > 0 ? "This month needs attention" : "Your month looks steady";
  const coachStateIcon = highRiskCount > 0 ? "alert-circle" : "shield-checkmark";
  const coachStateTone: FocusTone = highRiskCount > 0 ? "warning" : "success";

  const getToneColor = (tone: FocusTone) => {
    if (tone === "danger") return palette.danger;
    if (tone === "success") return palette.success;
    if (tone === "warning") return palette.warning;
    return palette.primary;
  };

  const getToneSoftColor = (tone: FocusTone) => {
    if (tone === "danger") return palette.dangerSoft;
    if (tone === "success") return palette.successSoft;
    if (tone === "warning") return palette.warningSoft;
    return palette.primarySoft;
  };

  const FocusCard = ({ item }: { item: FocusItem }) => {
    const color = getToneColor(item.tone);
    return (
      <View style={styles.focusCard}>
        <View style={[styles.focusIcon, { backgroundColor: getToneSoftColor(item.tone) }]}>
          <Ionicons name={item.icon} size={22} color={color} />
        </View>
        <View style={styles.focusCopy}>
          <View style={styles.focusTopRow}>
            <Text style={styles.focusMeta} numberOfLines={1}>{item.meta}</Text>
            {item.actionLabel ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={item.disabled}
                onPress={item.onPress}
                style={[
                  styles.focusActionButton,
                  { backgroundColor: color },
                  item.disabled && styles.focusActionDisabled,
                ]}
              >
                <Text style={styles.focusActionText}>{item.actionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.focusTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.focusDescription} numberOfLines={3}>
            {item.description}
          </Text>
        </View>
      </View>
    );
  };

  const SignalRow = ({ item }: { item: InsightItem }) => {
    const color = getSeverityColor(item.severity);
    return (
      <View style={styles.signalRowCompact}>
        <View style={[styles.signalDot, { backgroundColor: color }]} />
        <View style={styles.signalRowCopy}>
          <Text style={styles.signalRowTitle}>{item.title}</Text>
          <Text style={styles.signalRowText} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
        {item.differencePercent !== undefined ? (
          <Text style={[styles.signalMetric, { color }]}>
            {formatPercent(item.differencePercent)}
          </Text>
        ) : null}
      </View>
    );
  };

  const SectionToggle = ({
    count,
    section,
    title,
  }: {
    count?: number;
    section: "coach" | "review" | "patterns" | "categories" | "actions";
    title: string;
  }) => {
    const expanded = expandedSection === section;

    return (
      <TouchableOpacity style={styles.sectionToggle} onPress={() => toggleSection(section)}>
        <View>
          <Text style={styles.sectionToggleTitle}>{title}</Text>
          {typeof count === "number" ? (
            <Text style={styles.sectionToggleMeta}>{count} items</Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={palette.textMuted}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AppHeader
        rightAction={{
          accessibilityLabel: "Refresh AI Coach",
          color: palette.primary,
          icon: coachLoading ? "hourglass-outline" : "refresh-outline",
          onPress: handleRefreshCoach,
        }}
        title="AI Coach"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.coachSummary}>
          <View style={styles.coachSummaryHeader}>
            <View
              style={[
                styles.coachStateIcon,
                { backgroundColor: getToneSoftColor(coachStateTone) },
              ]}
            >
              {coachLoading ? (
                <ActivityIndicator color={getToneColor(coachStateTone)} />
              ) : (
                <Ionicons
                  name={coachStateIcon}
                  size={24}
                  color={getToneColor(coachStateTone)}
                />
              )}
            </View>
            <View style={styles.coachSummaryCopy}>
              <Text style={styles.coachStateLabel}>{currentMonth}</Text>
              <Text style={styles.coachStateTitle}>
                {coachResponse?.headline || coachStateTitle}
              </Text>
              <Text style={styles.coachStateText}>
                {coachResponse?.summary ||
                  `${primaryNotice} Refresh only when you want Gemini to write updated guidance.`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={coachLoading}
            onPress={handleRefreshCoach}
            style={[
              styles.refreshCoachButton,
              coachLoading && styles.refreshCoachButtonDisabled,
            ]}
          >
            {coachLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Ionicons name="refresh" size={17} color="#FFF" />
            )}
            <Text style={styles.refreshCoachButtonText}>
              {coachLoading
                ? "Refreshing"
                : coachResponse
                  ? "Refresh Gemini Coach"
                  : "Generate Gemini Coach"}
            </Text>
          </TouchableOpacity>

          {lastCoachRefreshAt ? (
            <Text style={styles.coachRefreshMeta}>
              Last refreshed {lastCoachRefreshAt}
            </Text>
          ) : null}

          {coachError ? (
            <Text style={styles.geminiError}>
              Gemini is unavailable right now. Showing rule-based insights below.
            </Text>
          ) : null}

          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{highRiskCount}</Text>
              <Text style={styles.quickStatLabel}>Risks</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>{opportunityCount}</Text>
              <Text style={styles.quickStatLabel}>Actions</Text>
            </View>
            <View style={styles.quickStatItem}>
              <Text style={styles.quickStatValue}>
                {aiInsights.categoryBehaviors.length}
              </Text>
              <Text style={styles.quickStatLabel}>Categories</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Focus Today</Text>
          <View style={styles.focusList}>
            {focusItems.map((item, index) => (
              <FocusCard key={`${item.title}-${index}`} item={item} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Signals</Text>
          <View style={styles.compactSignalPanel}>
            {compactSignals.length > 0 ? (
              compactSignals.map((item, index) => (
                <SignalRow key={`${item.title}-${index}`} item={item} />
              ))
            ) : (
              <Text style={styles.emptyText}>
                No abnormal pattern detected yet. Keep recording transactions for a stronger
                personal baseline.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More Details</Text>
          <SectionToggle
            count={
              (coachResponse?.notices.length || 0) +
              (coachResponse?.recommendations.length || 0) +
              (coachResponse?.nextMonthActions.length || 0)
            }
            section="coach"
            title="Gemini coach details"
          />
          {expandedSection === "coach" && (
            <View style={styles.expandedContent}>
              <View style={styles.detailPanel}>
              {coachResponse?.notices.length ? (
                <>
                  <Text style={styles.geminiSubTitle}>Spending notices</Text>
                  {coachResponse.notices.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.geminiBullet}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </>
              ) : null}

              {coachResponse?.recommendations.length ? (
                <>
                  <Text style={styles.geminiSubTitle}>Recommended actions</Text>
                  {coachResponse.recommendations.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.geminiBullet}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </>
              ) : null}

              {coachResponse?.nextMonthActions.length ? (
                <>
                  <Text style={styles.geminiSubTitle}>Next month</Text>
                  {coachResponse.nextMonthActions.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.geminiBullet}>
                      {index + 1}. {item}
                    </Text>
                  ))}
                </>
              ) : null}
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle
            count={aiInsights.monthlyReview.length}
            section="review"
            title="Analytical review (3 months)"
          />
          {expandedSection === "review" && (
            <View style={styles.expandedContent}>
              <View style={styles.reviewCard}>
              {aiInsights.monthlyReview.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.reviewLine}>
                  <Text style={styles.reviewNumber}>{index + 1}</Text>
                  <Text style={styles.reviewText}>{item}</Text>
                </View>
              ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle count={insightCards.length} section="patterns" title="Insight engine details" />
          {expandedSection === "patterns" && (
            <View style={styles.expandedContent}>
              {insightCards.length > 0 ? (
                insightCards.map((item, index) => (
                  <InsightCard key={`${item.title}-${index}`} {...item} />
                ))
              ) : (
                <Text style={styles.emptyText}>
                  No abnormal pattern detected yet. More transaction history will improve the
                  personal baseline.
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle
            count={aiInsights.categoryBehaviors.length}
            section="categories"
            title="Category behavior"
          />
          {expandedSection === "categories" && (
            <View style={styles.expandedContent}>
              {aiInsights.categoryBehaviors.slice(0, 6).map((item) => (
              <View key={item.category} style={styles.behaviorRow}>
                <View style={styles.behaviorCopy}>
                  <Text style={styles.behaviorCategory} numberOfLines={1}>{item.category}</Text>
                  <Text style={styles.behaviorDescription}>{item.description}</Text>
                  <Text style={styles.behaviorEvidence}>
                    Average RM {item.averageMonthly.toFixed(0)}
                    {item.currentAmount !== undefined
                      ? ` · Current RM ${item.currentAmount.toFixed(0)}`
                      : ""}
                    {item.confidence ? ` · ${item.confidence} confidence` : ""}
                  </Text>
                  {item.reason ? (
                    <Text style={styles.behaviorReason}>{item.reason}</Text>
                  ) : null}
                </View>
                <Text style={styles.behaviorTag}>{item.behavior}</Text>
              </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle
            count={
              aiInsights.savingOpportunities.length +
              coachCards.length +
              aiInsights.budgetTransfers.length +
              aiInsights.unusedBudgetOpportunities.length
            }
            section="actions"
            title="Budget actions"
          />
          {expandedSection === "actions" && (
            <View style={styles.expandedContent}>
              {aiInsights.unusedBudgetOpportunities.length > 0 && (
                <View style={styles.unusedSummaryCard}>
                  <View style={styles.unusedSummaryHeader}>
                    <View>
                      <Text style={styles.unusedSummaryTitle}>Unused Budget</Text>
                      <Text style={styles.unusedSummaryMeta}>
                        RM {totalUnusedBudget.toFixed(2)} available to carry forward
                      </Text>
                    </View>
                    <Ionicons name="archive-outline" size={24} color={palette.success} />
                  </View>

                  {aiInsights.unusedBudgetOpportunities.slice(0, 4).map((item) => (
                    <View key={item.category} style={styles.unusedItem}>
                      <View style={styles.unusedItemHeader}>
                        <View style={styles.unusedInfo}>
                          <Text style={styles.unusedCategory} numberOfLines={1}>{item.category}</Text>
                          <Text style={styles.unusedMeta}>
                            RM {item.spent.toFixed(0)} used / RM {item.allocated.toFixed(0)} budget
                          </Text>
                        </View>
                        <Text style={styles.unusedAmount} numberOfLines={1}>
                          RM {item.unusedAmount.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.unusedMessage}>{item.message}</Text>
                      <View style={styles.unusedActions}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          disabled={rolloverInProgress}
                          onPress={() => handleCarryUnusedBudget(item)}
                          style={[
                            styles.unusedButton,
                            rolloverInProgress && styles.transferButtonDisabled,
                          ]}
                        >
                          {rolloverInProgress ? (
                            <ActivityIndicator color="#FFF" />
                          ) : (
                            <>
                              <Ionicons name="arrow-forward-circle" size={18} color="#FFF" />
                              <Text style={styles.unusedButtonText}>Carry</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        {goalCategoryName ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={rolloverInProgress}
                            onPress={() => handleMoveUnusedToGoal(item)}
                            style={[
                              styles.unusedSecondaryButton,
                              rolloverInProgress && styles.transferButtonDisabled,
                            ]}
                          >
                            <Ionicons name="flag-outline" size={18} color={palette.primary} />
                            <Text style={styles.unusedSecondaryButtonText}>Goal</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {aiInsights.savingOpportunities.map((item) => {
                const category = item.category || "";
                const currentAllocated = Number(currentAllocations[category] || 0);
                const currentSpent = Number(item.currentAmount || 0);
                const requestedSaving = Number((item.amount || item.impact || 0).toFixed(2));
                const availableReduction = Number(
                  Math.max(currentAllocated - currentSpent, 0).toFixed(2),
                );
                const canAdjustBudget =
                  availableReduction > 0 &&
                  Math.min(requestedSaving, availableReduction) > 0;

                return (
                  <View key={`${item.category}-${item.title}`} style={styles.savingActionCard}>
                    <View style={styles.transferHeader}>
                      <View style={styles.savingIcon}>
                        <Ionicons name="leaf-outline" size={22} color={palette.success} />
                      </View>
                      <View style={styles.transferSummary}>
                        <Text style={styles.savingTitle} numberOfLines={1}>
                          Save RM {Number(item.amount || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.transferRoute} numberOfLines={1}>
                          {item.category}
                        </Text>
                      </View>
                    </View>
                    <InsightCard
                      {...item}
                      evidenceLabels={{
                        baseline: "Budget",
                        current: "Spent",
                        difference: "Potential",
                        percent: "Target",
                      }}
                    />
                    <View style={styles.savingActions}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={savingActionInProgress || !canAdjustBudget}
                        onPress={() => executeSavingBudgetAction(item, "reduce")}
                        style={[
                          styles.savingButton,
                          (savingActionInProgress || !canAdjustBudget) &&
                            styles.transferButtonDisabled,
                        ]}
                      >
                        {savingActionInProgress ? (
                          <ActivityIndicator color="#FFF" />
                        ) : (
                          <>
                            <Ionicons
                              name={canAdjustBudget ? "remove-circle" : "lock-closed-outline"}
                              size={18}
                              color="#FFF"
                            />
                            <Text style={styles.savingButtonText}>
                              {canAdjustBudget ? "Adjust Budget" : "Budget Used"}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {goalCategoryName ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          disabled={savingActionInProgress || !canAdjustBudget}
                          onPress={() => executeSavingBudgetAction(item, "goal")}
                          style={[
                            styles.savingSecondaryButton,
                            (savingActionInProgress || !canAdjustBudget) &&
                              styles.transferButtonDisabled,
                          ]}
                        >
                          <Ionicons name="flag-outline" size={18} color={palette.success} />
                          <Text style={styles.savingSecondaryButtonText}>Plan Goal</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {coachCards.length > 0 ? (
                coachCards.map((item, index) => (
                  <InsightCard key={`${item.title}-${index}`} {...item} />
                ))
              ) : aiInsights.savingOpportunities.length === 0 ? (
                <Text style={styles.emptyText}>
                  No urgent action is needed. Keep recording transactions for stronger guidance.
                </Text>
              ) : null}

              {aiInsights.budgetTransfers.map((item) => (
                <View key={`${item.fromCategory}-${item.toCategory}`} style={styles.transferCard}>
                  <View style={styles.transferHeader}>
                    <View style={styles.transferIcon}>
                      <Ionicons name="swap-horizontal" size={22} color={palette.primary} />
                    </View>
                    <View style={styles.transferSummary}>
                      <Text style={styles.transferTitle} numberOfLines={1}>
                        RM {Number(item.amount).toFixed(2)}
                      </Text>
                      <Text style={styles.transferRoute} numberOfLines={1}>
                        {item.fromCategory} to {item.toCategory}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.transferText}>{item.message}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={transferInProgress}
                    onPress={() => handleBudgetTransfer(item)}
                    style={[
                      styles.transferButton,
                      transferInProgress && styles.transferButtonDisabled,
                    ]}
                  >
                    {transferInProgress ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={styles.transferButtonText}>Transfer</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 140,
  },
  coachSummary: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  coachSummaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  coachStateIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 48,
    justifyContent: "center",
    marginRight: 12,
    width: 48,
  },
  coachSummaryCopy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  coachStateLabel: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  coachStateTitle: {
    color: palette.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 27,
  },
  coachStateText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 7,
  },
  refreshCoachButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginTop: 16,
    minHeight: 42,
    paddingHorizontal: 16,
  },
  refreshCoachButtonDisabled: {
    opacity: 0.72,
  },
  refreshCoachButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 8,
  },
  coachRefreshMeta: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  quickStatsRow: {
    flexDirection: "row",
    marginTop: 18,
  },
  quickStatItem: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    flex: 1,
    marginRight: 8,
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  quickStatValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
  },
  quickStatLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3,
    textTransform: "uppercase",
  },
  focusList: {
    marginTop: 2,
  },
  focusCard: {
    alignItems: "flex-start",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
    ...shadow.subtle,
  },
  focusIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  focusCopy: {
    flex: 1,
    minWidth: 0,
  },
  focusTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  focusMeta: {
    color: palette.textMuted,
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    marginRight: 8,
    textTransform: "uppercase",
  },
  focusActionButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    minWidth: 66,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  focusActionDisabled: {
    opacity: 0.65,
  },
  focusActionText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
  },
  focusTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  focusDescription: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 5,
  },
  compactSignalPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    ...shadow.subtle,
  },
  signalRowCompact: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginBottom: 12,
  },
  signalDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 10,
    marginTop: 6,
    width: 8,
  },
  signalRowCopy: {
    flex: 1,
  },
  signalRowTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  signalRowText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3,
  },
  signalMetric: {
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 8,
    marginTop: 2,
  },
  hero: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    ...shadow.card,
  },
  heroHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 20,
    height: 48,
    justifyContent: "center",
    marginBottom: 14,
    width: 48,
  },
  heroCopy: {
    flex: 1,
    marginLeft: 12,
  },
  heroTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 3,
  },
  statusGrid: {
    flexDirection: "row",
    marginTop: 18,
  },
  statusItem: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    flex: 1,
    marginRight: 8,
    padding: 12,
  },
  statusValue: {
    color: palette.primary,
    fontSize: 22,
    fontWeight: "900",
  },
  statusLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  reviewLine: {
    flexDirection: "row",
    marginBottom: 10,
  },
  reviewNumber: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "900",
    width: 24,
  },
  reviewText: {
    color: palette.textMuted,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  geminiCard: {
    backgroundColor: palette.surface,
    borderColor: palette.primarySoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.card,
  },
  geminiHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  geminiIcon: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    marginRight: 10,
    width: 34,
  },
  geminiHeaderText: {
    flex: 1,
  },
  geminiHeadline: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "900",
  },
  geminiTone: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "capitalize",
  },
  geminiSummary: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  geminiError: {
    color: palette.warning,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
  },
  geminiSubTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
    marginTop: 14,
  },
  geminiBullet: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 4,
  },
  priorityCard: {
    alignItems: "flex-start",
    backgroundColor: palette.primarySoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    marginTop: 14,
    padding: 12,
  },
  priorityIcon: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginRight: 10,
    width: 32,
  },
  priorityCopy: {
    flex: 1,
  },
  priorityLabel: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  priorityText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  signalCard: {
    alignItems: "flex-start",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    padding: 14,
    ...shadow.subtle,
  },
  signalIcon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 10,
    width: 36,
  },
  signalCopy: {
    flex: 1,
  },
  signalTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  signalText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  sectionToggle: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    ...shadow.subtle,
  },
  sectionToggleTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
  },
  sectionToggleMeta: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  expandedContent: {
    marginTop: 10,
  },
  detailPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  insightCard: {
    alignItems: "stretch",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    overflow: "hidden",
    ...shadow.subtle,
  },
  severityRail: {
    width: 5,
  },
  insightBody: {
    flex: 1,
    padding: 14,
  },
  insightTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 5,
  },
  insightDescription: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  evidencePill: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 6,
    marginRight: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  evidenceLabel: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  evidenceValue: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  reasonText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  metricText: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 7,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  behaviorRow: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    ...shadow.subtle,
  },
  behaviorCopy: {
    marginBottom: 10,
  },
  behaviorCategory: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "900",
  },
  behaviorDescription: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 4,
  },
  behaviorEvidence: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 7,
  },
  behaviorReason: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 5,
  },
  behaviorTag: {
    alignSelf: "flex-start",
    backgroundColor: palette.primarySoft,
    borderRadius: radius.pill,
    color: palette.primary,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  transferCard: {
    backgroundColor: palette.primarySoft,
    borderRadius: radius.lg,
    marginBottom: 10,
    padding: 14,
  },
  transferHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 10,
  },
  transferIcon: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 10,
    width: 36,
  },
  transferSummary: {
    flex: 1,
    minWidth: 0,
  },
  transferTitle: {
    color: palette.primary,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "900",
  },
  transferRoute: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  transferText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
  },
  savingActionCard: {
    backgroundColor: palette.successSoft,
    borderColor: "#CFEBD7",
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  savingIcon: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    marginRight: 10,
    width: 36,
  },
  savingTitle: {
    color: palette.success,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "900",
  },
  savingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  savingButton: {
    alignItems: "center",
    backgroundColor: palette.success,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginRight: 8,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  savingButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
  savingSecondaryButton: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: "#CFEBD7",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  savingSecondaryButtonText: {
    color: palette.success,
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
  transferButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  transferButtonDisabled: {
    opacity: 0.65,
  },
  transferButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 6,
  },
  unusedSummaryCard: {
    backgroundColor: palette.successSoft,
    borderColor: "#CFEBD7",
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  unusedSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  unusedSummaryTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
  },
  unusedSummaryMeta: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  unusedItem: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    marginBottom: 10,
    padding: 12,
  },
  unusedItemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  unusedInfo: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  unusedCategory: {
    color: palette.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  unusedMeta: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  unusedAmount: {
    color: palette.success,
    flexShrink: 0,
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 10,
    maxWidth: "42%",
    textAlign: "right",
  },
  unusedMessage: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8,
  },
  unusedActions: {
    flexDirection: "row",
    marginTop: 10,
  },
  unusedButton: {
    alignItems: "center",
    backgroundColor: palette.success,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  unusedButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
  unusedSecondaryButton: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderRadius: radius.pill,
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  unusedSecondaryButtonText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
});
