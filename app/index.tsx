import { Redirect } from "expo-router";

export default function Index() {
  // App 一启动，直接跳转到登录页
  return <Redirect href="/login" />;
}
