import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { AppHeader } from "../components/app-header";
import { useAppDialog } from "../components/app-dialog";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

type AllocationType = {
  categoryId: string;
  category: string;
  mode: "Fixed" | "Percentage";
  value: number;
};

type TemplateType = {
  id: string;
  name: string;
  allocations: AllocationType[];
  isDefault?: boolean;
  templateKey?: string;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

export default function TemplateScreen() {
  const router = useRouter();
  const { showConfirm, showDialog } = useAppDialog();
  const [searchQuery, setSearchQuery] = useState("");

  const [templates, setTemplates] = useState<TemplateType[]>([]);
  const [realCategories, setRealCategories] = useState<any[]>([]);

  // 弹窗状态 (Builder Modal)
  const [isModalVisible, setModalVisible] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [draftAllocations, setDraftAllocations] = useState<AllocationType[]>(
    [],
  );
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );

  // 🚨 新增：自定义操作菜单状态 (Action Menu)
  const [isActionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(
    null,
  );

  // 拉取数据
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, "templates"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: TemplateType[] = [];
      snapshot.forEach((doc) =>
        data.push({ id: doc.id, ...doc.data() } as TemplateType),
      );
      data.sort((a, b) => {
        if (Boolean(a.isDefault) === Boolean(b.isDefault)) {
          return a.name.localeCompare(b.name);
        }
        return a.isDefault ? -1 : 1;
      });
      setTemplates(data);
    });
    return () => unsubscribe();
  }, []);

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
      snapshot.forEach((doc) => {
        const cat = doc.data();
        if (!cat.parentId) cats.push({ id: doc.id, ...cat });
      });
      setRealCategories(cats);
    });
    return () => unsubscribe();
  }, []);

  // 计算实时百分比总额
  const totalPercentage = draftAllocations
    .filter((item) => item.mode === "Percentage")
    .reduce((sum, item) => sum + item.value, 0);

  const isExceeding = totalPercentage > 100;

  // 逻辑函数
  const handleAddCategoryToDraft = (category: any) => {
    if (draftAllocations.some((a) => a.categoryId === category.id)) return;
    setDraftAllocations([
      ...draftAllocations,
      {
        categoryId: category.id,
        category: category.name,
        mode: "Percentage",
        value: 0,
      },
    ]);
    setShowCategoryPicker(false);
  };

  const updateDraftItem = (
    index: number,
    field: keyof AllocationType,
    val: any,
  ) => {
    const newDraft = [...draftAllocations];
    newDraft[index] = { ...newDraft[index], [field]: val };
    setDraftAllocations(newDraft);
  };

  const handleSaveTemplate = async () => {
    const trimmedName = newTemplateName.trim();

    if (!trimmedName) {
      showDialog({
        title: "Oops",
        message: "Please give your template a name.",
        type: "warning",
      });
      return;
    }
    if (draftAllocations.length === 0) {
      showDialog({
        title: "Oops",
        message: "Add at least one category.",
        type: "warning",
      });
      return;
    }
    if (isExceeding) {
      showDialog({
        title: "Error",
        message: "Total percentage cannot exceed 100%.",
        type: "error",
      });
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const duplicateTemplate = templates.find(
      (template) =>
        template.id !== editingTemplateId &&
        normalizeName(template.name) === normalizeName(trimmedName),
    );

    if (duplicateTemplate) {
      showDialog({
        title: "Duplicate Template",
        message: `"${trimmedName}" already exists. Please use a different template name.`,
        type: "warning",
      });
      return;
    }

    try {
      if (editingTemplateId) {
        await updateDoc(doc(db, "templates", editingTemplateId), {
          name: trimmedName,
          allocations: draftAllocations,
          updatedAt: new Date(),
        });
      } else {
        await addDoc(collection(db, "templates"), {
          userId: user.uid,
          name: trimmedName,
          allocations: draftAllocations,
          createdAt: new Date(),
        });
      }
      closeModal();
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to save template.",
        type: "error",
      });
    }
  };

  const openCreateModal = () => {
    setEditingTemplateId(null);
    setNewTemplateName("");
    setDraftAllocations([]);
    setModalVisible(true);
  };

  const openEditModal = (template: TemplateType) => {
    if (template.isDefault) {
      showDialog({
        title: "System Template",
        message: "Default templates cannot be edited or deleted.",
        type: "info",
      });
      return;
    }

    setEditingTemplateId(template.id);
    setNewTemplateName(template.name);
    setDraftAllocations([...template.allocations]);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingTemplateId(null);
    setNewTemplateName("");
    setDraftAllocations([]);
  };

  // 🚨 长按唤出操作菜单
  const handleLongPress = (template: TemplateType) => {
    if (template.isDefault) {
      showDialog({
        title: "System Template",
        message: "Default templates cannot be edited or deleted.",
        type: "info",
      });
      return;
    }

    setSelectedTemplate(template);
    setActionMenuVisible(true);
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    const template = templates.find((item) => item.id === id);
    if (template?.isDefault) {
      showDialog({
        title: "System Template",
        message: "Default templates cannot be edited or deleted.",
        type: "info",
      });
      return;
    }

    const confirmed = await showConfirm({
      title: "Delete Template",
      message: `Are you sure you want to delete "${name}"?`,
      confirmLabel: "Delete",
      type: "error",
    });

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "templates", id));
    } catch {
      showDialog({
        title: "Error",
        message: "Failed to delete template.",
        type: "error",
      });
    }
  };

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader showBack title="Budget Templates" />

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
            placeholder="Search Template"
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
          <Text style={styles.newButtonText}>Create Custom Template</Text>
        </TouchableOpacity>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {filteredTemplates.map((template) => (
            // 🚨 将 View 替换为 TouchableOpacity 并绑定长按事件
            <TouchableOpacity
              key={template.id}
              style={styles.card}
              activeOpacity={0.9}
              onLongPress={() => handleLongPress(template)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{template.name}</Text>
                {template.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={13}
                      color={palette.primary}
                    />
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>
              <View style={styles.divider} />
              {template.allocations.map((item, index) => (
                <View key={index} style={styles.allocationRow}>
                  <View style={styles.textRow}>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View
                        style={[
                          styles.modeBadge,
                          {
                            backgroundColor:
                              item.mode === "Fixed" ? "#E8F5E9" : "#E3F2FD",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modeText,
                            {
                              color:
                                item.mode === "Fixed" ? "#4CAF50" : "#2196F3",
                            },
                          ]}
                        >
                          {item.mode === "Fixed" ? "FIXED" : "%"}
                        </Text>
                      </View>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                    <Text
                      style={[
                        styles.valueText,
                        {
                          color: item.mode === "Fixed" ? "#4CAF50" : "#2196F3",
                        },
                      ]}
                    >
                      {item.mode === "Fixed"
                        ? `RM ${item.value}`
                        : `${item.value}%`}
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={async () => {
                  const confirmed = await showConfirm({
                    title: "Apply Template",
                    message: `Apply "${template.name}" to this month's budget?`,
                    confirmLabel: "Apply",
                    type: "confirm",
                  });

                  if (!confirmed) return;

                  router.navigate({
                    pathname: "/budget",
                    params: {
                      injectedTemplate: JSON.stringify(template.allocations),
                    },
                  });
                }}
              >
                <Ionicons
                  name="flash"
                  size={18}
                  color={palette.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.applyBtnText}>Apply to Current Budget</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 🚨 自定义操作菜单 (Action Menu) Modal */}
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
                if (selectedTemplate) {
                  openEditModal(selectedTemplate);
                }
              }}
            >
              <Ionicons name="pencil-outline" size={22} color="#333" />
              <Text style={styles.actionBtnText}>Edit Template</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            {/* Delete 按钮 */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setActionMenuVisible(false);
                if (selectedTemplate) {
                  handleDeleteTemplate(
                    selectedTemplate.id,
                    selectedTemplate.name,
                  );
                }
              }}
            >
              <Ionicons name="trash-outline" size={22} color={palette.danger} />
              <Text style={[styles.actionBtnText, { color: palette.danger }]}>
                Delete Template
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 🚨 Builder Modal */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeaderTitle}>
              {editingTemplateId ? "Edit Template" : "New Template"}
            </Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Template Name"
              placeholderTextColor="#999"
              value={newTemplateName}
              onChangeText={setNewTemplateName}
            />

            <ScrollView style={{ maxHeight: 300, marginBottom: 15 }}>
              {draftAllocations.map((draft, index) => (
                <View key={index} style={styles.draftItem}>
                  <Text style={styles.draftCatName}>{draft.category}</Text>
                  <View style={styles.draftControls}>
                    <TouchableOpacity
                      style={[
                        styles.draftModeBtn,
                        {
                          backgroundColor:
                            draft.mode === "Fixed" ? "#E8F5E9" : "#E3F2FD",
                        },
                      ]}
                      onPress={() =>
                        updateDraftItem(
                          index,
                          "mode",
                          draft.mode === "Fixed" ? "Percentage" : "Fixed",
                        )
                      }
                    >
                      <Text
                        style={{
                          color: draft.mode === "Fixed" ? "#4CAF50" : "#2196F3",
                          fontWeight: "bold",
                          fontSize: 12,
                        }}
                      >
                        {draft.mode}
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.draftValueInput}
                      keyboardType="numeric"
                      placeholder="0"
                      value={draft.value ? draft.value.toString() : ""}
                      onChangeText={(val) =>
                        updateDraftItem(index, "value", Number(val) || 0)
                      }
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const n = [...draftAllocations];
                        n.splice(index, 1);
                        setDraftAllocations(n);
                      }}
                      style={{ marginLeft: 10 }}
                    >
                      <Ionicons name="close-circle" size={24} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {!showCategoryPicker ? (
                <TouchableOpacity
                  style={styles.addDraftBtn}
                  onPress={() => setShowCategoryPicker(true)}
                >
                  <Ionicons name="add" size={18} color="#FF8216" />
                  <Text style={styles.addDraftText}>Add Real Category</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>Select Category:</Text>
                  <View style={styles.chipGroup}>
                    {realCategories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.chip}
                        onPress={() => handleAddCategoryToDraft(cat)}
                      >
                        <Text style={styles.chipText}>{cat.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* 实时验证条 */}
            <View
              style={[
                styles.validationBar,
                isExceeding && styles.validationBarError,
              ]}
            >
              <Ionicons
                name={isExceeding ? "alert-circle" : "checkmark-circle"}
                size={16}
                color={isExceeding ? palette.danger : palette.success}
              />
              <Text
                style={[
                  styles.validationText,
                  { color: isExceeding ? palette.danger : palette.success },
                ]}
              >
                Total Percentage: {totalPercentage}%{" "}
                {isExceeding ? "(Exceeds 100%!)" : ""}
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (isExceeding || !newTemplateName) && styles.saveBtnDisabled,
                ]}
                onPress={handleSaveTemplate}
                disabled={isExceeding || !newTemplateName}
              >
                <Text style={styles.saveBtnText}>
                  {editingTemplateId ? "Update" : "Save"}
                </Text>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerIcon: { width: 32 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: palette.text },
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
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  cardTitle: {
    color: palette.text,
    flex: 1,
    fontSize: 22,
    fontWeight: "900",
    marginRight: 10,
  },
  defaultBadge: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderColor: palette.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  defaultBadgeText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 4,
  },
  divider: { height: 1, backgroundColor: palette.border, marginBottom: 15 },
  allocationRow: { marginBottom: 15 },
  textRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  modeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  categoryText: { fontSize: 16, fontWeight: "bold", color: palette.text },
  valueText: { fontSize: 16, fontWeight: "900" },
  applyBtn: {
    flexDirection: "row",
    marginTop: 10,
    backgroundColor: palette.primarySoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.accent,
  },
  applyBtnText: { color: palette.primary, fontWeight: "bold", fontSize: 16 },

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
    maxHeight: "80%",
  },
  modalHeaderTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: palette.text,
    marginBottom: 20,
    textAlign: "center",
  },
  nameInput: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    height: 55,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.border,
  },
  draftItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    padding: 15,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  draftCatName: { fontSize: 16, fontWeight: "bold", color: palette.text, flex: 1 },
  draftControls: { flexDirection: "row", alignItems: "center" },
  draftModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  draftValueInput: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    width: 60,
    height: 35,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  addDraftBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.md,
    backgroundColor: palette.primarySoft,
  },
  addDraftText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 5,
  },
  pickerContainer: {
    backgroundColor: palette.surfaceMuted,
    padding: 15,
    borderRadius: radius.md,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: palette.textMuted,
    marginBottom: 10,
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
  chipText: { fontSize: 14, color: palette.text, fontWeight: "600" },

  validationBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: palette.successSoft,
    marginBottom: 15,
  },
  validationBarError: { backgroundColor: palette.dangerSoft },
  validationText: { fontSize: 13, fontWeight: "bold", marginLeft: 6 },

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
  saveBtnDisabled: { backgroundColor: "#CCC" },
  saveBtnText: { fontSize: 16, fontWeight: "bold", color: "#FFF" },
});
