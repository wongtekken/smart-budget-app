import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AchievementCategoryData,
  AchievementEventData,
  AchievementTemplateData,
  AchievementTransactionData,
  AchievementType,
  buildAchievements,
} from "../constants/achievements";
import { palette, radius, shadow, spacing } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

const CONFETTI_COLORS = [
  palette.primary,
  palette.accent,
  palette.success,
  palette.warning,
  "#4F46E5",
  "#EC4899",
];

const CONFETTI_PIECES = Array.from({ length: 18 }, (_, index) => ({
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  delay: index * 55,
  left: 8 + ((index * 17) % 84),
  rotate: index % 2 === 0 ? "18deg" : "-24deg",
}));

const storageKeyForUser = (userId: string) => `seen_achievements_${userId}`;

const initialLoadedState = {
  categories: false,
  events: false,
  templates: false,
  transactions: false,
};

const parseSeenAchievementIds = (value: string | null) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set<string>(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set<string>();
  }
};

export function AchievementUnlockMonitor() {
  const [categories, setCategories] = useState<AchievementCategoryData[]>([]);
  const [templates, setTemplates] = useState<AchievementTemplateData[]>([]);
  const [transactions, setTransactions] = useState<AchievementTransactionData[]>([]);
  const [events, setEvents] = useState<AchievementEventData[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(initialLoadedState);
  const [queue, setQueue] = useState<AchievementType[]>([]);
  const confettiAnimations = useRef(CONFETTI_PIECES.map(() => new Animated.Value(0)));

  const achievements = useMemo(
    () => buildAchievements(categories, templates, transactions, events),
    [categories, events, templates, transactions],
  );
  const activeAchievement = queue[0] || null;
  const ready = Object.values(loaded).every(Boolean);

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];

      setCategories([]);
      setTemplates([]);
      setTransactions([]);
      setEvents([]);
      setQueue([]);
      setLoaded(initialLoadedState);

      if (!user) {
        setUserId(null);
        return;
      }

      setUserId(user.uid);

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "categories"), where("userId", "==", user.uid)),
          (snapshot) => {
            setCategories(snapshot.docs.map((item) => item.data()));
            setLoaded((current) => ({ ...current, categories: true }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "templates"), where("userId", "==", user.uid)),
          (snapshot) => {
            setTemplates(snapshot.docs.map((item) => item.data()));
            setLoaded((current) => ({ ...current, templates: true }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "transactions"), where("userId", "==", user.uid)),
          (snapshot) => {
            setTransactions(
              snapshot.docs.map(
                (item) => item.data() as AchievementTransactionData,
              ),
            );
            setLoaded((current) => ({ ...current, transactions: true }));
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "achievement_events"), where("userId", "==", user.uid)),
          (snapshot) => {
            setEvents(snapshot.docs.map((item) => item.data() as AchievementEventData));
            setLoaded((current) => ({ ...current, events: true }));
          },
          () => {
            setEvents([]);
            setLoaded((current) => ({ ...current, events: true }));
          },
        ),
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;

    const unlockedAchievements = achievements.filter((item) => item.isUnlocked);
    const storageKey = storageKeyForUser(userId);
    let cancelled = false;

    const syncUnlocks = async () => {
      const storedValue = await AsyncStorage.getItem(storageKey);
      const seenIds = parseSeenAchievementIds(storedValue);

      if (cancelled) return;

      if (!seenIds) {
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify(unlockedAchievements.map((item) => item.id)),
        );
        return;
      }

      const newlyUnlocked = unlockedAchievements.filter(
        (achievement) => !seenIds.has(achievement.id),
      );
      if (newlyUnlocked.length === 0) return;

      const nextSeenIds = new Set([
        ...Array.from(seenIds),
        ...newlyUnlocked.map((item) => item.id),
      ]);
      await AsyncStorage.setItem(storageKey, JSON.stringify(Array.from(nextSeenIds)));

      if (!cancelled) {
        setQueue((current) => {
          const currentIds = new Set(current.map((item) => item.id));
          return [
            ...current,
            ...newlyUnlocked.filter((item) => !currentIds.has(item.id)),
          ];
        });
      }
    };

    syncUnlocks().catch((error) => {
      console.error("Achievement unlock monitor failed:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [achievements, ready, userId]);

  useEffect(() => {
    if (!activeAchievement) return;

    const animations = confettiAnimations.current.map((animation, index) => {
      animation.setValue(0);
      return Animated.sequence([
        Animated.delay(CONFETTI_PIECES[index].delay),
        Animated.timing(animation, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.stagger(18, animations).start();
  }, [activeAchievement]);

  const closePopup = () => {
    setQueue((current) => current.slice(1));
  };

  const renderIcon = () => {
    if (!activeAchievement) return null;

    const props = {
      color: palette.surface,
      size: 36,
    };

    switch (activeAchievement.iconFamily) {
      case "FontAwesome5":
        return <FontAwesome5 name={activeAchievement.iconName as any} {...props} />;
      case "MaterialCommunity":
        return (
          <MaterialCommunityIcons
            name={activeAchievement.iconName as any}
            {...props}
          />
        );
      default:
        return <Ionicons name={activeAchievement.iconName as any} {...props} />;
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={Boolean(activeAchievement)}
      onRequestClose={closePopup}
    >
      <Pressable style={styles.overlay} onPress={closePopup}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.confettiLayer} pointerEvents="none">
            {CONFETTI_PIECES.map((piece, index) => {
              const animation = confettiAnimations.current[index];
              return (
                <Animated.View
                  key={`${piece.left}-${index}`}
                  style={[
                    styles.confettiPiece,
                    {
                      backgroundColor: piece.color,
                      left: `${piece.left}%`,
                      opacity: animation.interpolate({
                        inputRange: [0, 0.12, 0.85, 1],
                        outputRange: [0, 1, 1, 0],
                      }),
                      transform: [
                        {
                          translateY: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-30, 230],
                          }),
                        },
                        {
                          rotate: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", piece.rotate],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.iconHalo}>
            <View style={styles.iconWrap}>{renderIcon()}</View>
          </View>

          <Text style={styles.eyebrow}>Achievement Unlocked</Text>
          <Text style={styles.title}>{activeAchievement?.title}</Text>
          <Text style={styles.description}>{activeAchievement?.description}</Text>

          {activeAchievement?.tier ? (
            <View style={styles.tierPill}>
              <Ionicons name="sparkles" size={14} color={palette.primary} />
              <Text style={styles.tierText}>{activeAchievement.tier} Tier</Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.button}
            onPress={closePopup}
          >
            <Text style={styles.buttonText}>Nice</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 41, 51, 0.52)",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.accent,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    padding: spacing.xxl,
    ...shadow.card,
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  confettiPiece: {
    position: "absolute",
    top: 0,
    width: 9,
    height: 18,
    borderRadius: 3,
  },
  iconHalo: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderColor: palette.accent,
    borderRadius: 54,
    borderWidth: 1,
    height: 108,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 108,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 39,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  description: {
    color: palette.textMuted,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center",
  },
  tierPill: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderColor: palette.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tierText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  button: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    marginTop: spacing.xl,
    minHeight: 50,
    paddingHorizontal: spacing.xxl,
    width: "100%",
  },
  buttonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: "900",
  },
});
