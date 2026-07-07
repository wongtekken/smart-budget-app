import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// 🚨 新增：引入 Firebase 登录魔法和配置文件
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { useAppDialog } from "../components/app-dialog";
import { palette, radius } from "../constants/ui";
import { auth, setAuthKeepSignedIn } from "../firebaseConfig";

export default function LoginScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();

  // UI 状态控制
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);

  // 🚨 新增：数据状态控制 (收集用户输入)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        router.replace("/(tabs)");
      }
    });

    return unsubscribe;
  }, [router]);

  // 🚨 新增：处理登录的核心逻辑
  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    // 检查是否为空
    if (!trimmedEmail || !password) {
      showDialog({
        title: "Oops!",
        message: "Please enter your email and password.",
        type: "warning",
      });
      return;
    }

    try {
      await setAuthKeepSignedIn(keepSignedIn);
      // 向 Firebase 发起验证请求
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      // 验证成功！门打开了，前往主页
      router.replace("/(tabs)");
    } catch {
      // 如果密码错误或账号不存在，Firebase 会告诉你
      showDialog({
        title: "Login Failed",
        message: "Invalid email or password.",
        type: "error",
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {/* 头部标题区域 */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Login</Text>
          <Text style={styles.subtitle}>Welcome back to the app.</Text>
        </View>

        {/* 账号输入框 (配合 Firebase，改为 Email) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#ccc"
              value={email} // 🚨 绑定数据
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* 密码输入框 */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#ccc"
              secureTextEntry={!showPassword}
              value={password} // 🚨 绑定数据
              onChangeText={setPassword}
            />
            {/* 眼睛图标按钮 */}
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-outline" : "eye-off-outline"}
                size={24}
                color={palette.primary} // 配合你的主题色改了图标颜色
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 保持登录勾选框 */}
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setKeepSignedIn(!keepSignedIn)}
        >
          <Ionicons
            name={keepSignedIn ? "checkbox" : "square-outline"}
            size={24}
            color={palette.primary}
          />
          <Text style={styles.checkboxText}>Keep me signed in</Text>
        </TouchableOpacity>

        {/* 底部按钮区域 */}
        <View style={styles.bottomContainer}>
          {/* 🚨 将这里的 onPress 改为触发 handleLogin 函数 */}
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createAccountButton}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.createAccountText}>Create an account</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// 样式完全保持你的原样，没有任何破坏！
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 30,
    justifyContent: "center",
    paddingVertical: 24,
  },
  headerContainer: {
    marginBottom: 40,
  },
  title: {
    fontSize: 50,
    fontWeight: "900",
    color: palette.primary,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: palette.primary,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: palette.primary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    height: 55,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: palette.text,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  checkboxText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "bold",
    color: palette.primary,
  },
  bottomContainer: {
    marginTop: 20,
  },
  loginButton: {
    backgroundColor: palette.accent,
    height: 55,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  loginButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: palette.primary,
  },
  createAccountButton: {
    alignItems: "center",
  },
  createAccountText: {
    fontSize: 16,
    fontWeight: "bold",
    color: palette.primary,
  },
});
