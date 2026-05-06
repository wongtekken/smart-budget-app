import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const currentMonth = useMemo(() => getLocalMonthStr(), []);
  const [profile, setProfile] = useState<ProfileData>({
    name: "Loading...",
    email: "",
  });
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
          <TouchableOpacity style={styles.editButton}>
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
});
