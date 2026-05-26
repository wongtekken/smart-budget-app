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
  TextInput,
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

type ExpenseCategoryRecord = {
  id: string;
  name?: string;
  parentId?: string | null;
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

const parsePurchaseQuery = (queryText: string) => {
  const text = queryText.trim();
  if (!text) return { amount: 0, label: "planned purchase", warning: "" };

  const rmMatch =
    text.match(/rm\s*([0-9][0-9,]*(?:\.\d+)?)/i) ||
    text.match(/([0-9][0-9,]*(?:\.\d+)?)\s*rm/i);
  const numberMatches = Array.from(text.matchAll(/[0-9][0-9,]*(?:\.\d+)?/g));
  const chosenMatch = rmMatch
    ? { index: rmMatch.index || 0, value: rmMatch[0] }
    : numberMatches
        .map((match) => ({
          index: match.index || 0,
          value: match[0],
          amount: Number(match[0].replace(/,/g, "")),
        }))
        .filter((match) => match.amount >= 10)
        .pop();
  const amountText = rmMatch ? rmMatch[1] : chosenMatch?.value;
  const amount = Number(String(amountText || "").replace(/,/g, "")) || 0;

  if (amount <= 0) {
    return {
      amount: 0,
      label: "planned purchase",
      warning: "Include an amount, for example: Can I buy a PS5 for RM2500?",
    };
  }

  const amountPhrase = chosenMatch?.value || amountText || "";
  const label = text
    .replace(new RegExp(amountPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
    .replace(/\brm\b/gi, " ")
    .replace(/\b(can|could|should|may|i|we|buy|afford|get|purchase|spend|on|for|a|an|the|if|want|to|this|that)\b/gi, " ")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { amount, label: label || "planned purchase", warning: "" };
};

const InsightCard = ({
  baselineAmount,
  confidence,
  currentAmount,
  description,
  differenceAmount,
  differencePercent,
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
>) => {
  const color = getSeverityColor(severity);
  const evidence = [
    currentAmount !== undefined ? { label: "Current", value: formatAmount(currentAmount) } : null,
    baselineAmount !== undefined ? { label: "Baseline", value: formatAmount(baselineAmount) } : null,
    differenceAmount !== undefined ? { label: "Diff", value: formatAmount(differenceAmount) } : null,
    differencePercent !== undefined ? { label: "Change", value: formatPercent(differencePercent) } : null,
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
  const [plannedPurchase, setPlannedPurchase] = useState("");
  const [coachResponse, setCoachResponse] = useState<FinancialCoachResponse | null>(null);
  const [coachError, setCoachError] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
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
      where("type", "==", "Expense"),
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

  const currentAllocations = useMemo(
    () => budgets.find((budget) => budget.month === currentMonth)?.allocations || {},
    [budgets, currentMonth],
  );

  const activeExpenseCategories = useMemo(
    () =>
      expenseCategories
        .filter((category) => !category.parentId && category.name)
        .map((category) => category.name as string),
    [expenseCategories],
  );

  const aiInsights = useMemo(
    () =>
      buildFinancialIntelligence({
        activeExpenseCategories:
          activeExpenseCategories.length > 0 ? activeExpenseCategories : undefined,
        budgets,
        currentAllocations,
        goals,
        recurring: recurringTransactions,
        transactions,
      }),
    [
      activeExpenseCategories,
      budgets,
      currentAllocations,
      goals,
      recurringTransactions,
      transactions,
    ],
  );

  const purchaseQuery = useMemo(() => parsePurchaseQuery(plannedPurchase), [plannedPurchase]);
  const purchaseAmount = purchaseQuery.amount;
  const purchaseSimulation = useMemo(
    () =>
      purchaseAmount > 0
        ? aiInsights.whatIfSimulation(purchaseAmount, purchaseQuery.label)
        : null,
    [aiInsights, purchaseAmount, purchaseQuery.label],
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
    aiInsights.savingOpportunities.length +
    aiInsights.underspentRecommendations.length +
    aiInsights.goalRecommendations.length +
    aiInsights.unusedBudgetOpportunities.length;
  const totalUnusedBudget = aiInsights.unusedBudgetOpportunities.reduce(
    (sum, item) => sum + item.unusedAmount,
    0,
  );
  const goalCategoryName = goals[0]?.title ? `\uD83C\uDFAF ${goals[0].title}` : "";
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
      return;
    }

    let isActive = true;
    const timeoutId = setTimeout(() => {
      setCoachLoading(true);
      setCoachError("");

      generateFinancialCoach(currentMonth, coachPayload, purchaseSimulation)
        .then((response) => {
          if (isActive) setCoachResponse(response);
        })
        .catch((error) => {
          if (!isActive) return;
          setCoachError(
            error instanceof Error
              ? error.message
              : "Gemini could not generate coaching right now.",
          );
        })
        .finally(() => {
          if (isActive) setCoachLoading(false);
        });
    }, 600);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [coachPayload, currentMonth, purchaseSimulation, transactions.length]);

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
      const nextAllocations = {
        ...currentAllocations,
        [transfer.fromCategory]: Number(Math.max(sourceAllocated - amount, 0).toFixed(2)),
        [transfer.toCategory]: Number((targetAllocated + amount).toFixed(2)),
      };

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
      const nextAllocations = nextBudgetSnapshot.exists()
        ? nextBudgetSnapshot.data().allocations || {}
        : {};

      await setDoc(
        nextBudgetRef,
        {
          userId: user.uid,
          month: nextMonth,
          allocations: {
            ...nextAllocations,
            [category]: Number((Number(nextAllocations[category] || 0) + amount).toFixed(2)),
          },
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
      title: "Move to Goal",
      message: `Move RM ${amount.toFixed(2)} from ${opportunity.category} to next month's ${goalCategoryName} budget?`,
      confirmLabel: "Move",
      type: "confirm",
    });

    if (!confirmed) return;

    await addToNextMonthBudget(
      goalCategoryName,
      amount,
      `RM ${amount.toFixed(2)} has been moved to next month's ${goalCategoryName} budget.`,
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
      title: mode === "goal" ? "Move Saving to Goal" : "Reduce Category Budget",
      message:
        mode === "goal"
          ? `Reduce ${category} by RM ${amount.toFixed(2)} and move it to ${goalCategoryName}?`
          : `Reduce ${category} budget by RM ${amount.toFixed(2)}?`,
      confirmLabel: mode === "goal" ? "Move" : "Reduce",
      type: "confirm",
    });

    if (!confirmed) return;

    setSavingActionInProgress(true);
    try {
      const nextAllocations = {
        ...currentAllocations,
        [category]: Number(Math.max(currentAllocated - amount, currentSpent).toFixed(2)),
      };

      if (mode === "goal") {
        nextAllocations[goalCategoryName] = Number(
          (Number(nextAllocations[goalCategoryName] || 0) + amount).toFixed(2),
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
        title: mode === "goal" ? "Saving Moved" : "Budget Reduced",
        message:
          mode === "goal"
            ? `RM ${amount.toFixed(2)} was moved from ${category} to ${goalCategoryName}.`
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
          accessibilityLabel: "AI Coach options",
          icon: "sparkles-outline",
        }}
        title="AI Coach"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIcon}>
              <Ionicons name="sparkles" size={26} color="#FFF" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>AI Financial Coach</Text>
              <Text style={styles.heroSubtitle}>{currentMonth}</Text>
            </View>
          </View>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusValue}>{highRiskCount}</Text>
              <Text style={styles.statusLabel}>Risks</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusValue}>{opportunityCount}</Text>
              <Text style={styles.statusLabel}>Opportunities</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusValue}>{aiInsights.categoryBehaviors.length}</Text>
              <Text style={styles.statusLabel}>Categories</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.geminiCard}>
            <View style={styles.geminiHeader}>
              <View style={styles.geminiIcon}>
                {coachLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Ionicons name="sparkles" size={18} color="#FFF" />
                )}
              </View>
              <View style={styles.geminiHeaderText}>
                <Text style={styles.geminiHeadline}>
                  {coachResponse?.headline || "Generating personalized guidance"}
                </Text>
                <Text style={styles.geminiTone}>
                  {coachResponse
                    ? `${coachResponse.tone} coaching`
                    : "Powered by structured insights"}
                </Text>
              </View>
            </View>

            {coachError ? (
              <Text style={styles.geminiError}>
                Gemini is unavailable right now. Showing rule-based insights below.
              </Text>
            ) : (
              <Text style={styles.geminiSummary}>
                {coachResponse?.summary ||
                  "Gemini will turn your detected spending patterns into practical financial guidance."}
              </Text>
            )}

            <View style={styles.priorityCard}>
              <View style={styles.priorityIcon}>
                <Ionicons name="flash" size={18} color={palette.primary} />
              </View>
              <View style={styles.priorityCopy}>
                <Text style={styles.priorityLabel}>Priority action</Text>
                <Text style={styles.priorityText} numberOfLines={3}>
                  {primaryAction}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Signal</Text>
          <View style={styles.signalCard}>
            <View style={styles.signalIcon}>
              <Ionicons
                name={highRiskCount > 0 ? "warning" : "shield-checkmark"}
                size={22}
                color={highRiskCount > 0 ? palette.warning : palette.success}
              />
            </View>
            <View style={styles.signalCopy}>
              <Text style={styles.signalTitle}>
                {highRiskCount > 0 ? "Attention needed" : "No urgent risk"}
              </Text>
              <Text style={styles.signalText} numberOfLines={3}>
                {primaryNotice}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What-If Purchase Simulation</Text>
          <View style={styles.simulatorCard}>
            <Text style={styles.simulatorLabel}>Ask about a planned purchase</Text>
            <View style={styles.simulatorInputRow}>
              <TextInput
                onChangeText={setPlannedPurchase}
                placeholder="Can I buy a PS5 for RM2500?"
                placeholderTextColor={palette.textSoft}
                style={styles.simulatorInput}
                value={plannedPurchase}
              />
            </View>
            {purchaseQuery.warning ? (
              <Text style={styles.simulatorWarning}>{purchaseQuery.warning}</Text>
            ) : null}
            {purchaseSimulation ? (
              <InsightCard
                confidence={purchaseSimulation.severity === "danger" ? "High" : "Medium"}
                currentAmount={purchaseAmount}
                description={purchaseSimulation.message}
                metric={`Projected balance: RM ${purchaseSimulation.projectedBalance.toFixed(0)}`}
                reason="Simulation uses this month's income, expenses, fixed recurring costs, and the planned purchase amount."
                severity={purchaseSimulation.severity}
                title={`Purchase impact: ${purchaseQuery.label}`}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
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
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle count={aiInsights.monthlyReview.length} section="review" title="Analytical review" />
          {expandedSection === "review" && (
            <View style={styles.reviewCard}>
              {aiInsights.monthlyReview.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.reviewLine}>
                  <Text style={styles.reviewNumber}>{index + 1}</Text>
                  <Text style={styles.reviewText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle count={insightCards.length} section="patterns" title="Insight engine details" />
          {expandedSection === "patterns" && (
            <>
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
            </>
          )}
        </View>

        <View style={styles.section}>
          <SectionToggle
            count={aiInsights.categoryBehaviors.length}
            section="categories"
            title="Category behavior"
          />
          {expandedSection === "categories" &&
            aiInsights.categoryBehaviors.slice(0, 6).map((item) => (
              <View key={item.category} style={styles.behaviorRow}>
                <View style={styles.behaviorCopy}>
                  <Text style={styles.behaviorCategory}>{item.category}</Text>
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
            <>
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
                        <View>
                          <Text style={styles.unusedCategory}>{item.category}</Text>
                          <Text style={styles.unusedMeta}>
                            RM {item.spent.toFixed(0)} used / RM {item.allocated.toFixed(0)} budget
                          </Text>
                        </View>
                        <Text style={styles.unusedAmount}>
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

              {aiInsights.savingOpportunities.map((item) => (
                <View key={`${item.category}-${item.title}`} style={styles.savingActionCard}>
                  <View style={styles.transferHeader}>
                    <View style={styles.savingIcon}>
                      <Ionicons name="leaf-outline" size={22} color={palette.success} />
                    </View>
                    <View style={styles.transferSummary}>
                      <Text style={styles.savingTitle}>
                        Save RM {Number(item.amount || 0).toFixed(2)}
                      </Text>
                      <Text style={styles.transferRoute} numberOfLines={1}>
                        {item.category}
                      </Text>
                    </View>
                  </View>
                  <InsightCard {...item} />
                  <View style={styles.savingActions}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={savingActionInProgress}
                      onPress={() => executeSavingBudgetAction(item, "reduce")}
                      style={[
                        styles.savingButton,
                        savingActionInProgress && styles.transferButtonDisabled,
                      ]}
                    >
                      {savingActionInProgress ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Ionicons name="remove-circle" size={18} color="#FFF" />
                          <Text style={styles.savingButtonText}>Reduce Budget</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {goalCategoryName ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={savingActionInProgress}
                        onPress={() => executeSavingBudgetAction(item, "goal")}
                        style={[
                          styles.savingSecondaryButton,
                          savingActionInProgress && styles.transferButtonDisabled,
                        ]}
                      >
                        <Ionicons name="flag-outline" size={18} color={palette.success} />
                        <Text style={styles.savingSecondaryButtonText}>Move to Goal</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))}

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
                      <Text style={styles.transferTitle}>
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
            </>
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
  detailPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: 10,
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
  },
  transferTitle: {
    color: palette.primary,
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
  unusedCategory: {
    color: palette.text,
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
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 10,
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
  simulatorCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    ...shadow.subtle,
  },
  simulatorLabel: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },
  simulatorInputRow: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    height: 54,
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  simulatorPrefix: {
    color: palette.primary,
    fontSize: 18,
    fontWeight: "900",
    marginRight: 8,
  },
  simulatorInput: {
    color: palette.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  simulatorWarning: {
    color: palette.warning,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginBottom: 10,
  },
});
