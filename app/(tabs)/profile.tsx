import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppDialog } from "../../components/app-dialog";
import {
  AchievementCategoryData,
  AchievementEventData,
  AchievementTemplateData,
  AchievementTransactionData,
  getAchievementSummary,
} from "../../constants/achievements";
import { formatCurrency, palette } from "../../constants/ui";
import { auth, db } from "../../firebaseConfig";

type ProfileData = {
  name: string;
  email: string;
};

type ProfileStats = {
  activeGoals: number;
  activeReminders: number;
  categoryCount: number;
  monthlyBudget: number;
  templateCount: number;
};

const getLocalMonthStr = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 7);
};

const getDefaultProfileName = (email: string) => {
  const fallback = email.split("@")[0] || "User";
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
};

const formatItemCount = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export default function ProfileScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const currentMonth = useMemo(() => getLocalMonthStr(), []);
  const [profile, setProfile] = useState<ProfileData>({
    name: "Loading...",
    email: "",
  });
  const [draftName, setDraftName] = useState("");
  const [isProfileModalVisible, setProfileModalVisible] = useState(false);
  const [isSavingProfile, setSavingProfile] = useState(false);
  const [stats, setStats] = useState<ProfileStats>({
    activeGoals: 0,
    activeReminders: 0,
    categoryCount: 0,
    monthlyBudget: 0,
    templateCount: 0,
  });
  const [achievementData, setAchievementData] = useState<{
    categories: AchievementCategoryData[];
    events: AchievementEventData[];
    templates: AchievementTemplateData[];
    transactions: AchievementTransactionData[];
  }>({
    categories: [],
    events: [],
    templates: [],
    transactions: [],
  });
  const achievementSummary = useMemo(
    () =>
      getAchievementSummary(
        achievementData.categories,
        achievementData.templates,
        achievementData.transactions,
        achievementData.events,
      ),
    [achievementData],
  );

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];

      if (!user) {
        setProfile({ name: "Guest", email: "" });
        setStats({
          activeGoals: 0,
          activeReminders: 0,
          categoryCount: 0,
          monthlyBudget: 0,
          templateCount: 0,
        });
        setAchievementData({
          categories: [],
          events: [],
          templates: [],
          transactions: [],
        });
        return;
      }

      const authEmail = user.email || "";
      setProfile({
        name: user.displayName || getDefaultProfileName(authEmail),
        email: authEmail,
      });

      unsubscribers.push(
        onSnapshot(doc(db, "users", user.uid), (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : {};
          const email = String(data.email || authEmail);
          const name = String(
            data.username ||
              data.name ||
              user.displayName ||
              getDefaultProfileName(email),
          );
          setProfile({ name, email });
        }),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "categories"), where("userId", "==", user.uid)),
          (snapshot) => {
            const categories = snapshot.docs.map(
              (categoryDoc) => categoryDoc.data() as AchievementCategoryData,
            );
            setStats((current) => ({
              ...current,
              categoryCount: snapshot.size,
            }));
            setAchievementData((current) => ({ ...current, categories }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "templates"), where("userId", "==", user.uid)),
          (snapshot) => {
            const templates = snapshot.docs.map(
              (templateDoc) => templateDoc.data() as AchievementTemplateData,
            );
            setStats((current) => ({
              ...current,
              templateCount: snapshot.size,
            }));
            setAchievementData((current) => ({ ...current, templates }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          doc(db, "monthly_budgets", `${user.uid}_${currentMonth}`),
          (snapshot) => {
            const allocations: Record<string, number> = snapshot.exists()
              ? snapshot.data().allocations || {}
              : {};
            const monthlyBudget = Object.values(allocations).reduce(
              (sum, value) => sum + Number(value || 0),
              0,
            );
            setStats((current) => ({ ...current, monthlyBudget }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "goals"), where("userId", "==", user.uid)),
          (snapshot) => {
            setStats((current) => ({
              ...current,
              activeGoals: snapshot.size,
            }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, "recurring_transactions"),
            where("userId", "==", user.uid),
            where("isActive", "==", true),
          ),
          (snapshot) => {
            setStats((current) => ({
              ...current,
              activeReminders: snapshot.size,
            }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "transactions"), where("userId", "==", user.uid)),
          (snapshot) => {
            const transactions = snapshot.docs.map(
              (transactionDoc) =>
                transactionDoc.data() as AchievementTransactionData,
            );
            setAchievementData((current) => ({ ...current, transactions }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(
            collection(db, "achievement_events"),
            where("userId", "==", user.uid),
          ),
          (snapshot) => {
            const events = snapshot.docs.map(
              (eventDoc) => eventDoc.data() as AchievementEventData,
            );
            setAchievementData((current) => ({ ...current, events }));
          },
          () => {
            setAchievementData((current) => ({ ...current, events: [] }));
          },
        ),
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentMonth]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch {
      Alert.alert("Log Out Failed", "Please try again.");
    }
  };

  const openManageProfile = () => {
    setDraftName(profile.name === "Loading..." ? "" : profile.name);
    setProfileModalVisible(true);
  };

  const closeManageProfile = () => {
    if (isSavingProfile) return;
    setProfileModalVisible(false);
    setDraftName("");
  };

  const handleSaveProfile = async () => {
    const user = auth.currentUser;
    const trimmedName = draftName.trim();

    if (!user) {
      showDialog({
        title: "Profile Error",
        message: "Please log in again before updating your profile.",
        type: "warning",
      });
      return;
    }

    if (trimmedName.length < 2) {
      showDialog({
        title: "Name Required",
        message: "Please enter a display name with at least 2 characters.",
        type: "warning",
      });
      return;
    }

    if (trimmedName.length > 40) {
      showDialog({
        title: "Name Too Long",
        message: "Please keep your display name within 40 characters.",
        type: "warning",
      });
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile(user, { displayName: trimmedName });
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email || profile.email,
          name: trimmedName,
          uid: user.uid,
          updatedAt: new Date(),
          username: trimmedName,
        },
        { merge: true },
      );

      setProfile((current) => ({ ...current, name: trimmedName }));
      setProfileModalVisible(false);
      setDraftName("");
      showDialog({
        title: "Profile Updated",
        message: "Your profile name has been saved.",
        type: "success",
      });
    } catch {
      showDialog({
        title: "Update Failed",
        message: "Could not update your profile. Please try again.",
        type: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // 复用的菜单项组件
  const MenuItem = ({
    icon,
    title,
    value,
    onPress,
    isDestructive = false,
  }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <View
          style={[
            styles.iconBox,
            isDestructive && { backgroundColor: palette.dangerSoft },
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={isDestructive ? palette.danger : palette.primary}
          />
        </View>
        <Text style={[styles.menuTitle, isDestructive && { color: palette.danger }]}>
          {title}
        </Text>
      </View>
      <View style={styles.menuRight}>
        {value && <Text style={styles.menuValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={20} color={palette.textSoft} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 用户信息卡片 */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            {/* 这里用一个系统自带图标代替头像，未来你可以换成真实图片 */}
            <Ionicons name="person-circle" size={80} color={palette.accent} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{profile.name}</Text>
            <Text style={styles.userEmail}>{profile.email || "No email linked"}</Text>
          </View>
          <TouchableOpacity style={styles.editButton} onPress={openManageProfile}>
            <Ionicons name="pencil" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* 2. 核心设置区域 */}
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.menuCard}>
          {/* 🚨 这里就是你要的独立入口！点击直接跳转到 Category 页面 */}
          <MenuItem
            icon="grid"
            title="Manage Categories"
            value={formatItemCount(stats.categoryCount, "Item")}
            onPress={() => router.push("/manage-categories")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="trophy"
            title="Achievements"
            value={`${achievementSummary.unlockedCount}/${achievementSummary.totalCount} Unlocked`}
            onPress={() => router.push("/achievement")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="pie-chart"
            title="Budget Templates"
            value={`${stats.templateCount} Saved`}
            onPress={() => router.push("/template")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="wallet"
            title="Monthly Budget"
            value={formatCurrency(stats.monthlyBudget)}
            onPress={() => router.push("/budget")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="flag"
            title="Financial Goals"
            value={`${stats.activeGoals} Active`}
            onPress={() => router.push("/goal")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="notifications"
            title="Reminders"
            value={
              stats.activeReminders > 0
                ? `${stats.activeReminders} Active`
                : "Off"
            }
            onPress={() => {}}
          />
        </View>

        {/* 3. 退出登录 */}
        <View style={[styles.menuCard, { marginTop: 10 }]}>
          <MenuItem
            icon="log-out"
            title="Log Out"
            isDestructive={true}
            // 点击退回到登录页
            onPress={handleLogout}
          />
        </View>
      </ScrollView>

      <Modal
        visible={isProfileModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeManageProfile}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.profileModalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Manage Profile</Text>
            <Text style={styles.modalSubtitle}>
              Update the name shown across your account.
            </Text>

            <View style={styles.profileAvatarPreview}>
              <Ionicons name="person-circle" size={76} color={palette.accent} />
            </View>

            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.profileInput}
              placeholder="Enter your display name"
              placeholderTextColor="#AAA"
              value={draftName}
              onChangeText={setDraftName}
              editable={!isSavingProfile}
              maxLength={40}
              autoCapitalize="words"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>
                {profile.email || "No email linked"}
              </Text>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={palette.textSoft}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeManageProfile}
                disabled={isSavingProfile}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8", // 配合首页的浅灰背景
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#333",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120, // 避开底部导航栏
  },

  // 用户卡片样式
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 24,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarContainer: {
    marginRight: 15,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#888",
  },
  editButton: {
    backgroundColor: "#FF8216",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  // 菜单区域样式
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#888",
    textTransform: "uppercase",
    marginLeft: 15,
    marginBottom: 10,
  },
  menuCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    marginBottom: 25,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FFF3E0", // 浅橘色底
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  menuRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuValue: {
    fontSize: 14,
    color: "#888",
    marginRight: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginLeft: 70, // 让分割线对齐文字
    marginRight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  profileModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#DDD",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#333",
    textAlign: "center",
  },
  modalSubtitle: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
  profileAvatarPreview: {
    alignItems: "center",
    marginVertical: 18,
  },
  fieldLabel: {
    color: "#555",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  profileInput: {
    backgroundColor: "#F5F6F8",
    borderColor: "#EEE",
    borderRadius: 14,
    borderWidth: 1,
    color: "#333",
    fontSize: 16,
    fontWeight: "700",
    height: 54,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  readOnlyField: {
    alignItems: "center",
    backgroundColor: "#F5F6F8",
    borderColor: "#EEE",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    height: 54,
    justifyContent: "space-between",
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  readOnlyText: {
    color: "#888",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 12,
  },
  modalActions: {
    flexDirection: "row",
  },
  modalButton: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    height: 54,
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F5F6F8",
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: palette.primary,
    marginLeft: 10,
  },
  cancelButtonText: {
    color: "#888",
    fontSize: 16,
    fontWeight: "900",
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "900",
  },
});
