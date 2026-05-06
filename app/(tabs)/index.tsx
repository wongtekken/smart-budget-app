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
    const savingsRate = income > 0 ? (netCashFlow / income) * 100 : 0;
    const healthScore = Math.max(
      0,
      Math.min(100, Math.round(72 + Math.min(savingsRate, 25) - Math.max(budgetUsed - 1, 0) * 45)),
    );

    const categories = Object.keys({ ...allocations, ...spentByCategory })
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
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5);

    return {
      allocated,
      budgetUsed,
      categories,
      expenses,
      healthScore,
      income,
      latestTransactions: transactions.slice(0, 4),
      netCashFlow,
    };
  }, [allocations, transactions]);

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
                  <Text style={styles.cardLabel}>Net cash flow</Text>
                  <Text
                    style={[
                      styles.heroAmount,
                      { color: dashboard.netCashFlow >= 0 ? palette.success : palette.danger },
                    ]}
                  >
                    {dashboard.netCashFlow >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(dashboard.netCashFlow))}
                  </Text>
                </View>
                <View style={styles.scoreBadge}>
                  <Ionicons name="pulse-outline" size={16} color={palette.primary} />
                  <Text style={styles.scoreText}>{dashboard.healthScore}</Text>
                </View>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryTile}>
                  <Text style={styles.summaryLabel}>Income</Text>
                  <Text style={[styles.summaryValue, { color: palette.success }]}>
                    {formatCurrency(dashboard.income)}
                  </Text>
                </View>
                <View style={styles.summaryTile}>
                  <Text style={styles.summaryLabel}>Expense</Text>
                  <Text style={[styles.summaryValue, { color: palette.danger }]}>
                    {formatCurrency(dashboard.expenses)}
                  </Text>
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

              <View style={styles.listCard}>
                {dashboard.categories.length > 0 ? (
                  dashboard.categories.map((item, index) => (
                    <View
                      key={item.name}
                      style={[
                        styles.categoryRow,
                        index === dashboard.categories.length - 1 && styles.lastRow,
                      ]}
                    >
                      <View style={styles.categoryTop}>
                        <Text style={styles.categoryName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.categoryAmount}>
                          {formatCurrency(item.spent)} / {formatCurrency(item.allocated)}
                        </Text>
                      </View>
                      <View style={styles.categoryTrack}>
                        <View
                          style={[
                            styles.categoryFill,
                            {
                              width: `${Math.min(item.progress * 100, 100)}%`,
                              backgroundColor:
                                item.progress >= 1
                                  ? palette.danger
                                  : item.progress >= 0.8
                                    ? palette.warning
                                    : palette.success,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))
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
    backgroundColor: palette.accent,
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  cardLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: "800",
  },
  scoreBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: radius.pill,
    flexDirection: "row",
    height: 38,
    paddingHorizontal: spacing.md,
  },
  scoreText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    marginLeft: spacing.xs,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  summaryTile: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: radius.md,
    flex: 1,
    padding: spacing.md,
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "800",
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
  categoryRow: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    padding: spacing.lg,
  },
  categoryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  categoryName: {
    color: palette.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    marginRight: spacing.md,
  },
  categoryAmount: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  categoryTrack: {
    backgroundColor: palette.accentSoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden",
  },
  categoryFill: {
    borderRadius: radius.pill,
    height: "100%",
  },
});
