import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// 🚨 引入 deleteDoc 和 doc 来实现真实删除
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { AppHeader } from "../components/app-header";
import { useAppDialog } from "../components/app-dialog";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

const getTransactionDateTime = (tx: any) =>
  new Date(tx.date || "1970-01-01").getTime();

const getCreatedTime = (tx: any) =>
  tx.createdAt?.toMillis?.() ?? (new Date(tx.createdAt || 0).getTime() || 0);

const sortTransactionsByDate = (a: any, b: any) => {
  const dateDiff = getTransactionDateTime(b) - getTransactionDateTime(a);
  if (dateDiff !== 0) return dateDiff;
  return getCreatedTime(b) - getCreatedTime(a);
};

const getAmountPrefix = (type?: string) => {
  if (type === "Expense") return "- ";
  if (type === "Income") return "+ ";
  return "";
};

const getAmountColor = (type?: string) => {
  if (type === "Expense") return "#E53935";
  if (type === "Income") return "#4CAF50";
  return palette.primary;
};

const getLocalMonthStr = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
};

const getMonthLabel = (month: string) => {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

const shiftMonth = (month: string, offset: number) => {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + offset, 1);
  return getLocalMonthStr(date);
};

export default function TransactionsScreen() {
  const router = useRouter();
  const { showConfirm, showDialog } = useAppDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthStr());
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 状态管理
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  // 🚨 两个不同的弹窗开关
  const [isDetailsVisible, setDetailsVisible] = useState(false); // 详情弹窗
  const [isActionMenuVisible, setActionMenuVisible] = useState(false); // 长按菜单弹窗

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveData: any[] = [];
      snapshot.forEach((doc) => {
        liveData.push({ id: doc.id, ...doc.data() });
      });

      liveData.sort(sortTransactionsByDate);

      setTransactions(liveData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const monthlyTransactions = transactions.filter((item) =>
    String(item.date || "").startsWith(selectedMonth),
  );

  const groupedTransactions = monthlyTransactions
    .filter((item) =>
      (item.category || item.note || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    )
    .reduce((groups: any, item: any) => {
      const date = item.date || "Unknown Date";
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
      return groups;
    }, {});

  const groupedArray = Object.keys(groupedTransactions)
    .sort((a, b) => {
      if (a === "Unknown Date") return 1;
      if (b === "Unknown Date") return -1;
      return new Date(b).getTime() - new Date(a).getTime();
    })
    .map((date) => ({
      date,
      data: groupedTransactions[date].sort(sortTransactionsByDate),
    }));

  // 单击：打开详情
  const openDetails = (tx: any) => {
    setSelectedTx(tx);
    setDetailsVisible(true);
  };

  // 🚨 长按：打开操作菜单
  const openActionMenu = (tx: any) => {
    setSelectedTx(tx);
    setActionMenuVisible(true);
  };

  // 🚨 极其硬核：真实的删除逻辑
  const handleDelete = async () => {
    const confirmed = await showConfirm({
      title: "Delete Transaction",
      message: "Are you sure you want to delete this record? This cannot be undone.",
      confirmLabel: "Delete",
      type: "error",
    });

    if (!confirmed || !selectedTx) return;

    try {
      await deleteDoc(doc(db, "transactions", selectedTx.id));
      setActionMenuVisible(false);
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to delete transaction.",
        type: "error",
      });
    }
  };

  const DetailRow = ({
    icon,
    label,
    value,
    valueColor = "#333",
  }: {
    icon: any;
    label: string;
    value: string;
    valueColor?: string;
  }) => (
    <View style={styles.detailRow}>
      <View style={styles.detailRowLeft}>
        <Ionicons
          name={icon}
          size={20}
          color="#888"
          style={{ marginRight: 10 }}
        />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={[styles.detailValue, { color: valueColor }]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader
        rightAction={{
          accessibilityLabel: "Transaction options",
          icon: "options-outline",
        }}
        showBack
        title="Transactions"
      />

      <View style={styles.content}>
        <View style={styles.monthNavigator}>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => setSelectedMonth((month) => shiftMonth(month, -1))}
          >
            <Ionicons name="chevron-back" size={22} color={palette.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.monthLabelButton}
            onPress={() => setSelectedMonth(getLocalMonthStr())}
          >
            <Text style={styles.monthLabel}>{getMonthLabel(selectedMonth)}</Text>
            <Text style={styles.monthHint}>Tap to return to this month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.monthButton,
              selectedMonth >= getLocalMonthStr() && styles.monthButtonDisabled,
            ]}
            onPress={() => setSelectedMonth((month) => shiftMonth(month, 1))}
            disabled={selectedMonth >= getLocalMonthStr()}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={
                selectedMonth >= getLocalMonthStr()
                  ? palette.textSoft
                  : palette.primary
              }
            />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#999"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Transaction"
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color="#FF8216"
            style={{ marginTop: 50 }}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          >
            {groupedArray.map((group) => (
              <View key={group.date} style={styles.dateGroup}>
                <Text style={styles.dateTitle}>{group.date}</Text>

                <View style={styles.cardGroup}>
                  {group.data.map((item: any, index: number) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.7}
                      onPress={() => openDetails(item)} // 🚨 单击看详情
                      onLongPress={() => openActionMenu(item)} // 🚨 长按弹菜单
                      delayLongPress={300} // 🚨 稍微加点延迟，防止误触
                      style={[
                        styles.transactionItem,
                        index === 0 && styles.firstItem,
                        index === group.data.length - 1 && styles.lastItem,
                      ]}
                    >
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text style={styles.itemName}>
                          {item.category || item.note || "Uncategorized"}
                        </Text>
                        {item.recurring && item.recurring !== "Never" && (
                          <Ionicons
                            name="sync-outline"
                            size={14}
                            color="#FF8216"
                            style={{ marginLeft: 6 }}
                          />
                        )}
                      </View>

                      <Text
                        style={[
                          styles.itemAmount,
                          { color: getAmountColor(item.type) },
                        ]}
                      >
                        {getAmountPrefix(item.type)}RM{" "}
                        {Number(item.amount).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            {groupedArray.length === 0 && (
              <Text style={styles.noResultText}>
                No transactions found for {getMonthLabel(selectedMonth)}
              </Text>
            )}
          </ScrollView>
        )}
      </View>

      {/* ========================================= */}
      {/* 1. 详情弹窗 (保持原样) */}
      {/* ========================================= */}
      <Modal
        visible={isDetailsVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* 🚨 只要 selectedTx 是 null，这里面的内容就不会渲染，也就不会报错了！ */}
            {selectedTx ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalType}>{selectedTx?.type}</Text>
                  <Text
                    style={[
                      styles.modalAmount,
                      {
                        color:
                          getAmountColor(selectedTx?.type),
                      },
                    ]}
                  >
                    {getAmountPrefix(selectedTx?.type)}RM{" "}
                    {selectedTx?.amount
                      ? Number(selectedTx.amount).toFixed(2)
                      : "0.00"}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailsContainer}>
                  <DetailRow
                    icon="pricetag-outline"
                    label="Category"
                    value={selectedTx?.category || "None"}
                  />
                  <DetailRow
                    icon="calendar-outline"
                    label="Date"
                    value={selectedTx?.date || ""}
                  />
                  <View style={styles.detailRow}>
                    <View style={styles.detailRowLeft}>
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color="#888"
                        style={{ marginRight: 10 }}
                      />
                      <Text style={styles.detailLabel}>Note</Text>
                    </View>
                    <Text
                      style={[
                        styles.detailValue,
                        { flex: 1, textAlign: "right", marginLeft: 20 },
                      ]}
                      numberOfLines={3}
                    >
                      {selectedTx?.note || "No note added"}
                    </Text>
                  </View>
                  <DetailRow
                    icon="sync-outline"
                    label="Recurring"
                    value={selectedTx?.recurring || "Never"}
                    valueColor={
                      selectedTx?.recurring && selectedTx?.recurring !== "Never"
                        ? "#FF8216"
                        : "#888"
                    }
                  />
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setDetailsVisible(false)}
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ========================================= */}
      {/* 🚨 2. 新增：长按操作菜单 (中心弹出的 Context Menu) */}
      {/* ========================================= */}
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
            {/* Edit 按钮 */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setActionMenuVisible(false);
                if (selectedTx) {
                  router.push({
                    pathname: "/(tabs)/add",
                    params: {
                      editId: selectedTx.id,
                      returnedType: selectedTx.type,
                      returnedAmount: selectedTx.amount
                        ? selectedTx.amount.toString()
                        : "",
                      returnedCategory: selectedTx.category || "",
                      returnedGoalId: selectedTx.goalId || "",
                      returnedNote: selectedTx.note || "",
                      returnedDate: selectedTx.date || "",
                      returnedRecurring: selectedTx.recurring || "Never",
                      recurringId: selectedTx.recurringId || "",
                    },
                  });
                }
              }}
            >
              <Ionicons name="pencil-outline" size={22} color="#333" />
              <Text style={styles.actionBtnText}>Edit Transaction</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            {/* Delete 按钮 */}
            <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color="#E53935" />
              <Text style={[styles.actionBtnText, { color: "#E53935" }]}>
                Delete Transaction
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerIcon: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#000" },
  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  monthNavigator: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    padding: 8,
    ...shadow.subtle,
  },
  monthButton: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monthButtonDisabled: {
    backgroundColor: palette.surfaceMuted,
  },
  monthLabelButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  monthLabel: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
  },
  monthHint: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  searchRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    height: 50,
    ...shadow.subtle,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: "#333" },
  listContainer: { paddingBottom: 40 },
  dateGroup: { marginBottom: 20 },
  dateTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#444",
    marginBottom: 10,
    marginLeft: 5,
  },
  cardGroup: {
    ...shadow.subtle,
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: palette.surface,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomWidth: 0,
  },
  firstItem: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  lastItem: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 1,
  },
  itemName: { fontSize: 16, fontWeight: "800", color: "#333" },
  itemAmount: { fontSize: 16, fontWeight: "bold" },
  expenseText: { color: "#E53935" },
  incomeText: { color: "#4CAF50" },
  noResultText: {
    textAlign: "center",
    marginTop: 40,
    color: "#999",
    fontSize: 16,
  },

  // 详情弹窗样式
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
    paddingBottom: Platform.OS === "ios" ? 40 : 25,
    ...shadow.card,
  },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalType: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  modalAmount: { fontSize: 36, fontWeight: "900" },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    width: "100%",
    marginBottom: 20,
  },
  detailsContainer: { marginBottom: 30 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F9F9F9",
  },
  detailRowLeft: { flexDirection: "row", alignItems: "center" },
  detailLabel: { fontSize: 16, color: "#666" },
  detailValue: { fontSize: 16, fontWeight: "bold", color: "#333" },
  closeBtn: {
    backgroundColor: "#F0F0F0",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  closeBtnText: { fontSize: 16, fontWeight: "bold", color: "#333" },

  // 🚨 操作菜单样式 (居中弹出的菜单)
  actionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionMenu: {
    width: "70%",
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  actionBtnText: {
    fontSize: 17,
    fontWeight: "bold",
    marginLeft: 15,
    color: "#333",
  },
  actionDivider: { height: 1, backgroundColor: "#F0F0F0" },
});
