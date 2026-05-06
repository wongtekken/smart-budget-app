import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { palette, radius, shadow } from "../../constants/ui";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textSoft,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="analysis"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="analytics" size={26} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="add"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={[styles.addButton, focused && styles.addButtonActive]}>
              <Ionicons name="add" size={32} color="#FFF" />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <Ionicons name="person" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: 25,
    left: 20,
    right: 20,
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    height: 70,
    borderTopWidth: 0,
    ...shadow.card,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: palette.accent,
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    width: 50,
  },
  addButtonActive: {
    backgroundColor: palette.primary,
  },
});
