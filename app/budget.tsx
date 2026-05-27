import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { AppHeader } from "../components/app-header";
import { useAppDialog } from "../components/app-dialog";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

const getLocalMonthStr = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offset);
  return local.toISOString().slice(0, 7);
};

const isSavingsCategoryName = (name?: string) =>
  String(name || "").toLowerCase().includes("saving");

type TemplateAllocation = {
  category?: string;
  mode?: "Fixed" | "Percentage";
  value?: number | string;
};

export default function BudgetScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const params = useLocalSearchParams();
  const currentMonthStr = getLocalMonthStr();

  const [previousBalance, setPreviousBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<
    Record<string, number>
  >({});
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);
  const [budgetLoaded, setBudgetLoaded] = useState(false);

  // 🚨 手动修改预算的弹窗状态 (Edit)
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editAmount, setEditAmount] = useState("");

  // 🚨 新增：主动添加分类预算的弹窗状态 (Add)
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState("");
  const [addAmount, setAddAmount] = useState("");

  // ==========================================
  // 数据流获取
  // ==========================================
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "categories"),
      where("userId", "==", user.uid),
      where("type", "==", "Expense"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats: any[] = [];
      snapshot.forEach((doc) => cats.push({ id: doc.id, ...doc.data() }));
      setExpenseCategories(cats);
      setCategoriesLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    setTransactionsLoaded(false);
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let histIncome = 0,
        histExpense = 0,
        currIncome = 0;
      let expensesCalc: Record<string, number> = {};
      const startOfThisMonth = `${currentMonthStr}-01`;
      const endOfThisMonth = `${currentMonthStr}-31`;

      snapshot.forEach((doc) => {
        const tx = doc.data();
        const amount = Number(tx.amount) || 0;
        const txDate = tx.date || "1970-01-01";

        if (txDate < startOfThisMonth) {
          if (tx.type === "Income") histIncome += amount;
          if (tx.type === "Expense") histExpense += amount;
        } else if (txDate >= startOfThisMonth && txDate <= endOfThisMonth) {
          if (tx.type === "Income") currIncome += amount;
          else if (tx.type === "Expense") {
            const parentCatName = tx.category
              ? tx.category.split(" - ")[0]
              : "Uncategorized";
            if (!expensesCalc[parentCatName]) expensesCalc[parentCatName] = 0;
            expensesCalc[parentCatName] += amount;
          }
        }
      });
      setPreviousBalance(histIncome - histExpense);
      setTotalIncome(currIncome);
      setExpensesByCategory(expensesCalc);
      setTransactionsLoaded(true);
    });
    return () => unsubscribe();
  }, [currentMonthStr]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    setBudgetLoaded(false);
    const budgetDocId = `${user.uid}_${currentMonthStr}`;
    const unsubscribe = onSnapshot(
      doc(db, "monthly_budgets", budgetDocId),
      (docSnap) => {
        if (docSnap.exists()) {
          setAllocations(docSnap.data().allocations || {});
        } else {
          setAllocations({});
        }
        setBudgetLoaded(true);
      },
    );
    return () => unsubscribe();
  }, [currentMonthStr]);

  // ==========================================
  // 🧠 核心算力：计算资金与活跃状态
  // ==========================================
  const totalAvailable = totalIncome;
  const parentCategories = useMemo(
    () => expenseCategories.filter((c) => !c.parentId),
    [expenseCategories],
  );
  const activeCategoryNames = useMemo(
    () => new Set(parentCategories.map((cat) => cat.name)),
    [parentCategories],
  );
  const activeAllocations = categoriesLoaded
    ? Object.fromEntries(
        Object.entries(allocations).filter(([category]) =>
          activeCategoryNames.has(category),
        ),
      )
    : allocations;

  const totalAllocated = Object.values(activeAllocations).reduce(
    (sum, val) => sum + val,
    0,
  );
  const awaitingAssign = totalAvailable - totalAllocated;

  // 🚨 智能分类过滤：提取活跃分类与闲置分类
  const activeExpensesByCategory = categoriesLoaded
    ? Object.fromEntries(
        Object.entries(expensesByCategory).filter(([category]) =>
          activeCategoryNames.has(category),
        ),
      )
    : expensesByCategory;
  const inactiveCategorySpend = categoriesLoaded
    ? Object.entries(expensesByCategory)
        .filter(([category]) => !activeCategoryNames.has(category))
        .reduce((sum, [, amount]) => sum + amount, 0)
    : 0;

  const activeCategories = parentCategories.filter(
    (cat) =>
      (activeAllocations[cat.name] || 0) > 0 ||
      (activeExpensesByCategory[cat.name] || 0) > 0,
  );

  const addableCategories = parentCategories.filter(
    (cat) => (activeAllocations[cat.name] || 0) <= 0,
  );

  // ==========================================
  // 接收器与保存方法
  // ==========================================
  useEffect(() => {
    if (params.injectedTemplate) {
      const executeTemplate = async () => {
        const user = auth.currentUser;
        if (!user) return;
        if (!transactionsLoaded || !categoriesLoaded || !budgetLoaded) return;

        try {
          const templateParam = Array.isArray(params.injectedTemplate)
            ? params.injectedTemplate[0]
            : params.injectedTemplate;
          const templateData = JSON.parse(templateParam || "[]") as TemplateAllocation[];
          const hasPercentageAllocation = templateData.some(
            (item) => item.mode === "Percentage" && Number(item.value) > 0,
          );

          if (hasPercentageAllocation && totalAvailable <= 0) {
            showDialog({
              title: "Income Required",
              message: "Add this month's income before applying a percentage template.",
              type: "warning",
            });
            router.setParams({ injectedTemplate: "" });
            return;
          }

          let newAllocations: Record<string, number> = {};
          const skippedCategories: string[] = [];

          templateData.forEach((item) => {
            const category = String(item.category || "").trim();
            if (!category) return;

            if (!activeCategoryNames.has(category)) {
              skippedCategories.push(category);
              return;
            }

            if (item.mode === "Fixed") {
              newAllocations[category] = Number(item.value) || 0;
            } else if (item.mode === "Percentage") {
              // 自动规整小数位，避免金额变成 19.99999
              const calculated = (Number(item.value) / 100) * totalAvailable;
              newAllocations[category] = Number(calculated.toFixed(2));
            }
          });

          if (Object.keys(newAllocations).length === 0) {
            showDialog({
              title: "Template Not Applied",
              message: "This template does not contain any active expense categories.",
              type: "warning",
            });
            router.setParams({ injectedTemplate: "" });
            return;
          }

          const budgetDocId = `${user.uid}_${currentMonthStr}`;
          await setDoc(
            doc(db, "monthly_budgets", budgetDocId),
            {
              userId: user.uid,
              month: currentMonthStr,
              allocations: newAllocations,
            },
            { merge: true },
          );

          showDialog({
            title: skippedCategories.length > 0 ? "Template Applied Partially" : "Success",
            message:
              skippedCategories.length > 0
                ? `Template applied. ${skippedCategories.length} outdated categor${
                    skippedCategories.length === 1 ? "y was" : "ies were"
                  } ignored: ${skippedCategories.join(", ")}.`
                : "Template applied to your budget!",
            type: skippedCategories.length > 0 ? "warning" : "success",
          });
          router.setParams({ injectedTemplate: "" });
        } catch (error) {
          console.error("Template Parse Error", error);
          router.setParams({ injectedTemplate: "" });
        }
      };

      executeTemplate();
    }
  }, [
    activeCategoryNames,
    budgetLoaded,
    categoriesLoaded,
    currentMonthStr,
    params.injectedTemplate,
    router,
    showDialog,
    totalAvailable,
    transactionsLoaded,
  ]);

  const handleSaveSingleBudget = async () => {
    const user = auth.currentUser;
    if (!user || !editCategoryName) return;

    const newAmount = Number(editAmount) || 0;
    const newAllocations = { ...allocations, [editCategoryName]: newAmount };

    try {
      const budgetDocId = `${user.uid}_${currentMonthStr}`;
      await setDoc(
        doc(db, "monthly_budgets", budgetDocId),
        {
          userId: user.uid,
          month: currentMonthStr,
          allocations: newAllocations,
        },
        { merge: true },
      );
      setEditModalVisible(false);
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to update category budget.",
        type: "error",
      });
    }
  };

  // 🚨 新增：把闲置分类添加进预算
  const handleSaveNewBudget = async () => {
    if (!addCategoryName) {
      showDialog({
        title: "Oops",
        message: "Please select a category.",
        type: "warning",
      });
      return;
    }
    if (!addAmount) {
      showDialog({
        title: "Oops",
        message: "Please enter an amount.",
        type: "warning",
      });
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const newAmount = Number(addAmount) || 0;
    const newAllocations = { ...allocations, [addCategoryName]: newAmount };

    try {
      const budgetDocId = `${user.uid}_${currentMonthStr}`;
      await setDoc(
        doc(db, "monthly_budgets", budgetDocId),
        {
          userId: user.uid,
          month: currentMonthStr,
          allocations: newAllocations,
        },
        { merge: true },
      );

      setAddCategoryName("");
      setAddAmount("");
      setAddModalVisible(false);
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to add category budget.",
        type: "error",
      });
    }
  };

  const openEditModal = (categoryName: string, currentAllocated: number) => {
    setEditCategoryName(categoryName);
    setEditAmount(currentAllocated > 0 ? currentAllocated.toString() : "");
    setEditModalVisible(true);
  };

  const quickAction = async (type: string) => {
    if (type === "Reset") {
      const user = auth.currentUser;
      if (!user) return;
      await setDoc(
        doc(db, "monthly_budgets", `${user.uid}_${currentMonthStr}`),
        {
          userId: user.uid,
          month: currentMonthStr,
          allocations: {},
        },
        { merge: true },
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader showBack title={`Budget (${currentMonthStr})`} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 顶部大黄卡片 */}
        <View style={styles.topCard}>
          <Ionicons
            name="cube-outline"
            size={200}
            color="rgba(0,0,0,0.03)"
            style={styles.bgWatermark}
          />
          <Text style={styles.awaitingTitle}>Awaiting Assign:</Text>
          <Text
            style={[
              styles.awaitingAmount,
              { color: awaitingAssign < 0 ? palette.danger : palette.success },
            ]}
          >
            RM {awaitingAssign.toFixed(2)}
          </Text>

          {previousBalance !== 0 && (
            <View style={styles.rolloverBadge}>
              <Ionicons
                name={
                  previousBalance > 0 ? "arrow-down-circle" : "alert-circle"
                }
                size={16}
                color="#B77B00"
              />
              <Text style={styles.rolloverText}>
                {previousBalance > 0
                  ? "Historical balance: +"
                  : "Historical balance: "}{" "}
                RM {previousBalance.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.allocationSection}>
            <TouchableOpacity
              style={styles.allocationBtn}
              onPress={() => router.push("/template")}
            >
              <Text style={styles.allocationBtnText}>Use Template</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="flash-outline" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.allocationBtn, { backgroundColor: palette.danger }]}
              onPress={() => quickAction("Reset")}
            >
              <Text style={styles.allocationBtnText}>Reset All</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="refresh" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 底部明细卡片 */}
        <View style={styles.breakdownCard}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 5,
            }}
          >
            <Text style={styles.breakdownTitle}>Detailed Breakdown</Text>
            {/* 🚨 零基预算：如果还有闲置分类没加，就显示 + 号 */}
            {addableCategories.length > 0 && (
              <TouchableOpacity
                onPress={() => setAddModalVisible(true)}
                style={{ padding: 5 }}
              >
                <Ionicons name="add-circle" size={28} color={palette.primary} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={{ color: palette.textMuted, marginBottom: 15, fontSize: 12 }}>
            Tap any category to adjust its budget manually.
          </Text>

          {inactiveCategorySpend > 0 && (
            <View style={styles.inactiveCategoryCard}>
              <Ionicons name="information-circle-outline" size={18} color={palette.warning} />
              <Text style={styles.inactiveCategoryText}>
                RM {inactiveCategorySpend.toFixed(2)} from deleted categories still counts in
                total spending, but is hidden from active category budgets.
              </Text>
            </View>
          )}

          {/* 🚨 循环渲染活跃分类 */}
          {activeCategories.map((cat) => {
            const spent = activeExpensesByCategory[cat.name] || 0;
            const allocated = activeAllocations[cat.name] || 0;

            // 🚨 UI 劫持：判断这是否是目标存钱罐分类
            const isGoalCategory =
              cat.name.startsWith("🎯") || cat.isGoal || isSavingsCategoryName(cat.name);

            let progress =
              allocated > 0 ? spent / allocated : spent > 0 ? 1 : 0;
            const isUnbudgeted = allocated <= 0 && spent > 0;
            const isAtRisk = allocated > 0 && progress >= 0.8 && progress < 1;
            const isOverBudget = allocated > 0 && spent > allocated;

            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.budgetItem}
                onPress={() => openEditModal(cat.name, allocated)}
              >
                <View style={styles.itemTextRow}>
                  <Text style={styles.categoryName}>{cat.name}</Text>

                  <View style={styles.amountStatusGroup}>
                    {/* 🚨 专属文案：如果是 Goal 变蓝色，否则普通红黄绿 */}
                    {isGoalCategory ? (
                      <Text style={[styles.amountText, { color: palette.primary }]}>
                        {spent > 0
                          ? `Saved: RM ${allocated.toFixed(0)} · Recorded RM ${spent.toFixed(0)}`
                          : `Saved: RM ${allocated.toFixed(0)}`}
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.amountText}>
                          {isUnbudgeted
                            ? `RM ${spent.toFixed(0)} / No budget`
                            : `RM ${spent.toFixed(0)} / RM ${allocated.toFixed(0)}`}
                        </Text>
                        {isUnbudgeted ? (
                          <View style={styles.atRiskBadge}>
                            <Ionicons
                              name="warning"
                              size={14}
                              color={palette.warning}
                            />
                            <Text
                              style={[styles.atRiskText, { color: palette.warning }]}
                            >
                              No budget
                            </Text>
                          </View>
                        ) : isOverBudget ? (
                          <View style={styles.atRiskBadge}>
                            <Ionicons
                              name="alert-circle"
                              size={14}
                              color={palette.danger}
                            />
                            <Text style={styles.atRiskText}>Over!</Text>
                          </View>
                        ) : isAtRisk ? (
                          <View style={styles.atRiskBadge}>
                            <Ionicons
                              name="warning"
                              size={14}
                              color={palette.warning}
                            />
                            <Text
                              style={[styles.atRiskText, { color: palette.warning }]}
                            >
                              At risk
                            </Text>
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.progressBarBg}>
                  {/* 🚨 专属进度条：如果是 Goal，只要分配了就是蓝色的满条 */}
                  {isGoalCategory ? (
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: allocated > 0 ? "100%" : "0%",
                          backgroundColor: "#2196F3",
                        },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${isUnbudgeted ? 100 : Math.min(progress * 100, 100)}%` },
                        isUnbudgeted
                          ? styles.fillYellow
                          : isOverBudget
                            ? styles.fillRed
                            : isAtRisk
                              ? styles.fillYellow
                              : styles.fillGreen,
                      ]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {activeCategories.length === 0 && (
            <View
              style={{ alignItems: "center", marginTop: 20, paddingBottom: 20 }}
            >
              <Ionicons
                name="leaf-outline"
                size={48}
                color={palette.textSoft}
                style={{ marginBottom: 10 }}
              />
              <Text
                style={{ textAlign: "center", color: palette.textMuted, fontSize: 15 }}
              >
                Your budget is clean and empty.
              </Text>
              <Text
                style={{
                  textAlign: "center",
                  color: palette.textMuted,
                  fontSize: 15,
                  marginTop: 5,
                }}
              >
                Use a template or tap the + icon to start!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ========================================= */}
      {/* 🚨 手动微调预算的弹窗 (Edit) */}
      {/* ========================================= */}
      <Modal
        visible={isEditModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Adjust Budget</Text>
            <Text style={styles.modalSubtitle}>
              Set budget for{" "}
              <Text style={{ fontWeight: "bold", color: palette.primary }}>
                {editCategoryName}
              </Text>
            </Text>

            <View style={styles.inputContainer}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: palette.text,
                  marginRight: 10,
                }}
              >
                RM
              </Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#CCC"
                value={editAmount}
                onChangeText={setEditAmount}
                autoFocus
              />
            </View>

            <View style={styles.modalButtonGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveSingleBudget}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================= */}
      {/* 🚨 新增闲置分类的弹窗 (Add) */}
      {/* ========================================= */}
      <Modal
        visible={isAddModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Category Budget</Text>
            <Text style={styles.modalSubtitle}>
              Select a category to add to this month&apos;s budget.
            </Text>

            <View style={styles.pickerContainer}>
              <ScrollView
                style={styles.chipGroup}
                contentContainerStyle={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {addableCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.chip,
                      addCategoryName === cat.name && styles.chipSelected,
                    ]}
                    onPress={() => setAddCategoryName(cat.name)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        addCategoryName === cat.name && styles.chipTextSelected,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={[styles.inputContainer, { marginTop: 15 }]}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: palette.text,
                  marginRight: 10,
                }}
              >
                RM
              </Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#CCC"
                value={addAmount}
                onChangeText={setAddAmount}
              />
            </View>

            <View style={styles.modalButtonGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => {
                  setAddModalVisible(false);
                  setAddCategoryName("");
                  setAddAmount("");
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveNewBudget}
              >
                <Text style={styles.saveBtnText}>Add to Budget</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  headerTitle: { fontSize: 24, fontWeight: "900", color: palette.text },
  scrollContent: { padding: 20, paddingBottom: 40 },
  topCard: {
    backgroundColor: palette.accent,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: 25,
    overflow: "hidden",
    ...shadow.card,
  },
  bgWatermark: {
    position: "absolute",
    left: -40,
    top: 20,
    transform: [{ rotate: "-15deg" }],
  },
  awaitingTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: palette.text,
    marginBottom: 5,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  awaitingAmount: { fontSize: 36, fontWeight: "900", marginBottom: 5 },
  rolloverBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 20,
  },
  rolloverText: {
    fontSize: 13,
    fontWeight: "bold",
    color: palette.primary,
    marginLeft: 6,
  },
  allocationSection: { alignItems: "flex-end" },
  allocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.primary,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 10,
    borderRadius: 25,
    marginBottom: 10,
    width: 160,
  },
  allocationBtnText: { fontSize: 15, fontWeight: "bold", color: "#FFF" },
  arrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  breakdownCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.subtle,
  },
  breakdownTitle: { fontSize: 22, fontWeight: "900", color: palette.text },
  inactiveCategoryCard: {
    alignItems: "flex-start",
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    padding: spacing.md,
  },
  inactiveCategoryText: {
    color: palette.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginLeft: spacing.sm,
  },
  budgetItem: { marginBottom: 25 },
  itemTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  categoryName: { fontSize: 18, fontWeight: "900", color: palette.text },
  amountStatusGroup: { flexDirection: "row", alignItems: "center" },
  amountText: {
    fontSize: 13,
    fontWeight: "bold",
    color: palette.text,
    marginRight: 10,
  },
  atRiskBadge: { flexDirection: "row", alignItems: "center" },
  atRiskText: {
    fontSize: 13,
    fontWeight: "bold",
    color: palette.danger,
    marginLeft: 4,
  },
  progressBarBg: { height: 12, backgroundColor: "#EFEFEF", borderRadius: 6 },
  progressBarFill: { height: "100%", borderRadius: 6 },
  fillRed: { backgroundColor: "#E53935" },
  fillYellow: { backgroundColor: "#FFB300" },
  fillGreen: { backgroundColor: "#4CAF50" },

  // 弹窗通用样式
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
    ...shadow.card,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.text,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    color: palette.textMuted,
    textAlign: "center",
    marginBottom: 20,
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 15,
    paddingHorizontal: 20,
    height: 60,
    marginBottom: 25,
  },
  modalInput: { flex: 1, fontSize: 24, fontWeight: "bold", color: palette.primary },
  modalButtonGroup: { flexDirection: "row", justifyContent: "space-between" },
  modalBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: palette.surfaceMuted, marginRight: 10 },
  cancelBtnText: { fontSize: 16, fontWeight: "bold", color: palette.textMuted },
  saveBtn: { backgroundColor: palette.primary, marginLeft: 10 },
  saveBtnText: { fontSize: 16, fontWeight: "bold", color: "#FFF" },

  // 🚨 Add Modal 专属的分类胶囊样式
  pickerContainer: {
    backgroundColor: palette.surfaceMuted,
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: palette.border,
    maxHeight: 150,
  },
  chipGroup: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipSelected: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  chipText: { fontSize: 14, color: palette.textMuted, fontWeight: "600" },
  chipTextSelected: { color: palette.primary, fontWeight: "bold" },
});
