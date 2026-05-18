import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radius, shadow } from "../../constants/ui";
import { auth } from "../../firebaseConfig";
import { processDueRecurringTransactions } from "../../services/recurringService";

type TabIconProps = {
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

const TabIcon = ({ focused, icon, label }: TabIconProps) => (
  <View style={[styles.tabItem, focused && styles.tabItemActive]}>
    <Ionicons
      name={icon}
      size={22}
      color={focused ? palette.primary : palette.textSoft}
    />
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {label}
    </Text>
  </View>
);

export default function TabLayout() {
  const processingUserRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || processingUserRef.current === user.uid) return;

      processingUserRef.current = user.uid;
      processDueRecurringTransactions(user.uid).catch((error) => {
        console.error("Recurring transaction processing failed:", error);
        processingUserRef.current = null;
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textSoft,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="home" label="Home" />
          ),
        }}
      />

      <Tabs.Screen
        name="analysis"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="analytics" label="Stats" />
          ),
        }}
      />

      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.addTabItem}>
              <View style={[styles.addButton, focused && styles.addButtonActive]}>
                <Ionicons name="add" size={30} color="#FFF" />
              </View>
              <Text style={[styles.addLabel, focused && styles.tabLabelActive]}>
                Add
              </Text>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="ai-coach"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="sparkles" label="AI" />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="person" label="Profile" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: 22,
    left: 16,
    right: 16,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 28,
    borderWidth: 1,
    height: 78,
    borderTopWidth: 0,
    paddingBottom: 10,
    paddingHorizontal: 8,
    paddingTop: 10,
    ...shadow.card,
  },
  tabBarItem: {
    height: 58,
  },
  tabItem: {
    alignItems: "center",
    borderRadius: radius.lg,
    height: 48,
    justifyContent: "center",
    minWidth: 62,
    paddingHorizontal: 8,
  },
  tabItemActive: {
    backgroundColor: palette.primarySoft,
  },
  tabLabel: {
    color: palette.textSoft,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  tabLabelActive: {
    color: palette.primary,
  },
  addTabItem: {
    alignItems: "center",
    height: 58,
    justifyContent: "center",
    minWidth: 62,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderColor: palette.surface,
    borderRadius: 26,
    borderWidth: 3,
    height: 52,
    justifyContent: "center",
    marginTop: -22,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
    width: 52,
  },
  addButtonActive: {
    backgroundColor: "#E86F08",
  },
  addLabel: {
    color: palette.textSoft,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2,
  },
});
