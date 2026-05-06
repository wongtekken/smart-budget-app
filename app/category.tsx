import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

// 🚨 1. 引入 Firebase 魔法
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 统一的数据结构
type CategoryType = {
  id: string;
  userId: string;
  type: string;
  name: string;
  icon: string;
  parentId: string | null;
  isDefault: boolean;
};

export default function CategoryScreen() {
  const router = useRouter();

  // 接收 Add 页面传过来的“行李”
  const params = useLocalSearchParams();
  const currentType = params.type === "Income" ? "Income" : "Expense";

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 🚨 2. 云端数据池
  const [categories, setCategories] = useState<CategoryType[]>([]);

  // 🚨 3. 实时拉取云端数据 (和 Manage 页面共用同一个大脑！)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "categories"),
      where("userId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveData: CategoryType[] = [];
      snapshot.forEach((doc) => {
        liveData.push({ id: doc.id, ...doc.data() } as CategoryType);
      });
      liveData.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(liveData);
    });

    return () => unsubscribe();
  }, []);

  // 整理数据结构
  const currentTabData = categories.filter((c) => c.type === currentType);
  const allParents = currentTabData.filter((c) => !c.parentId);

  const getSubcategories = (parentId: string) => {
    return currentTabData.filter((c) => c.parentId === parentId);
  };

  // 智能穿透搜索
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

  // 🚨 4. 核心选定逻辑：带着选中的名字和行李滚回 Add 页面
  const handleSelectCategory = (categoryName: string) => {
    router.navigate({
      pathname: "/(tabs)/add",
      params: {
        returnedCategory: categoryName,
        returnedType: currentType,
        returnedAmount: params.savedAmount,
        returnedNote: params.savedNote,
        returnedDate: params.savedDate,
        returnedRecurring: params.savedRecurring, // 🚨 把周期带回
        editId: params.editId, // 🚨 最重要：把 ID 完璧归赵！
      },
    });
  };

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
        <Text style={styles.headerTitle}>Select {currentType}</Text>
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
            placeholder={`Search ${currentType} Category`}
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

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
              const isIncome = currentType === "Income";

              return (
                <View
                  key={parent.id}
                  style={[
                    styles.categoryWrapper,
                    index === 0 && styles.firstItem,
                    index === filteredParents.length - 1 && styles.lastItem,
                  ]}
                >
                  {/* === 父级分类 === */}
                  <TouchableOpacity
                    style={styles.categoryParent}
                    onPress={() => {
                      // 🚨 智能逻辑：如果没有小类，直接选中它！如果有小类，才展开！
                      if (subs.length === 0) {
                        handleSelectCategory(parent.name);
                      } else {
                        toggleExpand(parent.id);
                      }
                    }}
                  >
                    <View style={styles.itemLeft}>
                      <View
                        style={[
                          styles.iconBox,
                          { backgroundColor: isIncome ? "#E8F5E9" : "#FFF3E0" },
                        ]}
                      >
                        <Ionicons
                          name={parent.icon as any}
                          size={20}
                          color={isIncome ? palette.success : palette.primary}
                        />
                      </View>
                      <Text style={styles.itemName}>{parent.name}</Text>
                    </View>

                    {/* 如果没有小类，显示勾选图标暗示可以直接点；如果有，显示展开箭头 */}
                    {subs.length === 0 ? (
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={22}
                        color={palette.textSoft}
                      />
                    ) : (
                      <Ionicons
                        name={isExpanded ? "chevron-down" : "chevron-forward"}
                        size={20}
                        color={palette.textSoft}
                      />
                    )}
                  </TouchableOpacity>

                  {/* === 子级分类列表 === */}
                  {isExpanded && subs.length > 0 && (
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
                          <TouchableOpacity
                            key={sub.id}
                            style={[
                              styles.subCategoryItem,
                              subIndex === filteredArray.length - 1 &&
                                styles.subCategoryItemLast,
                            ]}
                            onPress={() =>
                              handleSelectCategory(
                                `${parent.name} - ${sub.name}`,
                              )
                            } // 组合名字！
                          >
                            <View style={styles.subItemLeft}>
                              <View style={styles.subDot} />
                              <Text style={styles.subItemName}>{sub.name}</Text>
                            </View>
                            <Ionicons
                              name="add-circle-outline"
                              size={20}
                              color={palette.primary}
                            />
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}
                </View>
              );
            })}

            {filteredParents.length === 0 && (
              <Text style={styles.noResultText}>
                {searchQuery
                  ? "No matching categories."
                  : `No categories found.\nPlease go to Profile to add some!`}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// 样式完全保留
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
  headerTitle: { fontSize: 20, fontWeight: "900", color: palette.text },
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
    marginBottom: spacing.xl,
    ...shadow.subtle,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: palette.text },
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
  itemLeft: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  itemName: { fontSize: 16, fontWeight: "bold", color: palette.text },
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
  subItemLeft: { flexDirection: "row", alignItems: "center" },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.textSoft,
    marginRight: 10,
  },
  subItemName: { fontSize: 15, color: palette.textMuted },
  noResultText: {
    textAlign: "center",
    marginTop: 40,
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
});
