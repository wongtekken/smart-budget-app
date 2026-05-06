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
import { BarChart, PieChart } from "react-native-gifted-charts";

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

    // 组装给 BarChart 的数据
    const barData = [
      {
        value: totalInc,
        label: "Income",
        frontColor: palette.success,
        topLabelComponent: () => (
          // 🚨 把文字改成深色，配合白色底板
          <Text style={[styles.barLabel, { color: "#333" }]}>{totalInc}</Text>
        ),
      },
      {
        value: totalExp,
        label: "Expense",
        frontColor: palette.danger,
        topLabelComponent: () => (
          <Text style={[styles.barLabel, { color: "#333" }]}>{totalExp}</Text>
        ),
      },
    ];

    // 找到最高的那根柱子，用来设置图表的最大高度
    const maxValue = Math.max(totalInc, totalExp, 100);

    return { totalInc, totalExp, netCashFlow, savingsRate, barData, maxValue };
  };

  const { totalInc, totalExp, netCashFlow, savingsRate, barData, maxValue } =
    getOverviewData();

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
                    radius={80}
                    innerRadius={45}
                    innerCircleColor={palette.accent}
                    centerLabelComponent={() => {
                      return <View />;
                    }}
                  />
                </View>

                <View style={styles.legendContainer}>
                  {chartData.map((item, index) => (
                    <View key={index} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: item.color },
                        ]}
                      />
                      <View>
                        <Text style={styles.legendLabel} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={styles.legendPercentage}>
                          {item.percentage}%
                        </Text>
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
                  color="#FFF"
                  style={{ marginRight: 5 }}
                />
                <Text style={styles.savingsRateText}>
                  Savings Rate:{" "}
                  {netCashFlow >= 0 ? `${savingsRate}%` : "Deficit"}
                </Text>
              </View>

              {/* 3. 红绿双柱对抗图 (BarChart) */}
              <View style={styles.barChartWrapper}>
                <BarChart
                  data={barData}
                  barWidth={50}
                  spacing={50}
                  roundedTop
                  roundedBottom
                  // 🚨 开启网格线
                  hideRules={false}
                  rulesType="solid"
                  rulesColor="rgba(0,0,0,0.05)"
                  // 🚨 开启 Y 轴和 X 轴
                  yAxisThickness={1}
                  xAxisThickness={1}
                  yAxisColor="rgba(0,0,0,0.1)"
                  xAxisColor="rgba(0,0,0,0.1)"
                  // 🚨 显示 Y 轴数字，并设置颜色
                  yAxisTextStyle={{
                    color: "#888",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                  xAxisLabelTextStyle={{
                    color: "#555",
                    fontWeight: "bold",
                    marginTop: 5,
                  }}
                  noOfSections={4}
                  maxValue={maxValue * 1.2}
                  backgroundColor="transparent"
                  initialSpacing={40}
                  // 这个很重要，防止标签被切掉
                  showFractionalValues={false}
                />
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
  scrollContent: { padding: 20, paddingBottom: 40 },
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
    backgroundColor: palette.accent,
    borderRadius: radius.lg,
    padding: 20,
    minHeight: 280,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.text,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    flex: 1.2,
    alignItems: "center",
  },
  legendContainer: { flex: 1, justifyContent: "center", paddingLeft: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  legendDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  legendLabel: { fontSize: 15, fontWeight: "bold", color: palette.text },
  legendPercentage: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
    fontWeight: "bold",
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
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
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
    paddingTop: 10,
  },
  netCashFlowLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: palette.textMuted,
    marginBottom: 5,
  },
  netCashFlowValue: {
    fontSize: 42,
    fontWeight: "900",
    marginBottom: 15,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  savingsRatePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.primary,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 30,
  },
  savingsRateText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  barChartWrapper: {
    height: 250, // 稍微拉高一点以容纳网格
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)", // 🚨 加上白底 (稍微带一点点透明，显得有质感)
    borderRadius: 20, // 🚨 圆角
    paddingVertical: 20,
    paddingRight: 10, // 给右边留点空隙
    paddingLeft: 0, // 左边数字会占空间
    marginTop: 10,
    // 🚨 加上漂亮的阴影
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  barLabel: {
    color: "#333", // 这里的颜色会被上面的内联样式覆盖，但以防万一还是改成深色
    fontWeight: "bold",
    fontSize: 12,
    marginBottom: 5,
  },
  txDate: { fontSize: 12, color: palette.textMuted, fontWeight: "600" },
  txAmount: { fontSize: 16, fontWeight: "900", color: palette.text },
});
