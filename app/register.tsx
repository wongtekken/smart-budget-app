import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// 🚨 引入 Firebase 魔法
import { createUserWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection } from "firebase/firestore"; // 🚨 引入 firestore 写入方法
import { auth, db } from "../firebaseConfig"; // 确保你导出了 db

// ==========================================
// 🚨 1. 准备“新手大礼包” (系统自带的不可删除分类)
// ==========================================
const DEFAULT_CATEGORIES = [
  // 支出 (Expense)
  { name: "Food", type: "Expense", icon: "fast-food-outline", isDefault: true },
  { name: "Transport", type: "Expense", icon: "car-outline", isDefault: true },
  { name: "Shopping", type: "Expense", icon: "cart-outline", isDefault: true },
  { name: "Housing", type: "Expense", icon: "home-outline", isDefault: true },
  {
    name: "Utilities",
    type: "Expense",
    icon: "flash-outline",
    isDefault: true,
  },
  // 收入 (Income)
  { name: "Salary", type: "Income", icon: "cash-outline", isDefault: true },
  {
    name: "Investment",
    type: "Income",
    icon: "trending-up-outline",
    isDefault: true,
  },
];

export default function RegisterScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert("Oops!", "Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      // 1. Firebase 账号创建
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // ==========================================
      // 🚨 2. 账号创建成功的瞬间，立刻把默认分类塞进去！
      // ==========================================
      const promises = DEFAULT_CATEGORIES.map((cat) =>
        addDoc(collection(db, "categories"), {
          userId: user.uid,
          parentId: null, // 大类，没有父级
          createdAt: new Date(),
          ...cat, // 展开 name, type, icon, isDefault
        }),
      );

      // 使用 Promise.all 并发执行，毫秒级瞬间完成这 7 条写入
      await Promise.all(promises);

      // 3. 成功后弹窗并跳转主页
      Alert.alert(
        "Success!",
        "Account created! Default categories have been set up for you.",
      );
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Registration Failed", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Register</Text>
          <Text style={styles.subtitle}>Let&apos;s get started.</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your email address"
              placeholderTextColor="#ccc"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor="#ccc"
              value={username}
              onChangeText={setUsername}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#ccc"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-outline" : "eye-off-outline"}
                size={24}
                color="#FF8216"
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirmed Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Confirm your password"
              placeholderTextColor="#ccc"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                size={24}
                color="#FF8216"
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomContainer}>
          <TouchableOpacity style={styles.loginButton} onPress={handleRegister}>
            <Text style={styles.loginButtonText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createAccountButton}
            onPress={() => router.back()}
          >
            <Text style={{ color: "#ccc", fontSize: 16 }}>
              Already have an account?{" "}
              <Text style={styles.createAccountText}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  content: { flex: 1, paddingHorizontal: 30, justifyContent: "center" },
  headerContainer: { marginBottom: 40 },
  title: { fontSize: 50, fontWeight: "900", color: "#FF8216", marginBottom: 5 },
  subtitle: { fontSize: 18, fontWeight: "bold", color: "#FF8216" },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FF8216",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#FDE0B2",
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 55,
  },
  input: { flex: 1, fontSize: 16, color: "#333" },
  bottomContainer: { marginTop: 20 },
  loginButton: {
    backgroundColor: "#FFD15C",
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  loginButtonText: { fontSize: 20, fontWeight: "bold", color: "#FF8216" },
  createAccountButton: { alignItems: "center" },
  createAccountText: { fontSize: 16, fontWeight: "bold", color: "#FF8216" },
});
