import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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
  GoalRecord,
  InsightSeverity,
  MonthlyBudgetRecord,
  RecurringRecord,
  TransactionRecord,
} from "../../services/financialIntelligence";

const getLocalDateStr = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getLocalMonthStr = (date = new Date()) => getLocalDateStr(date).slice(0, 7);

const getSeverityColor = (severity: InsightSeverity) => {
  if (severity === "danger") return palette.danger;
  if (severity === "warning") return palette.warning;
  if (severity === "success") return palette.success;
  return palette.primary;
};

const InsightCard = ({
  description,
  metric,
  severity,
  title,
}: {
  description: string;
  metric?: string;
  severity: InsightSeverity;
  title: string;
}) => {
  const color = getSeverityColor(severity);

  return (
    <View style={styles.insightCard}>
      <View style={[styles.severityRail, { backgroundColor: color }]} />
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightDescription}>{description}</Text>
        {metric ? <Text style={[styles.metricText, { color }]}>{metric}</Text> : null}
      </View>
    </View>
  );
};

export default function AiCoachScreen() {
  const currentMonth = getLocalMonthStr();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [budgets, setBudgets] = useState<MonthlyBudgetRecord[]>([]);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringRecord[]>([]);
  const [plannedPurchase, setPlannedPurchase] = useState("");
  const [coachResponse, setCoachResponse] = useState<FinancialCoachResponse | null>(null);
  const [coachError, setCoachError] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<
    "coach" | "review" | "patterns" | "categories" | "actions" | null
  >(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const txQuery = query(collection(db, "transactions"), where("userId", "==", user.uid));
    const budgetQuery = query(collection(db, "monthly_budgets"), where("userId", "==", user.uid));
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
      unsubscribeGoals();
      unsubscribeRecurring();
    };
  }, []);

  const currentAllocations = useMemo(
    () => budgets.find((budget) => budget.month === currentMonth)?.allocations || {},
    [budgets, currentMonth],
  );

  const aiInsights = useMemo(
    () =>
      buildFinancialIntelligence({
        budgets,
        currentAllocations,
        goals,
        recurring: recurringTransactions,
        transactions,
      }),
    [budgets, currentAllocations, goals, recurringTransactions, transactions],
  );

  const purchaseAmount = Number(plannedPurchase) || 0;
  const purchaseSimulation = useMemo(
    () =>
      purchaseAmount > 0
        ? aiInsights.whatIfSimulation(purchaseAmount, "planned purchase")
        : null,
    [aiInsights, purchaseAmount],
  );
  const insightCards = [
    ...aiInsights.abnormalSpending,
    ...aiInsights.weekendPatterns,
    ...aiInsights.lifestyleChanges,
  ].slice(0, 5);
  const coachCards = [
    ...aiInsights.reactiveAlerts,
    ...aiInsights.savingOpportunities,
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
    aiInsights.goalRecommendations.length;
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
            <Text style={styles.simulatorLabel}>Planned purchase amount</Text>
            <View style={styles.simulatorInputRow}>
              <Text style={styles.simulatorPrefix}>RM</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setPlannedPurchase}
                placeholder="0.00"
                placeholderTextColor={palette.textSoft}
                style={styles.simulatorInput}
                value={plannedPurchase}
              />
            </View>
            {purchaseSimulation ? (
              <InsightCard
                description={purchaseSimulation.message}
                metric={`Projected balance: RM ${purchaseSimulation.projectedBalance.toFixed(0)}`}
                severity={purchaseSimulation.severity}
                title="Purchase impact"
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
                </View>
                <Text style={styles.behaviorTag}>{item.behavior}</Text>
              </View>
            ))}
        </View>

        <View style={styles.section}>
          <SectionToggle
            count={coachCards.length + aiInsights.budgetTransfers.length}
            section="actions"
            title="Budget actions"
          />
          {expandedSection === "actions" && (
            <>
              {coachCards.length > 0 ? (
                coachCards.map((item, index) => (
                  <InsightCard key={`${item.title}-${index}`} {...item} />
                ))
              ) : (
                <Text style={styles.emptyText}>
                  No urgent action is needed. Keep recording transactions for stronger guidance.
                </Text>
              )}

              {aiInsights.budgetTransfers.map((item) => (
                <View key={`${item.fromCategory}-${item.toCategory}`} style={styles.transferCard}>
                  <Ionicons name="swap-horizontal" size={22} color={palette.primary} />
                  <Text style={styles.transferText}>{item.message}</Text>
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
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderRadius: radius.lg,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  transferText: {
    color: palette.primary,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
    marginLeft: 10,
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
    fontSize: 20,
    fontWeight: "900",
  },
});
