import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";

// 🚨 引入 Firebase
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

// 准备一套动态分配的颜色
const CHART_COLORS = [
  "#4ADE80",
  "#22C55E",
  "#166534",
  "#14B8A6",
  "#0EA5E9",
  "#3B82F6",
  "#6366F1",
  "#EC4899",
  "#F43F5E",
  "#F59E0B",
];

const formatMonthDisplay = (date: Date) => {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const getMonthStr = (date: Date) => {
  return date.toISOString().slice(0, 7);
};

const formatCompactCurrency = (value: number) => {
  if (Math.abs(value) >= 1000) return `RM ${(value / 1000).toFixed(1)}k`;
  return `RM ${value.toFixed(0)}`;
};

export default function AnalysisScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"Expense" | "Income" | "Overview">(
    "Expense",
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const monthStr = getMonthStr(currentDate);
    const startOfMonth = `${monthStr}-01`;
    const endOfMonth = `${monthStr}-31`;

    const q = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid),
      where("date", ">=", startOfMonth),
      where("date", "<=", endOfMonth),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setTransactions(data);
    });

    return () => unsubscribe();
  }, [currentDate]);

  const generateChartData = () => {
    if (activeTab === "Overview") return { chartData: [], totalAmount: 0 };

    const groupedData: Record<string, number> = {};
    let totalAmount = 0;

    transactions.forEach((tx) => {
      if (tx.type === activeTab) {
        const parentCategory = tx.category
          ? tx.category.split(" - ")[0]
          : "Other";
        const amt = Number(tx.amount) || 0;
        groupedData[parentCategory] = (groupedData[parentCategory] || 0) + amt;
        totalAmount += amt;
      }
    });

    const chartData = Object.keys(groupedData)
      .sort((a, b) => groupedData[b] - groupedData[a])
      .map((key, index) => ({
        value: groupedData[key],
        color: CHART_COLORS[index % CHART_COLORS.length],
        label: key,
        amount: groupedData[key],
        percentage:
          totalAmount > 0
            ? ((groupedData[key] / totalAmount) * 100).toFixed(1)
            : "0",
      }));

    return { chartData, totalAmount };
  };

  const { chartData, totalAmount } = generateChartData();

  const getInsights = () => {
    const topCategory = chartData.length > 0 ? chartData[0] : null;

    const today = new Date();
    let daysToDivide = 30;
    if (
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    ) {
      daysToDivide = today.getDate() || 1;
    } else {
      daysToDivide = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      ).getDate();
    }
    const dailyAverage = totalAmount / daysToDivide;

    const currentMonthTx = transactions.filter((tx) => tx.type === activeTab);
    const topTransactions = [...currentMonthTx]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, 3);

    return { topCategory, dailyAverage, topTransactions };
  };

  const { topCategory, dailyAverage, topTransactions } = getInsights();

  // ==========================================
  // 🧠 算力引擎：Overview (净现金流) 数据
  // ==========================================
  const getOverviewData = () => {
    let totalInc = 0;
    let totalExp = 0;

    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "Income") totalInc += amt;
      if (tx.type === "Expense") totalExp += amt;
    });

    const netCashFlow = totalInc - totalExp;
    const savingsRate =
      totalInc > 0 ? ((netCashFlow / totalInc) * 100).toFixed(1) : "0.0";

    return { totalInc, totalExp, netCashFlow, savingsRate };
  };

  const { totalInc, totalExp, netCashFlow, savingsRate } = getOverviewData();

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const TabButton = ({
    title,
  }: {
    title: "Expense" | "Income" | "Overview";
  }) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        activeTab === title ? styles.tabActive : styles.tabInactive,
      ]}
      onPress={() => setActiveTab(title)}
    >
      <Text
        style={[
          styles.tabText,
          activeTab === title ? styles.tabTextActive : styles.tabTextInactive,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerIcon}
        >
          <Ionicons name="arrow-back" size={32} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Financial Analysis</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="options-outline" size={30} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.segmentContainer}>
          <TabButton title="Expense" />
          <TabButton title="Income" />
          <TabButton title="Overview" />
        </View>

        {/* ========================================== */}
        {/* 🚨 区域 1：大黄卡片 (图表专属) */}
        {/* ========================================== */}
        <View style={styles.chartCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {activeTab === "Overview"
                ? "Net Cash Flow"
                : `Monthly ${activeTab}s`}
            </Text>

            <View style={styles.monthSelector}>
              <TouchableOpacity
                onPress={() => changeMonth(-1)}
                style={{ padding: 5 }}
              >
              <Ionicons name="chevron-back" size={18} color={palette.primary} />
              </TouchableOpacity>
              <Text style={styles.monthText}>
                {formatMonthDisplay(currentDate)}
              </Text>
              <TouchableOpacity
                onPress={() => changeMonth(1)}
                style={{ padding: 5 }}
              >
              <Ionicons name="chevron-forward" size={18} color={palette.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {activeTab !== "Overview" ? (
            chartData.length > 0 ? (
              <View style={styles.chartContent}>
                <View style={styles.chartWrapper}>
                  <PieChart
                    donut
                    data={chartData}
                    radius={88}
                    innerRadius={58}
                    innerCircleColor={palette.surface}
                    centerLabelComponent={() => {
                      return (
                        <View style={styles.donutCenter}>
                          <Text style={styles.donutTotal}>
                            {formatCompactCurrency(totalAmount)}
                          </Text>
                          <Text style={styles.donutCaption}>
                            Total {activeTab}
                          </Text>
                        </View>
                      );
                    }}
                  />
                </View>

                <View style={styles.categoryList}>
                  {chartData.map((item, index) => (
                    <View key={index} style={styles.categoryBreakdownItem}>
                      <View style={styles.categoryBreakdownTop}>
                        <View style={styles.categoryBreakdownLeft}>
                          <View
                            style={[
                              styles.legendDot,
                              { backgroundColor: item.color },
                            ]}
                          />
                          <Text style={styles.legendLabel} numberOfLines={1}>
                            {item.label}
                          </Text>
                        </View>
                        <View style={styles.categoryBreakdownRight}>
                          <Text style={styles.legendAmount}>
                            {formatCompactCurrency(item.amount)}
                          </Text>
                          <Text style={styles.legendPercentage}>
                            {item.percentage}%
                          </Text>
                        </View>
                      </View>
                      <View style={styles.categoryProgressTrack}>
                        <View
                          style={[
                            styles.categoryProgressFill,
                            {
                              backgroundColor: item.color,
                              width: `${Math.min(Number(item.percentage), 100)}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="pie-chart-outline"
                  size={64}
                  color={palette.textSoft}
                />
                <Text style={styles.emptyText}>
                  No {activeTab.toLowerCase()} recorded for this month.
                </Text>
              </View>
            )
          ) : (
            // ==========================================
            // 🚨 全新渲染的 Overview 视图
            // ==========================================
            <View style={styles.overviewContainer}>
              {/* 1. 核心大数字：Net Cash Flow */}
              <Text style={styles.netCashFlowLabel}>Net Cash Flow</Text>
              <Text
                style={[
                  styles.netCashFlowValue,
                  { color: netCashFlow >= 0 ? palette.success : palette.danger },
                ]}
              >
                {netCashFlow >= 0 ? "+" : "-"} RM{" "}
                {Math.abs(netCashFlow).toFixed(2)}
              </Text>

              {/* 2. 储蓄率小药丸 */}
              <View style={styles.savingsRatePill}>
                <Ionicons
                  name={netCashFlow >= 0 ? "trending-up" : "trending-down"}
                  size={16}
                  color={palette.primary}
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.savingsRateText}>
                  Savings Rate:{" "}
                  {netCashFlow >= 0 ? `${savingsRate}%` : "Deficit"}
                </Text>
              </View>

              <Text style={styles.cashFlowStatus}>
                {netCashFlow > 0
                  ? "Positive cash flow this month"
                  : netCashFlow < 0
                    ? "Expenses are higher than income"
                    : "Income and expense are balanced"}
              </Text>

              <View style={styles.flowComparison}>
                <Text style={styles.flowComparisonTitle}>Income vs Expense</Text>

                <View style={styles.flowBarBlock}>
                  <View style={styles.flowBarHeader}>
                    <Text style={styles.flowBarLabel}>Income</Text>
                    <Text style={styles.flowBarAmount}>{formatCompactCurrency(totalInc)}</Text>
                  </View>
                  <View style={styles.flowBarTrack}>
                    <View
                      style={[
                        styles.flowBarFill,
                        {
                          backgroundColor: palette.success,
                          width: `${Math.max(
                            (totalInc / Math.max(totalInc, totalExp, 1)) * 100,
                            totalInc > 0 ? 6 : 0,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.flowBarBlock}>
                  <View style={styles.flowBarHeader}>
                    <Text style={styles.flowBarLabel}>Expense</Text>
                    <Text style={styles.flowBarAmount}>{formatCompactCurrency(totalExp)}</Text>
                  </View>
                  <View style={styles.flowBarTrack}>
                    <View
                      style={[
                        styles.flowBarFill,
                        {
                          backgroundColor: palette.danger,
                          width: `${Math.max(
                            (totalExp / Math.max(totalInc, totalExp, 1)) * 100,
                            totalExp > 0 ? 6 : 0,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

            </View>
          )}
        </View>
        {/* 🚨🚨🚨 就是这里！上面这个 </View> 把大黄卡片闭合了！ 🚨🚨🚨 */}

        {/* ========================================== */}
        {/* 🚨 区域 2：洞察双卡片 (现在安全地在黄卡片外部了！) */}
        {/* ========================================== */}
        {activeTab !== "Overview" && totalAmount > 0 && (
          <View style={styles.insightsRow}>
            {/* 卡片 1：日均消费 */}
            <View style={styles.insightCard}>
              <View style={styles.insightIconBg}>
                <Ionicons name="calendar-outline" size={20} color={palette.primary} />
              </View>
              <Text style={styles.insightLabel}>Daily Average</Text>
              <Text style={styles.insightValue}>
                RM {dailyAverage.toFixed(0)}
              </Text>
            </View>

            {/* 卡片 2：最大开销分类 */}
            <View style={styles.insightCard}>
              <View
                style={[styles.insightIconBg, { backgroundColor: palette.successSoft }]}
              >
                <Ionicons name="flame-outline" size={20} color={palette.success} />
              </View>
              <Text style={styles.insightLabel}>Top Spender</Text>
              <Text
                style={[styles.insightValue, { color: palette.success }]}
                numberOfLines={1}
              >
                {topCategory ? topCategory.label : "-"}
              </Text>
            </View>
          </View>
        )}

        {/* ========================================== */}
        {/* 🚨 区域 3：钱包刺客列表 (安全地在最底部！) */}
        {/* ========================================== */}
        {activeTab !== "Overview" && topTransactions.length > 0 && (
          <View style={styles.topTxContainer}>
            <Text style={styles.sectionTitle}>Biggest Transactions</Text>

            <View style={styles.topTxCard}>
              {topTransactions.map((tx, index) => (
                <View
                  key={tx.id}
                  style={[
                    styles.txItem,
                    index === topTransactions.length - 1 && styles.txItemLast,
                  ]}
                >
                  <View style={styles.txLeft}>
                    <View
                      style={[
                        styles.txIconBox,
                        {
                          backgroundColor:
                            activeTab === "Income" ? palette.success : palette.danger,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          activeTab === "Expense"
                            ? "trending-down"
                            : "trending-up"
                        }
                        size={18}
                        color="#FFF"
                      />
                    </View>
                    <View>
                      <Text style={styles.txCategory}>{tx.category}</Text>
                      <Text style={styles.txDate}>{tx.date}</Text>
                    </View>
                  </View>
                  <Text style={styles.txAmount}>
                    RM {Number(tx.amount).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: palette.accent,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerIcon: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: palette.text },
  scrollContent: { padding: 20, paddingBottom: 140 },
  segmentContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    height: 45,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    marginHorizontal: 4,
  },
  tabActive: { backgroundColor: palette.primary },
  tabInactive: { backgroundColor: palette.surfaceMuted },
  tabText: { fontSize: 15, fontWeight: "bold" },
  tabTextActive: { color: "#FFF" },
  tabTextInactive: { color: palette.textMuted },

  // 大黄卡片
  chartCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    minHeight: 280,
    ...shadow.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.text,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: 15,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  monthText: {
    fontSize: 14,
    fontWeight: "bold",
    color: palette.text,
    marginHorizontal: 5,
  },
  chartContent: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  chartWrapper: {
    alignItems: "center",
    marginBottom: 22,
  },
  donutCenter: {
    alignItems: "center",
    justifyContent: "center",
    width: 110,
  },
  donutTotal: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  donutCaption: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "center",
  },
  categoryList: {
    width: "100%",
  },
  categoryBreakdownItem: {
    marginBottom: 14,
  },
  categoryBreakdownTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  categoryBreakdownLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    marginRight: 10,
  },
  categoryBreakdownRight: {
    alignItems: "flex-end",
  },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendLabel: {
    color: palette.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  legendAmount: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "900",
  },
  legendPercentage: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 1,
    fontWeight: "800",
  },
  categoryProgressTrack: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 7,
    overflow: "hidden",
    width: "100%",
  },
  categoryProgressFill: {
    borderRadius: radius.pill,
    height: "100%",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: palette.textMuted,
    marginTop: 15,
    fontWeight: "bold",
    fontSize: 16,
  },

  // 🚨 新增的洞察卡片样式
  insightsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  insightCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginHorizontal: 5,
    ...shadow.subtle,
  },
  insightIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  insightLabel: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: "bold",
    marginBottom: 4,
  },
  insightValue: { fontSize: 18, fontWeight: "900", color: palette.text },

  // 🚨 新增的刺客列表样式
  topTxContainer: { marginTop: 25 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: palette.text,
    marginBottom: 15,
    marginLeft: 5,
  },
  topTxCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 20,
    ...shadow.subtle,
  },
  txItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  txItemLast: { borderBottomWidth: 0 },
  txLeft: { flexDirection: "row", alignItems: "center" },
  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  txCategory: {
    fontSize: 16,
    fontWeight: "bold",
    color: palette.text,
    marginBottom: 4,
  },
  overviewContainer: {
    alignItems: "center",
    paddingTop: 0,
  },
  netCashFlowLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  netCashFlowValue: {
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 8,
  },
  savingsRatePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  savingsRateText: {
    color: palette.primary,
    fontWeight: "900",
    fontSize: 13,
  },
  cashFlowStatus: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 14,
    textAlign: "center",
  },
  flowComparison: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    width: "100%",
  },
  flowComparisonTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 12,
  },
  flowBarBlock: {
    marginBottom: 12,
  },
  flowBarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  flowBarLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "900",
  },
  flowBarAmount: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  flowBarTrack: {
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    height: 11,
    overflow: "hidden",
  },
  flowBarFill: {
    borderRadius: radius.pill,
    height: "100%",
  },
  txDate: { fontSize: 12, color: palette.textMuted, fontWeight: "600" },
  txAmount: { fontSize: 16, fontWeight: "900", color: palette.text },
});
