import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCurrency, palette, radius, shadow, spacing } from "../../constants/ui";
import { auth, db } from "../../firebaseConfig";

type Transaction = {
  id: string;
  amount?: number | string;
  category?: string;
  createdAt?: { toMillis?: () => number };
  date?: string;
  note?: string;
  type?: "Income" | "Expense" | "income" | "expense";
};

const getLocalMonthStr = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
};

const getMonthBounds = (month: string) => ({
  start: `${month}-01`,
  end: `${month}-31`,
});

const normalizeType = (type?: string) => type?.toLowerCase();

const getTransactionTime = (tx: Transaction) =>
  tx.createdAt?.toMillis?.() ?? new Date(tx.date || "1970-01-01").getTime();

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const getMonthProgress = (month: string) => {
  const activeMonth = getLocalMonthStr();

  if (month < activeMonth) {
    return 1;
  }

  if (month > activeMonth) {
    return 0;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(year, monthNumber, 0).getDate();

  return clamp(new Date().getDate() / totalDays);
};

const getHealthProfile = (score: number) => {
  if (score >= 85) {
    return { color: palette.success, grade: "Excellent", icon: "shield-checkmark-outline" as const };
  }

  if (score >= 70) {
    return { color: palette.primary, grade: "Good", icon: "trending-up-outline" as const };
  }

  if (score >= 55) {
    return { color: palette.warning, grade: "Fair", icon: "alert-circle-outline" as const };
  }

  if (score >= 40) {
    return { color: palette.warning, grade: "Getting started", icon: "flag-outline" as const };
  }

  return { color: palette.danger, grade: "Needs attention", icon: "warning-outline" as const };
};

export default function DashboardScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const currentMonth = getLocalMonthStr();

  useEffect(() => {
    let unsubscribeTx: (() => void) | undefined;
    let unsubscribeBudget: (() => void) | undefined;

    setLoading(true);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeTx?.();
      unsubscribeBudget?.();

      if (!user) {
        setTransactions([]);
        setAllocations({});
        setLoading(false);
        return;
      }

      const { start, end } = getMonthBounds(currentMonth);
      const txQuery = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        where("date", ">=", start),
        where("date", "<=", end),
      );

      unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Transaction[];
        setTransactions(data.sort((a, b) => getTransactionTime(b) - getTransactionTime(a)));
        setLoading(false);
      });

      const budgetDocId = `${user.uid}_${currentMonth}`;
      unsubscribeBudget = onSnapshot(
        doc(db, "monthly_budgets", budgetDocId),
        (snapshot) => {
          setAllocations(snapshot.exists() ? snapshot.data().allocations || {} : {});
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeTx?.();
      unsubscribeBudget?.();
    };
  }, [currentMonth]);

  const dashboard = useMemo(() => {
    let income = 0;
    let expenses = 0;
    const spentByCategory: Record<string, number> = {};

    transactions.forEach((tx) => {
      const amount = Number(tx.amount) || 0;
      const type = normalizeType(tx.type);

      if (type === "income") {
        income += amount;
      }

      if (type === "expense") {
        expenses += amount;
        const parentCategory = tx.category ? tx.category.split(" - ")[0] : "Uncategorized";
        spentByCategory[parentCategory] = (spentByCategory[parentCategory] || 0) + amount;
      }
    });

    const allocated = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
    const budgetUsed = allocated > 0 ? expenses / allocated : 0;
    const netCashFlow = income - expenses;

    const monthProgress = getMonthProgress(currentMonth);
    const budgetExpectedUsage = allocated > 0 ? Math.min(monthProgress + 0.08, 1) : 0;
    const categoryStats = Object.keys({ ...allocations, ...spentByCategory })
      .map((name) => {
        const allocatedAmount = Number(allocations[name] || 0);
        const spent = spentByCategory[name] || 0;
        const progress = allocatedAmount > 0 ? spent / allocatedAmount : spent > 0 ? 1 : 0;

        return {
          name,
          allocated: allocatedAmount,
          spent,
          progress,
        };
      })
      .sort((a, b) => b.progress - a.progress);
    const budgetedCategoryCount = categoryStats.filter((item) => item.allocated > 0).length;
    const overBudgetCategoryCount = categoryStats.filter(
      (item) => item.allocated > 0 && item.progress > 1,
    ).length;
    const warningCategoryCount = categoryStats.filter(
      (item) => item.allocated > 0 && item.progress >= 0.85 && item.progress <= 1,
    ).length;
    const unbudgetedSpent = categoryStats
      .filter((item) => item.allocated === 0)
      .reduce((sum, item) => sum + item.spent, 0);
    const unbudgetedShare = expenses > 0 ? unbudgetedSpent / expenses : 0;

    const cashFlowScore =
      income > 0 ? (netCashFlow >= 0 ? 25 : clamp(1 + netCashFlow / income) * 25) : expenses > 0 ? 0 : 13;
    const savingsRateRatio = income > 0 ? netCashFlow / income : 0;
    const savingsScore =
      income > 0 ? clamp((savingsRateRatio + 0.05) / 0.25) * 25 : expenses > 0 ? 0 : 12;
    const budgetScore =
      allocated === 0
        ? expenses > 0
          ? 6
          : 15
        : budgetUsed <= budgetExpectedUsage
          ? 30
          : budgetUsed <= 1
            ? 30 - clamp((budgetUsed - budgetExpectedUsage) / Math.max(1 - budgetExpectedUsage, 0.01)) * 12
            : Math.max(0, 18 - (budgetUsed - 1) * 60);
    const categoryScore =
      budgetedCategoryCount === 0
        ? expenses > 0
          ? 6
          : 12
        : clamp(
            20 - overBudgetCategoryCount * 6 - warningCategoryCount * 2 - unbudgetedShare * 10,
            0,
            20,
          );
    const healthScore = Math.round(cashFlowScore + savingsScore + budgetScore + categoryScore);
    const healthProfile = getHealthProfile(healthScore);
    const healthInsight =
      income === 0 && expenses > 0
        ? "Add income records so the score can judge your month accurately."
        : allocated === 0
          ? "Set a monthly budget to unlock a stronger, more accurate score."
          : netCashFlow < 0
            ? "Expenses are higher than income this month."
            : budgetUsed > 1
              ? "Your total spend has passed the monthly budget."
              : overBudgetCategoryCount > 0
                ? `${overBudgetCategoryCount} category ${overBudgetCategoryCount > 1 ? "budgets are" : "budget is"} over limit.`
                : savingsRateRatio < 0.1
                  ? "Cash flow is positive. Aim for at least 10% savings."
                  : "Healthy pace. Your income, savings, and budget are aligned.";

    return {
      allocated,
      budgetUsed,
      categories: categoryStats,
      expenses,
      healthInsight,
      healthProfile,
      healthScore,
      income,
      latestTransactions: transactions.slice(0, 4),
      netCashFlow,
    };
  }, [allocations, currentMonth, transactions]);

  const budgetStatus =
    dashboard.allocated === 0
      ? "No budget set"
      : dashboard.budgetUsed >= 1
        ? "Over budget"
        : dashboard.budgetUsed >= 0.8
          ? "At risk"
          : "On track";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Smart Budget</Text>
            <Text style={styles.title}>Overview</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/transaction")}>
            <Ionicons name="receipt-outline" size={22} color={palette.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.loadingText}>Loading your month...</Text>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.cardLabel}>Financial Health Score</Text>
                  <Text style={styles.cardSubLabel}>This month</Text>
                </View>
                <View style={styles.gradeBadge}>
                  <Ionicons name={dashboard.healthProfile.icon} size={16} color={palette.primary} />
                  <Text style={styles.gradeText}>{dashboard.healthProfile.grade}</Text>
                </View>
              </View>

              <View style={styles.scorePanel}>
                <View style={styles.scoreMainRow}>
                  <View style={styles.scoreNumberWrap}>
                    <Text style={styles.scoreNumber}>{dashboard.healthScore}</Text>
                    <Text style={styles.scoreDivider}>/100</Text>
                  </View>
                  <Text style={styles.scoreInsight}>{dashboard.healthInsight}</Text>
                </View>

                <View style={styles.scoreTrack}>
                  <View
                    style={[
                      styles.scoreFill,
                      {
                        width: `${dashboard.healthScore}%`,
                      },
                    ]}
                  />
                </View>

              </View>

            </View>

            <TouchableOpacity style={styles.budgetCard} onPress={() => router.push("/budget")}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionTitle, styles.budgetTitle]}>Monthly Budget</Text>
                  <Text style={[styles.sectionSubtitle, styles.budgetSubtitle]}>{budgetStatus}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(dashboard.budgetUsed * 100, 100)}%`,
                      backgroundColor:
                        dashboard.budgetUsed >= 1
                          ? palette.danger
                          : dashboard.budgetUsed >= 0.8
                            ? palette.warning
                            : palette.primary,
                    },
                  ]}
                />
              </View>
              <View style={styles.budgetMeta}>
                <Text style={styles.metaText}>Spent {formatCurrency(dashboard.expenses)}</Text>
                <Text style={styles.metaText}>Budget {formatCurrency(dashboard.allocated)}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Latest Transactions</Text>
                <TouchableOpacity onPress={() => router.push("/transaction")}>
                  <Text style={styles.linkText}>See all</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.listCard}>
                {dashboard.latestTransactions.length > 0 ? (
                  dashboard.latestTransactions.map((tx, index) => {
                    const isExpense = normalizeType(tx.type) === "expense";

                    return (
                      <View
                        key={tx.id}
                        style={[
                          styles.transactionRow,
                          index === dashboard.latestTransactions.length - 1 && styles.lastRow,
                        ]}
                      >
                        <View style={styles.transactionIcon}>
                          <Ionicons
                            name={isExpense ? "arrow-down" : "arrow-up"}
                            size={16}
                            color={isExpense ? palette.danger : palette.success}
                          />
                        </View>
                        <View style={styles.transactionText}>
                          <Text style={styles.transactionTitle} numberOfLines={1}>
                            {tx.category || tx.note || "Uncategorized"}
                          </Text>
                          <Text style={styles.transactionDate}>{tx.date || "No date"}</Text>
                        </View>
                        <Text
                          style={[
                            styles.transactionAmount,
                            { color: isExpense ? palette.danger : palette.success },
                          ]}
                        >
                          {isExpense ? "-" : "+"}
                          {formatCurrency(Number(tx.amount) || 0)}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="receipt-outline" size={34} color={palette.textSoft} />
                    <Text style={styles.emptyTitle}>No transactions yet</Text>
                    <Text style={styles.emptyText}>Add your first record to see this month take shape.</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Category Budget</Text>
                <TouchableOpacity onPress={() => router.push("/budget")}>
                  <Text style={styles.linkText}>Manage</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.breakdownCard}>
                {dashboard.categories.length > 0 ? (
                  dashboard.categories.map((item) => {
                    const isAtRisk = item.progress >= 0.8 && item.progress < 1;
                    const isOverBudget = item.allocated > 0 && item.spent > item.allocated;

                    return (
                      <TouchableOpacity
                        key={item.name}
                        style={styles.breakdownItem}
                        onPress={() => router.push("/budget")}
                      >
                        <View style={styles.breakdownTextRow}>
                          <Text style={styles.breakdownCategoryName} numberOfLines={1}>
                            {item.name}
                          </Text>

                          <View style={styles.breakdownAmountGroup}>
                            <Text style={styles.breakdownAmountText}>
                              RM {item.spent.toFixed(0)} / RM {item.allocated.toFixed(0)}
                            </Text>
                            {isOverBudget ? (
                              <View style={styles.breakdownStatusBadge}>
                                <Ionicons name="alert-circle" size={14} color={palette.danger} />
                                <Text style={styles.breakdownStatusText}>Over!</Text>
                              </View>
                            ) : isAtRisk ? (
                              <View style={styles.breakdownStatusBadge}>
                                <Ionicons name="warning" size={14} color={palette.warning} />
                                <Text
                                  style={[
                                    styles.breakdownStatusText,
                                    { color: palette.warning },
                                  ]}
                                >
                                  At risk
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>

                        <View style={styles.breakdownProgressTrack}>
                          <View
                            style={[
                              styles.breakdownProgressFill,
                              {
                                width: `${Math.min(item.progress * 100, 100)}%`,
                              },
                              isOverBudget
                                ? styles.breakdownFillRed
                                : isAtRisk
                                  ? styles.breakdownFillYellow
                                  : styles.breakdownFillGreen,
                            ]}
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="wallet-outline" size={34} color={palette.textSoft} />
                    <Text style={styles.emptyTitle}>No budget yet</Text>
                    <Text style={styles.emptyText}>Create a monthly budget to track category progress.</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  title: {
    color: palette.text,
    fontSize: 30,
    fontWeight: "800",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  loadingCard: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    ...shadow.card,
  },
  loadingText: {
    color: palette.textMuted,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  heroCard: {
    backgroundColor: "#FFD166",
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  heroHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  cardLabel: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "800",
  },
  cardSubLabel: {
    color: "rgba(31,41,51,0.62)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  gradeBadge: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderColor: "rgba(255,130,22,0.18)",
    borderWidth: 1,
    borderRadius: radius.pill,
    flexDirection: "row",
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  gradeText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: spacing.xs,
  },
  scorePanel: {
    marginBottom: spacing.lg,
  },
  scoreMainRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  scoreNumberWrap: {
    alignItems: "baseline",
    flexDirection: "row",
    flexShrink: 0,
  },
  scoreNumber: {
    color: palette.primary,
    fontSize: 62,
    fontWeight: "900",
    lineHeight: 68,
  },
  scoreDivider: {
    color: "rgba(31,41,51,0.72)",
    fontSize: 18,
    fontWeight: "800",
    marginLeft: spacing.xs,
  },
  scoreInsight: {
    color: "rgba(31,41,51,0.78)",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    paddingBottom: spacing.sm,
  },
  scoreTrack: {
    backgroundColor: "rgba(255,255,255,0.62)",
    borderRadius: radius.pill,
    height: 12,
    overflow: "hidden",
  },
  scoreFill: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    height: "100%",
  },
  budgetCard: {
    backgroundColor: "#5AC37B",
    borderRadius: radius.lg,
    marginBottom: spacing.xxl,
    padding: spacing.lg,
    ...shadow.subtle,
  },
  budgetTitle: {
    color: "#FFFFFF",
  },
  budgetSubtitle: {
    color: "rgba(255,255,255,0.85)",
  },
  sectionBlock: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  linkText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: radius.pill,
    height: 12,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: radius.pill,
    height: "100%",
  },
  budgetMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  metaText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  listCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.subtle,
  },
  breakdownCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.subtle,
  },
  breakdownItem: {
    marginBottom: spacing.xxl,
  },
  breakdownTextRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  breakdownCategoryName: {
    color: palette.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    marginRight: spacing.md,
  },
  breakdownAmountGroup: {
    alignItems: "center",
    flexDirection: "row",
  },
  breakdownAmountText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    marginRight: spacing.sm,
  },
  breakdownStatusBadge: {
    alignItems: "center",
    flexDirection: "row",
  },
  breakdownStatusText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: spacing.xs,
  },
  breakdownProgressTrack: {
    backgroundColor: "#EFEFEF",
    borderRadius: 6,
    height: 12,
    overflow: "hidden",
  },
  breakdownProgressFill: {
    borderRadius: 6,
    height: "100%",
  },
  breakdownFillGreen: {
    backgroundColor: palette.success,
  },
  breakdownFillYellow: {
    backgroundColor: palette.warning,
  },
  breakdownFillRed: {
    backgroundColor: palette.danger,
  },
  transactionRow: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    padding: spacing.lg,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  transactionIcon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    marginRight: spacing.md,
    width: 38,
  },
  transactionText: {
    flex: 1,
    marginRight: spacing.md,
  },
  transactionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "800",
  },
  transactionDate: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.xxl,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
