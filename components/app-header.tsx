import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  GestureResponderEvent,
  Pressable,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette, spacing } from "../constants/ui";

type HeaderIconName = keyof typeof Ionicons.glyphMap;

type HeaderAction = {
  accessibilityLabel: string;
  color?: string;
  icon: HeaderIconName;
  onPress?: (event: GestureResponderEvent) => void;
};

type AppHeaderProps = {
  leftAction?: HeaderAction;
  rightAction?: HeaderAction;
  showBack?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title: string;
  titleAlign?: "center" | "left";
};

export function AppHeader({
  leftAction,
  rightAction,
  showBack = false,
  style,
  subtitle,
  title,
  titleAlign = "center",
}: AppHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const resolvedLeftAction =
    leftAction ||
    (showBack
      ? {
          accessibilityLabel: "Go back",
          icon: "arrow-back" as const,
          onPress: () => router.back(),
        }
      : undefined);

  const topPadding = Math.max(insets.top, spacing.md) + spacing.sm;
  const titleIsLeftAligned = titleAlign === "left";

  const renderAction = (action?: HeaderAction, align: "left" | "right" = "left") => {
    if (!action) {
      return <View style={styles.actionSlot} />;
    }

    return (
      <Pressable
        accessibilityLabel={action.accessibilityLabel}
        accessibilityRole="button"
        disabled={!action.onPress}
        onPress={action.onPress}
        style={({ pressed }) => [
          styles.actionSlot,
          align === "right" && styles.actionSlotRight,
          pressed && action.onPress && styles.actionPressed,
        ]}
      >
        <Ionicons
          color={action.color || palette.text}
          name={action.icon}
          size={28}
        />
      </Pressable>
    );
  };

  return (
    <View style={[styles.shell, { paddingTop: topPadding }, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.surface} />
      <View style={styles.row}>
        {renderAction(resolvedLeftAction)}
        <View
          style={[
            styles.titleBlock,
            titleIsLeftAligned && styles.titleBlockLeft,
          ]}
        >
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              titleIsLeftAligned && styles.titleLeft,
              subtitle && styles.titleWithSubtitle,
            ]}
          >
            {title}
          </Text>
        </View>
        {renderAction(rightAction, "right")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 48,
  },
  actionSlot: {
    alignItems: "flex-start",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  actionSlotRight: {
    alignItems: "flex-end",
  },
  actionPressed: {
    opacity: 0.68,
  },
  titleBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  titleBlockLeft: {
    alignItems: "flex-start",
    paddingLeft: 0,
  },
  subtitle: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 2,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  titleLeft: {
    textAlign: "left",
  },
  titleWithSubtitle: {
    fontSize: 24,
  },
});
