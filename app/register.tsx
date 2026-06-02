import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// 🚨 引入 Firebase 魔法
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAppDialog } from "../components/app-dialog";
import {
  DEFAULT_CATEGORIES,
  getDefaultCategoryDocId,
} from "../constants/defaultCategories";
import {
  buildDefaultBudgetTemplateDoc,
  DEFAULT_BUDGET_TEMPLATES,
  getDefaultBudgetTemplateDocId,
} from "../constants/defaultBudgetTemplates";
import { doc, setDoc } from "firebase/firestore"; // 🚨 引入 firestore 写入方法
import { auth, db } from "../firebaseConfig"; // 确保你导出了 db

export default function RegisterScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegister = async () => {
    if (!email || !username.trim() || !password || !confirmPassword) {
      showDialog({
        title: "Oops!",
        message: "Please fill in all fields.",
        type: "warning",
      });
      return;
    }
    if (password !== confirmPassword) {
      showDialog({
        title: "Error",
        message: "Passwords do not match.",
        type: "error",
      });
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
      const trimmedUsername = username.trim();

      await updateProfile(user, { displayName: trimmedUsername });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        username: trimmedUsername,
        email: user.email,
        createdAt: new Date(),
      });

      // ==========================================
      // 🚨 2. 账号创建成功的瞬间，立刻把默认分类塞进去！
      // ==========================================
      const categoryPromises = DEFAULT_CATEGORIES.map((cat) =>
        setDoc(
          doc(
            db,
            "categories",
            getDefaultCategoryDocId(user.uid, cat.type, cat.name),
          ),
          {
          userId: user.uid,
          parentId: null, // 大类，没有父级
          createdAt: new Date(),
          ...cat, // 展开 name, type, icon, isDefault
          },
        ),
      );

      // 使用 Promise.all 并发执行，毫秒级瞬间完成这 7 条写入
      const templatePromises = DEFAULT_BUDGET_TEMPLATES.map((template) =>
        setDoc(
          doc(
            db,
            "templates",
            getDefaultBudgetTemplateDocId(user.uid, template.key),
          ),
          {
            ...buildDefaultBudgetTemplateDoc(user.uid, template),
            createdAt: new Date(),
          },
        ),
      );

      await Promise.all([...categoryPromises, ...templatePromises]);

      // 3. 成功后弹窗并跳转主页
      showDialog({
        title: "Success!",
        message:
          "Account created! Default categories and budget template have been set up for you.",
        type: "success",
      });
      router.replace("/(tabs)");
    } catch (error: any) {
      showDialog({
        title: "Registration Failed",
        message: error.message,
        type: "error",
      });
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
