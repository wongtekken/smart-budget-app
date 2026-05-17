import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
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
import { AppHeader } from "../components/app-header";
import { useAppDialog } from "../components/app-dialog";
import { formatCurrency, palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

type RecurringTransaction = {
  id: string;
  amount?: number | string;
  category?: string;
  frequency?: string;
  isActive?: boolean;
  nextExecuteDate?: string;
  note?: string;
  startDate?: string;
  type?: string;
};

const getStatusColor = (item: RecurringTransaction) => {
  if (!item.isActive) return palette.textSoft;
  if (item.type === "Income") return palette.success;
  return palette.primary;
};

export default function RecurringScreen() {
  const { showConfirm, showDialog } = useAppDialog();
  const [loading, setLoading] = useState(true);
  const [recurringItems, setRecurringItems] = useState<RecurringTransaction[]>(
    [],
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const recurringQuery = query(
      collection(db, "recurring_transactions"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      recurringQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as RecurringTransaction[];
        items.sort((a, b) => {
          if (Boolean(a.isActive) !== Boolean(b.isActive)) {
            return a.isActive ? -1 : 1;
          }
          return (a.nextExecuteDate || "").localeCompare(
            b.nextExecuteDate || "",
          );
        });
        setRecurringItems(items);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsubscribe();
  }, []);

  const summary = useMemo(() => {
    const activeCount = recurringItems.filter((item) => item.isActive).length;
    const monthlyEstimate = recurringItems
      .filter((item) => item.isActive && item.type !== "Income")
      .reduce((sum, item) => {
        const amount = Number(item.amount) || 0;
        switch (item.frequency) {
          case "Daily":
            return sum + amount * 30;
          case "Weekly":
            return sum + amount * 4;
          case "Yearly":
            return sum + amount / 12;
          default:
            return sum + amount;
        }
      }, 0);

    return { activeCount, monthlyEstimate };
  }, [recurringItems]);

  const toggleActive = async (item: RecurringTransaction) => {
    try {
      await updateDoc(doc(db, "recurring_transactions", item.id), {
        isActive: !item.isActive,
        updatedAt: new Date(),
      });
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to update recurring transaction.",
        type: "error",
      });
    }
  };

  const deleteRecurring = async (item: RecurringTransaction) => {
    const confirmed = await showConfirm({
      title: "Delete Recurring Transaction",
      message: `Delete "${item.category || item.note || "Recurring transaction"}"? This will not remove transactions already created.`,
      confirmLabel: "Delete",
      type: "error",
    });

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "recurring_transactions", item.id));
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to delete recurring transaction.",
        type: "error",
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader showBack title="Recurring" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>Active schedules</Text>
            <Text style={styles.summaryValue}>{summary.activeCount}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryLabel}>Monthly estimate</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.monthlyEstimate)}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary} style={{ marginTop: 40 }} />
        ) : recurringItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="sync-outline" size={52} color={palette.textSoft} />
            <Text style={styles.emptyTitle}>No recurring transactions</Text>
            <Text style={styles.emptyText}>
              Create one from Add Transaction by choosing Daily, Weekly,
              Monthly, or Yearly.
            </Text>
          </View>
        ) : (
          recurringItems.map((item) => {
            const color = getStatusColor(item);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}>
                    <Ionicons name="sync-outline" size={22} color={color} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.categoryText} numberOfLines={1}>
                      {item.category || "Uncategorized"}
                    </Text>
                    <Text style={styles.noteText} numberOfLines={1}>
                      {item.note || item.frequency || "Recurring transaction"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.amountText,
                      {
                        color:
                          item.type === "Income"
                            ? palette.success
                            : palette.danger,
                      },
                    ]}
                  >
                    {item.type === "Income" ? "+ " : "- "}
                    {formatCurrency(Number(item.amount) || 0)}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Ionicons name="repeat-outline" size={14} color={color} />
                    <Text style={[styles.metaText, { color }]}>
                      {item.frequency || "Never"}
                    </Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Ionicons name="calendar-outline" size={14} color={color} />
                    <Text style={[styles.metaText, { color }]}>
                      Next: {item.nextExecuteDate || item.startDate || "-"}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      item.isActive ? styles.pauseButton : styles.resumeButton,
                    ]}
                    onPress={() => toggleActive(item)}
                  >
                    <Ionicons
                      name={item.isActive ? "pause" : "play"}
                      size={16}
                      color={item.isActive ? palette.textMuted : "#FFF"}
                    />
                    <Text
                      style={[
                        styles.actionText,
                        item.isActive ? styles.pauseText : styles.resumeText,
                      ]}
                    >
                      {item.isActive ? "Pause" : "Resume"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => deleteRecurring(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={palette.danger} />
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  headerIcon: { width: 40 },
  headerTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  scrollContent: { padding: spacing.xl, paddingBottom: 40 },
  summaryCard: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: radius.xl,
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 22,
    padding: spacing.xl,
    ...shadow.card,
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  summaryValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  summaryDivider: {
    backgroundColor: "rgba(0,0,0,0.08)",
    height: 46,
    width: 1,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 28,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...shadow.subtle,
  },
  cardTop: { alignItems: "center", flexDirection: "row" },
  iconBox: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    marginRight: 12,
    width: 44,
  },
  cardText: { flex: 1 },
  categoryText: { color: palette.text, fontSize: 16, fontWeight: "900" },
  noteText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  amountText: { fontSize: 15, fontWeight: "900", marginLeft: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  metaPill: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginBottom: 8,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaText: { fontSize: 12, fontWeight: "900", marginLeft: 5 },
  actions: { flexDirection: "row", marginTop: 8 },
  actionButton: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    flexDirection: "row",
    height: 44,
    justifyContent: "center",
  },
  pauseButton: { backgroundColor: palette.surfaceMuted, marginRight: 8 },
  resumeButton: { backgroundColor: palette.primary, marginRight: 8 },
  deleteButton: { backgroundColor: palette.dangerSoft, marginLeft: 8 },
  actionText: { fontSize: 14, fontWeight: "900", marginLeft: 6 },
  pauseText: { color: palette.textMuted },
  resumeText: { color: "#FFF" },
  deleteText: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: "900",
    marginLeft: 6,
  },
});
