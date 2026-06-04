import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { AppHeader } from "../components/app-header";
import { useAppDialog } from "../components/app-dialog";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type CategoryType = {
  id: string;
  userId: string;
  type: string;
  name: string;
  icon: string;
  parentId: string | null;
  isDefault: boolean;
  isGoal?: boolean;
  goalId?: string;
};

type CategoryTab = "Expense" | "Income";

const GOAL_PREFIX = "\uD83C\uDFAF";
const CATEGORY_TABS: CategoryTab[] = ["Expense", "Income"];

const normalizeName = (value: string) => value.trim().toLowerCase();
const isGoalCategory = (category: CategoryType) =>
  Boolean(category.isGoal) ||
  category.type === "Transfer" ||
  category.name.startsWith(GOAL_PREFIX);

export default function ManageCategoriesScreen() {
  const { showConfirm, showDialog } = useAppDialog();
  const duplicateCleanupInFlightRef = useRef(false);

  const [activeTab, setActiveTab] = useState<CategoryTab>("Expense");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalVisible, setModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingToParentId, setAddingToParentId] = useState<string | null>(null);

  const [editingCategory, setEditingCategory] = useState<CategoryType | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryType[]>([]);

  // 🚨 新增：自定义操作菜单 (Action Menu) 状态
  const [isActionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedForAction, setSelectedForAction] = useState<{
    cat: CategoryType;
    isParent: boolean;
  } | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "categories"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const defaultGroups = new Map<string, typeof snapshot.docs>();

      snapshot.docs.forEach((categoryDoc) => {
        const data = categoryDoc.data();
        if (!data.isDefault || data.parentId) return;

        const key = `${data.type}:${String(data.name).trim().toLowerCase()}`;
        const group = defaultGroups.get(key) || [];
        group.push(categoryDoc);
        defaultGroups.set(key, group);
      });

      const duplicateDefaultDocs = Array.from(defaultGroups.values()).flatMap(
        (group) => group.slice(1),
      );
      const duplicateDefaultIds = new Set(
        duplicateDefaultDocs.map((categoryDoc) => categoryDoc.id),
      );

      if (
        duplicateDefaultDocs.length > 0 &&
        !duplicateCleanupInFlightRef.current
      ) {
        duplicateCleanupInFlightRef.current = true;
        try {
          const batch = writeBatch(db);
          duplicateDefaultDocs.forEach((categoryDoc) => {
            batch.delete(categoryDoc.ref);
          });
          await batch.commit();
        } catch (error) {
          console.error("Error cleaning duplicate default categories:", error);
        } finally {
          duplicateCleanupInFlightRef.current = false;
        }
      }

      const liveData: CategoryType[] = [];
      snapshot.forEach((doc) => {
        if (duplicateDefaultIds.has(doc.id)) return;
        liveData.push({ id: doc.id, ...doc.data() } as CategoryType);
      });

      liveData.sort((a, b) => {
        if (a.isDefault === b.isDefault) return a.name.localeCompare(b.name);
        return a.isDefault ? -1 : 1;
      });

      setCategories(liveData);
    });

    return () => unsubscribe();
  }, []);

  const currentTabData = categories.filter((category) => {
    if (activeTab === "Expense") {
      return category.type === "Expense" && !isGoalCategory(category);
    }
    return category.type === "Income";
  });
  const allParents = currentTabData.filter((c) => !c.parentId);

  const getSubcategories = (parentId: string) => {
    return currentTabData.filter((c) => c.parentId === parentId);
  };

  const filteredParents = allParents.filter((parent) => {
    const matchesParent = parent.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const subs = getSubcategories(parent.id);
    const matchesSub = subs.some((sub) =>
      sub.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    return matchesParent || matchesSub;
  });

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prevId) => (prevId === id ? null : id));
  };

  // 🚨 触发长按：打开自定义菜单
  const handleLongPress = (category: CategoryType, isParent: boolean) => {
    if (category.isDefault) {
      showDialog({
        title: "System Category",
        message: "Default categories cannot be edited or deleted.",
        type: "info",
      });
      return;
    }
    if (isGoalCategory(category)) {
      showDialog({
        title: "Goal Category",
        message: "This is linked to a Goal. Please manage it from the Goal screen.",
        type: "info",
      });
      return;
    }
    setSelectedForAction({ cat: category, isParent });
    setActionMenuVisible(true);
  };

  const handleDelete = async (id: string, name: string, isParent: boolean) => {
    const confirmed = await showConfirm({
      title: "Delete Category",
      message: `Are you sure you want to delete "${name}"? Historical transactions will stay unchanged, but this category will no longer appear in active budgets or AI category insights. ${
        isParent ? "All subcategories inside will also be deleted." : ""
      }`,
      confirmLabel: "Delete",
      type: "error",
    });

    if (!confirmed) return;

    try {
      if (isParent) {
        const subs = getSubcategories(id);
        for (const sub of subs) {
          await deleteDoc(doc(db, "categories", sub.id));
        }
      }
      await deleteDoc(doc(db, "categories", id));
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to delete.",
        type: "error",
      });
    }
  };

  const handleSaveCategory = async () => {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName) {
      showDialog({
        title: "Oops",
        message: "Please enter a name.",
        type: "warning",
      });
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    const targetParentId = editingCategory
      ? editingCategory.parentId || null
      : addingToParentId || null;
    const duplicateCategory = categories.find(
      (category) =>
        category.id !== editingCategory?.id &&
        category.type === activeTab &&
        (category.parentId || null) === targetParentId &&
        normalizeName(category.name) === normalizeName(trimmedName),
    );

    if (duplicateCategory) {
      showDialog({
        title: "Duplicate Category",
        message: `"${trimmedName}" already exists. Please use a different category name.`,
        type: "warning",
      });
      return;
    }

    try {
      if (editingCategory) {
        await updateDoc(doc(db, "categories", editingCategory.id), {
          name: trimmedName,
          updatedAt: new Date(),
        });
      } else {
        await addDoc(collection(db, "categories"), {
          userId: user.uid,
          type: activeTab,
          name: trimmedName,
          icon: addingToParentId ? "ellipse-outline" : "star",
          parentId: addingToParentId,
          isDefault: false,
          createdAt: new Date(),
        });
      }
      closeModal();
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to save category.",
        type: "error",
      });
    }
  };

  const openAddParentModal = () => {
    setEditingCategory(null);
    setAddingToParentId(null);
    setNewCategoryName("");
    setModalVisible(true);
  };

  const openAddSubModal = (parentId: string) => {
    setEditingCategory(null);
    setAddingToParentId(parentId);
    setNewCategoryName("");
    setModalVisible(true);
  };

  const openEditModal = (category: CategoryType) => {
    setEditingCategory(category);
    setAddingToParentId(null);
    setNewCategoryName(category.name);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setNewCategoryName("");
    setEditingCategory(null);
    setAddingToParentId(null);
  };

  const emptyCategoryMessage = `No ${activeTab} categories yet. Click + to add one.`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader showBack title="Manage Categories" />

      <View style={styles.content}>
        <View style={styles.segmentedControl}>
          {CATEGORY_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.segment, activeTab === tab && styles.segmentSelected]}
              onPress={() => {
                setActiveTab(tab);
                setSearchQuery("");
                setExpandedId(null);
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === tab && styles.segmentTextSelected,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={palette.textSoft}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab} Category`}
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity style={styles.newButton} onPress={openAddParentModal}>
          <Ionicons
            name="add-circle"
            size={20}
            color="#FFF"
            style={styles.addIcon}
          />
          <Text style={styles.newButtonText}>Add Category</Text>
        </TouchableOpacity>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          <View style={styles.cardGroup}>
            {filteredParents.map((parent, index) => {
              const subs = getSubcategories(parent.id);
              const hasMatchingSub =
                searchQuery.length > 0 &&
                subs.some((sub) =>
                  sub.name.toLowerCase().includes(searchQuery.toLowerCase()),
                );
              const isExpanded = expandedId === parent.id || hasMatchingSub;
              const isIncome = activeTab === "Income";

              return (
                <View
                  key={parent.id}
                  style={[
                    styles.categoryWrapper,
                    index === 0 && styles.firstItem,
                    index === filteredParents.length - 1 && styles.lastItem,
                  ]}
                >
                  {/* === 父级 UI === */}
                  <TouchableOpacity
                    style={styles.categoryParent}
                    activeOpacity={0.7}
                    onPress={() => toggleExpand(parent.id)}
                    onLongPress={() => handleLongPress(parent, true)} // 🚨 长按父级
                  >
                    <View style={styles.itemLeft}>
                      <View
                        style={[
                          styles.iconBox,
                          {
                            backgroundColor: isIncome
                              ? "#E8F5E9"
                              : "#FFF3E0",
                          },
                        ]}
                      >
                        <Ionicons
                          name={parent.icon as any}
                          size={20}
                          color={isIncome ? palette.success : palette.primary}
                        />
                      </View>
                      <Text style={styles.itemName} numberOfLines={1}>{parent.name}</Text>
                    </View>

                    <View style={styles.actionGroup}>
                      {/* 🚨 如果是默认，显示锁头 */}
                      {parent.isDefault && (
                        <Ionicons
                          name="lock-closed"
                          size={16}
                          color={palette.textSoft}
                          style={{ marginRight: 15 }}
                        />
                      )}
                      {/* 🚨 如果是目标，显示靶子图标 */}
                      {isGoalCategory(parent) && (
                        <Ionicons
                          name="flag"
                          size={16}
                          color={palette.primary}
                          style={{ marginRight: 15 }}
                        />
                      )}
                      {!parent.isDefault && !isGoalCategory(parent) && (
                        <TouchableOpacity
                          hitSlop={8}
                          onPress={() => handleLongPress(parent, true)}
                          style={styles.moreButton}
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color={palette.textSoft} />
                        </TouchableOpacity>
                      )}
                      <Ionicons
                        name={isExpanded ? "chevron-down" : "chevron-forward"}
                        size={20}
                        color={palette.textSoft}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* === 子级 UI === */}
                  {isExpanded && (
                    <View style={styles.subCategoryContainer}>
                      {subs
                        .filter(
                          (sub) =>
                            sub.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                            parent.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                        )
                        .map((sub, subIndex, filteredArray) => (
                          // 🚨 把原本的 View 换成了 TouchableOpacity 以支持长按
                          <TouchableOpacity
                            key={sub.id}
                            style={[
                              styles.subCategoryItem,
                              subIndex === filteredArray.length - 1 &&
                                styles.subCategoryItemLast,
                            ]}
                            activeOpacity={0.7}
                            onLongPress={() => handleLongPress(sub, false)} // 🚨 长按子级
                          >
                            <View style={styles.subItemLeft}>
                              <View style={styles.subDot} />
                              <Text style={styles.subItemName} numberOfLines={1}>{sub.name}</Text>
                            </View>

                            <View style={styles.actionGroup}>
                              {sub.isDefault || isGoalCategory(sub) ? (
                                <Ionicons
                                  name={isGoalCategory(sub) ? "flag" : "lock-closed"}
                                  size={14}
                                  color={isGoalCategory(sub) ? palette.primary : palette.textSoft}
                                  style={{ marginRight: 5 }}
                                />
                              ) : (
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() => handleLongPress(sub, false)}
                                  style={styles.moreButton}
                                >
                                  <Ionicons name="ellipsis-horizontal" size={20} color={palette.textSoft} />
                                </TouchableOpacity>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}

                      {searchQuery.length === 0 && (
                        <TouchableOpacity
                          style={styles.addSubBtn}
                          onPress={() => openAddSubModal(parent.id)}
                        >
                          <Ionicons name="add" size={18} color={palette.textMuted} />
                          <Text style={styles.addSubText}>Add Subcategory</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {filteredParents.length === 0 && (
              <Text style={styles.noResultText}>
                {searchQuery
                  ? "No matching categories found."
                  : emptyCategoryMessage}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ========================================= */}
      {/* 🚨 自定义操作菜单 Modal (Action Menu) */}
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
                if (selectedForAction) {
                  openEditModal(selectedForAction.cat);
                }
              }}
            >
              <Ionicons name="pencil-outline" size={22} color="#333" />
              <Text style={styles.actionBtnText}>Edit Category</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            {/* Delete 按钮 */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setActionMenuVisible(false);
                if (selectedForAction) {
                  handleDelete(
                    selectedForAction.cat.id,
                    selectedForAction.cat.name,
                    selectedForAction.isParent,
                  );
                }
              }}
            >
              <Ionicons name="trash-outline" size={22} color={palette.danger} />
              <Text style={[styles.actionBtnText, { color: palette.danger }]}>
                Delete Category
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ========================================= */}
      {/* 原有的编辑/新增 Modal */}
      {/* ========================================= */}
      <Modal visible={isModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory
                ? "Edit Category"
                : addingToParentId
                  ? "New Subcategory"
                  : `New ${activeTab} Category`}
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter name"
                placeholderTextColor="#CCC"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus
              />
            </View>
            <View style={styles.modalButtonGroup}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={closeModal}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={handleSaveCategory}
              >
                <Text style={styles.saveBtnText}>
                  {editingCategory ? "Update" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    marginBottom: spacing.xl,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  segmentSelected: {
    backgroundColor: palette.surface,
    ...shadow.subtle,
  },
  segmentText: { fontSize: 15, fontWeight: "bold", color: palette.textMuted },
  segmentTextSelected: { color: palette.text },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: spacing.xl,
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
  cardGroup: {
    ...shadow.subtle,
  },
  categoryWrapper: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomWidth: 0,
  },
  firstItem: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastItem: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: 1,
  },
  categoryParent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  itemLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    marginRight: spacing.md,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  itemName: { flex: 1, fontSize: 16, fontWeight: "bold", color: palette.text },
  actionGroup: { flexDirection: "row", alignItems: "center" },
  moreButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    marginRight: 8,
    width: 32,
  },
  subCategoryContainer: {
    backgroundColor: palette.surfaceMuted,
    paddingLeft: 75,
    paddingRight: 20,
    paddingBottom: 10,
  },
  subCategoryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  subCategoryItemLast: { borderBottomWidth: 0 },
  subItemLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    marginRight: spacing.md,
    minWidth: 0,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.textSoft,
    marginRight: 10,
  },
  subItemName: { flex: 1, fontSize: 15, color: palette.textMuted },
  addSubBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 5,
    paddingVertical: 8,
  },
  addSubText: {
    fontSize: 14,
    color: palette.textMuted,
    marginLeft: 5,
    fontWeight: "bold",
  },
  noResultText: {
    textAlign: "center",
    marginTop: 40,
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },

  // 🚨 Action Menu 样式
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

  // 🚨 Edit / New Modal 样式
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: 25,
    ...shadow.card,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: palette.text,
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    height: 55,
    justifyContent: "center",
    marginBottom: 25,
  },
  modalInput: { fontSize: 16, color: palette.text },
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
});
