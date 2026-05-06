import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "../../constants/ui";

export default function ProfileScreen() {
  const router = useRouter();

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
            <Text style={styles.userName}>Developer</Text>
            <Text style={styles.userEmail}>developer@fyp.com</Text>
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
            value="12 Items"
            onPress={() => router.push("/manage-categories")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="trophy"
            title="Achievements"
            value="2/6 Unlocked"
            onPress={() => router.push("/achievement")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="pie-chart"
            title="Budget Templates"
            value="2 Saved"
            onPress={() => router.push("/template")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="wallet"
            title="Monthly Budget"
            value="RM 5,000"
            onPress={() => router.push("/budget")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="flag"
            title="Financial Goals"
            value="3 Active"
            onPress={() => router.push("/goal")}
          />
          <View style={styles.divider} />

          <MenuItem
            icon="notifications"
            title="Reminders"
            value="On"
            onPress={() => {}}
          />
        </View>

        {/* 3. 数据与安全区域 */}
        <Text style={styles.sectionTitle}>Data & Security</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="download" title="Export Data" onPress={() => {}} />
          <View style={styles.divider} />
          <MenuItem
            icon="lock-closed"
            title="Face ID / PIN"
            value="Off"
            onPress={() => {}}
          />
        </View>

        {/* 4. 退出登录 */}
        <View style={[styles.menuCard, { marginTop: 10 }]}>
          <MenuItem
            icon="log-out"
            title="Log Out"
            isDestructive={true}
            // 点击退回到登录页
            onPress={() => router.replace("/login")}
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
