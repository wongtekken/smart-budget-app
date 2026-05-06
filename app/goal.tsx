import { Ionicons } from "@expo/vector-icons";
/* eslint-disable react/no-unescaped-entities */
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

type GoalType = {
  id: string;
  userId: string;
  type: "Target" | "Flexible";
  title: string;
  initialAmount: number; // 🚨 改为初始金额
  targetAmount?: number;
  deadline?: string;
  createdAt: string;
};

const calculateDaysLeft = (deadlineStr?: string) => {
  if (!deadlineStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadlineStr);
  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

const formatDate = (d: Date) => {
  const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
};

export default function GoalScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const [goals, setGoals] = useState<GoalType[]>([]);
  // 🚨 新增：用来存储用户历史上所有的预算分配，用来算进度！
  const [allBudgets, setAllBudgets] = useState<Record<string, any>[]>([]);

  const [isModalVisible, setModalVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [newType, setNewType] = useState<"Target" | "Flexible">("Target");
  const [newTitle, setNewTitle] = useState("");
  const [newTargetAmount, setNewTargetAmount] = useState("");
  const [newInitialAmount, setNewInitialAmount] = useState("");

  const [deadlineDate, setDeadlineDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [isActionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalType | null>(null);

  // ==========================================
  // 🧠 数据流 1：拉取所有的 Goals
  // ==========================================
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, "goals"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: GoalType[] = [];
      snapshot.forEach((doc) =>
        data.push({ id: doc.id, ...doc.data() } as GoalType),
      );
      data.sort((a, b) => a.title.localeCompare(b.title));
      setGoals(data);
    });
    return () => unsubscribe();
  }, []);

  // ==========================================
  // 🧠 数据流 2：拉取历史上所有的 Budget 分配记录
  // ==========================================
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "monthly_budgets"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const budgets: any[] = [];
      snapshot.forEach((doc) => budgets.push(doc.data()));
      setAllBudgets(budgets);
    });
    return () => unsubscribe();
  }, []);

  // 辅助函数：根据预算计算当前目标的真实存款
  const getCalculatedCurrentAmount = (goal: GoalType) => {
    const categoryName = `🎯 ${goal.title}`;
    let allocatedSum = 0;

    // 遍历所有月份的预算，把分给这个目标的钱加起来
    allBudgets.forEach((budget) => {
      if (budget.allocations && budget.allocations[categoryName]) {
        allocatedSum += budget.allocations[categoryName];
      }
    });

    return (goal.initialAmount || 0) + allocatedSum;
  };

  const openCreateModal = () => {
    setEditingGoalId(null);
    setNewType("Target");
    setNewTitle("");
    setNewInitialAmount("");
    setNewTargetAmount("");
    setDeadlineDate(new Date());
    setModalVisible(true);
  };

  const openEditModal = (goal: GoalType) => {
    setEditingGoalId(goal.id);
    setNewType(goal.type);
    setNewTitle(goal.title); // 编辑时标题禁用修改，防止预算关联断裂
    setNewInitialAmount(goal.initialAmount.toString());

    if (goal.type === "Target") {
      setNewTargetAmount(goal.targetAmount?.toString() || "");
      setDeadlineDate(goal.deadline ? new Date(goal.deadline) : new Date());
    } else {
      setNewTargetAmount("");
      setDeadlineDate(new Date());
    }
    setModalVisible(true);
  };

  const handleLongPress = (goal: GoalType) => {
    setSelectedGoal(goal);
    setActionMenuVisible(true);
  };

  // ==========================================
  // 🛠️ 核心操作：保存与同步分类
  // ==========================================
  const handleSaveGoal = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Oops", "Please enter a goal title.");
      return;
    }
    if (newType === "Target" && !newTargetAmount) {
      Alert.alert("Oops", "Target goal requires a target amount.");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const initialAmt = Number(newInitialAmount) || 0;
      const baseData: any = {
        type: newType,
        title: newTitle.trim(),
        initialAmount: initialAmt, // 存入初始金额
      };

      if (newType === "Target") {
        baseData.targetAmount = Number(newTargetAmount);
        baseData.deadline = formatDate(deadlineDate);
      }

      if (editingGoalId) {
        // 更新模式（不更新名字，因为名字和预算绑定了）
        delete baseData.title;
        await updateDoc(doc(db, "goals", editingGoalId), baseData);
      } else {
        // 🚨 新建模式：不仅建 Goal，还要建一个“幽灵分类”
        const goalRef = await addDoc(collection(db, "goals"), {
          ...baseData,
          userId: user.uid,
          createdAt: formatDate(new Date()),
        });

        // ✨ 魔法联动：自动在 categories 集合里生成一个储蓄分类
        await addDoc(collection(db, "categories"), {
          userId: user.uid,
          type: "Expense", // 把存钱看作一种特殊的预算支出
          name: `🎯 ${newTitle.trim()}`,
          icon: "flag-outline",
          parentId: null,
          isDefault: false,
          isGoal: true, // 特殊标记
          goalId: goalRef.id,
        });
      }

      setModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Failed to save goal.");
    }
  };

  // ==========================================
  // 🗑️ 核心操作：删除与连带清理
  // ==========================================
  const handleDeleteGoal = (id: string, title: string) => {
    Alert.alert(
      "Delete Goal",
      `Are you sure you want to delete "${title}"? This will also remove its associated budget category.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. 删 Goal
              await deleteDoc(doc(db, "goals", id));
              // 2. 删对应的幽灵分类
              const q = query(
                collection(db, "categories"),
                where("goalId", "==", id),
              );
              const snap = await getDocs(q);
              snap.forEach(async (categoryDoc) => {
                await deleteDoc(doc(db, "categories", categoryDoc.id));
              });
            } catch (e) {
              console.error(e);
            }
          },
        },
      ],
    );
  };

  const filteredGoals = goals.filter((g) =>
    g.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const targetGoals = filteredGoals.filter((g) => g.type === "Target");
  const flexibleSavings = filteredGoals.filter((g) => g.type === "Flexible");

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerIcon}
        >
          <Ionicons name="arrow-back" size={32} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Goal</Text>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={palette.textSoft}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Goal"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity style={styles.newButton} onPress={openCreateModal}>
          <Ionicons
            name="add-circle"
            size={20}
            color="#FFF"
            style={styles.addIcon}
          />
          <Text style={styles.newButtonText}>New Goal</Text>
        </TouchableOpacity>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {targetGoals.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Target Goal</Text>
              <View style={styles.cardGroup}>
                {targetGoals.map((goal, index) => {
                  const targetAmt = goal.targetAmount || 1;
                  // 🚨 动态计算真实金额
                  const realCurrentAmount = getCalculatedCurrentAmount(goal);
                  const progressPercentage = Math.min(
                    (realCurrentAmount / targetAmt) * 100,
                    100,
                  );
                  const daysLeft = calculateDaysLeft(goal.deadline);

                  return (
                    <TouchableOpacity
                      key={goal.id}
                      activeOpacity={0.8}
                      onLongPress={() => handleLongPress(goal)}
                      style={[
                        styles.targetCard,
                        index === 0 && styles.firstCard,
                        index === targetGoals.length - 1 && styles.lastCard,
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={styles.goalTitle}>{goal.title}</Text>
                        <Text style={styles.detailText}>
                          Deadline: {goal.deadline}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.rowBetween,
                          { marginTop: 10, marginBottom: 8 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.detailText,
                            {
                              color: daysLeft === 0 ? palette.danger : palette.primary,
                              fontWeight: "bold",
                            },
                          ]}
                        >
                          {daysLeft === 0 ? "Expired" : `${daysLeft} days left`}
                        </Text>
                        <Text style={styles.amountText}>
                          RM {realCurrentAmount.toFixed(0)} /{" "}
                          {goal.targetAmount}
                        </Text>
                      </View>

                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${progressPercentage}%` },
                          ]}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {flexibleSavings.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>
                Flexible Savings
              </Text>
              <View style={styles.cardGroup}>
                {flexibleSavings.map((saving, index) => {
                  // 🚨 动态计算真实金额
                  const realCurrentAmount = getCalculatedCurrentAmount(saving);

                  return (
                    <TouchableOpacity
                      key={saving.id}
                      activeOpacity={0.8}
                      onLongPress={() => handleLongPress(saving)}
                      style={[
                        styles.flexibleCard,
                        index === 0 && styles.firstCard,
                        index === flexibleSavings.length - 1 && styles.lastCard,
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={styles.goalTitle}>{saving.title}</Text>
                        <Text style={styles.detailText}>
                          Created: {saving.createdAt}
                        </Text>
                      </View>

                      <View style={styles.balanceRow}>
                        <Text style={styles.balanceLabel}>
                          Current Balance:
                        </Text>
                        <Text style={styles.balanceAmount}>
                          RM {realCurrentAmount.toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {goals.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 50 }}>
              <Ionicons name="flag-outline" size={48} color="#E0E0E0" />
              <Text style={styles.noResultText}>
                No goals found. Set your first goal!
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* 🚨 Action Menu */}
      <Modal
        visible={isActionMenuVisible}
        transparent={true}
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => setActionMenuVisible(false)}
        >
          <View style={styles.actionMenu}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setActionMenuVisible(false);
                if (selectedGoal) openEditModal(selectedGoal);
              }}
            >
              <Ionicons name="pencil-outline" size={22} color="#333" />
              <Text style={styles.actionBtnText}>Edit Goal</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setActionMenuVisible(false);
                if (selectedGoal)
                  handleDeleteGoal(selectedGoal.id, selectedGoal.title);
              }}
            >
              <Ionicons name="trash-outline" size={22} color={palette.danger} />
              <Text style={[styles.actionBtnText, { color: palette.danger }]}>
                Delete Goal
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 🚨 Builder Modal */}
      <Modal visible={isModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>
              {editingGoalId ? "Edit Goal Details" : "Create New Goal"}
            </Text>

            {!editingGoalId && (
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    newType === "Target" && styles.segmentSelected,
                  ]}
                  onPress={() => setNewType("Target")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      newType === "Target" && styles.segmentTextSelected,
                    ]}
                  >
                    Target Goal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    newType === "Flexible" && styles.segmentSelected,
                  ]}
                  onPress={() => setNewType("Flexible")}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      newType === "Flexible" && styles.segmentTextSelected,
                    ]}
                  >
                    Flexible Saving
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputBox}>
              <Text style={styles.inputLabel}>
                Goal Name {editingGoalId && "(Cannot be changed)"}
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  editingGoalId && {
                    backgroundColor: palette.surfaceMuted,
                    color: palette.textSoft,
                  },
                ]}
                placeholder="e.g., New MacBook"
                placeholderTextColor="#CCC"
                value={newTitle}
                onChangeText={setNewTitle}
                editable={!editingGoalId} // 🚨 编辑模式下禁止修改名字
              />
            </View>

            <View style={styles.inputBox}>
              <Text style={styles.inputLabel}>Initial Deposit</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="RM 0.00"
                keyboardType="numeric"
                placeholderTextColor="#CCC"
                value={newInitialAmount}
                onChangeText={setNewInitialAmount}
              />
              <Text
                style={{
                  fontSize: 12,
                  color: "#888",
                  marginTop: 4,
                  marginLeft: 4,
                }}
              >
                Tip: To add more money later, go to Budget and allocate funds
                to "🎯 {newTitle || "Your Goal"}"
              </Text>
            </View>

            {newType === "Target" && (
              <>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Target Amount</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="RM 5000"
                    keyboardType="numeric"
                    placeholderTextColor="#CCC"
                    value={newTargetAmount}
                    onChangeText={setNewTargetAmount}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Deadline</Text>
                  <TouchableOpacity
                    style={[styles.modalInput, { justifyContent: "center" }]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={{ fontSize: 16, color: "#333" }}>
                      {formatDate(deadlineDate)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGoal}>
                <Text style={styles.saveBtnText}>
                  {editingGoalId ? "Update Goal" : "Save Goal"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={deadlineDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setDeadlineDate(date);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// 样式代码保持不变，为了排版美观，可以直接复用你现有的 styles ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerIcon: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: palette.text },
  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 15,
    ...shadow.subtle,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: palette.text },
  newButton: {
    flexDirection: "row",
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 25,
    ...shadow.subtle,
  },
  addIcon: { marginRight: 8 },
  newButtonText: { fontSize: 18, fontWeight: "bold", color: "#FFF" },
  listContainer: { paddingBottom: 40 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: palette.text,
    marginBottom: 15,
  },
  cardGroup: {
    ...shadow.subtle,
  },
  targetCard: {
    backgroundColor: palette.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomWidth: 0,
  },
  flexibleCard: {
    backgroundColor: palette.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomWidth: 0,
  },
  firstCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastCard: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalTitle: { fontSize: 18, fontWeight: "800", color: palette.text },
  detailText: { fontSize: 12, fontWeight: "600", color: palette.textMuted },
  amountText: { fontSize: 14, fontWeight: "800", color: palette.text },
  progressBarBg: {
    height: 12,
    backgroundColor: palette.primarySoft,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: palette.primary,
    borderRadius: 6,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  balanceLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.text,
    marginRight: 10,
  },
  balanceAmount: { fontSize: 24, fontWeight: "900", color: palette.success },
  noResultText: {
    textAlign: "center",
    marginTop: 15,
    color: palette.textMuted,
    fontSize: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 25,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalHeaderTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: palette.text,
    marginBottom: 20,
    textAlign: "center",
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    marginBottom: 20,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  segmentSelected: { backgroundColor: palette.surface, ...shadow.subtle },
  segmentText: { fontSize: 15, fontWeight: "bold", color: palette.textMuted },
  segmentTextSelected: { color: palette.text },
  inputBox: { marginBottom: 15 },
  inputLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: palette.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  modalInput: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    height: 55,
    fontSize: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: palette.surfaceMuted,
    height: 55,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  cancelBtnText: { fontSize: 16, fontWeight: "bold", color: palette.textMuted },
  saveBtn: {
    flex: 1,
    backgroundColor: palette.primary,
    height: 55,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  saveBtnText: { fontSize: 16, fontWeight: "bold", color: "#FFF" },

  actionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionMenu: {
    width: "80%",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    backgroundColor: palette.surface,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: palette.text,
    marginLeft: 15,
  },
  actionDivider: { height: 1, backgroundColor: palette.border },
});
