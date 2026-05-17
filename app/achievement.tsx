import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
import { AppHeader } from "../components/app-header";
import { palette } from "../constants/ui";
import { auth, db } from "../firebaseConfig";

export default function AchievementsScreen() {
  const [categories, setCategories] = useState<AchievementCategoryData[]>([]);
  const [templates, setTemplates] = useState<AchievementTemplateData[]>([]);
  const [transactions, setTransactions] = useState<AchievementTransactionData[]>(
    [],
  );
  const [events, setEvents] = useState<AchievementEventData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];

      if (!user) {
        setCategories([]);
        setTemplates([]);
        setTransactions([]);
        setEvents([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "categories"), where("userId", "==", user.uid)),
          (snapshot) => {
            setCategories(
              snapshot.docs.map((categoryDoc) => categoryDoc.data()),
            );
            setLoading(false);
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "templates"), where("userId", "==", user.uid)),
          (snapshot) => {
            setTemplates(snapshot.docs.map((templateDoc) => templateDoc.data()));
            setLoading(false);
          },
        ),
      );

      unsubscribers.push(
        onSnapshot(
          query(collection(db, "transactions"), where("userId", "==", user.uid)),
          (snapshot) => {
            setTransactions(
              snapshot.docs.map(
                (transactionDoc) =>
                  transactionDoc.data() as AchievementTransactionData,
              ),
            );
            setLoading(false);
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
            setEvents(
              snapshot.docs.map(
                (eventDoc) => eventDoc.data() as AchievementEventData,
              ),
            );
            setLoading(false);
          },
          () => {
            setEvents([]);
            setLoading(false);
          },
        ),
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const achievements = useMemo(
    () => buildAchievements(categories, templates, transactions, events),
    [categories, events, templates, transactions],
  );

  const renderIcon = (family: string, name: string) => {
    switch (family) {
      case "FontAwesome5":
        return <FontAwesome5 name={name as any} size={24} color="#FFF" />;
      case "MaterialCommunity":
        return (
          <MaterialCommunityIcons name={name as any} size={28} color="#FFF" />
        );
      default:
        return <Ionicons name={name as any} size={28} color="#FFF" />;
    }
  };

  const AchievementCard = ({ item }: { item: AchievementType }) => (
    <View style={styles.card}>
      <View
        style={[
          styles.iconContainer,
          item.isUnlocked ? styles.iconUnlocked : styles.iconLocked,
        ]}
      >
        {renderIcon(item.iconFamily, item.iconName)}
      </View>

      <View style={styles.cardContent}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text
            style={[
              styles.progressText,
              item.isUnlocked && styles.progressTextUnlocked,
            ]}
          >
            {item.progress}%
          </Text>
        </View>
        <Text style={styles.cardDescription}>{item.description}</Text>

        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${item.progress}%` },
              item.isUnlocked ? styles.progressGreen : styles.progressOrange,
            ]}
          />
        </View>
      </View>
    </View>
  );

  const unlockedList = achievements.filter((achievement) => achievement.isUnlocked);
  const lockedList = achievements.filter((achievement) => !achievement.isUnlocked);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <AppHeader showBack title="Achievements" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>
            Unlocked Achievements ({unlockedList.length}/{achievements.length})
          </Text>
          {unlockedList.length > 0 ? (
            unlockedList.map((item) => (
              <AchievementCard key={item.id} item={item} />
            ))
          ) : (
            <Text style={styles.emptyText}>No achievements unlocked yet.</Text>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 15 }]}>
            Locked Achievements
          </Text>
          {lockedList.map((item) => (
            <AchievementCard key={item.id} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerIcon: {
    width: 40,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#000",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#000",
    marginBottom: 15,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 15,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EFEFEF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  iconUnlocked: {
    backgroundColor: "#FF9800",
  },
  iconLocked: {
    backgroundColor: "#C5CBD3",
  },
  cardContent: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#4A4A4A",
    marginBottom: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.warning,
  },
  progressTextUnlocked: {
    color: palette.success,
  },
  cardDescription: {
    fontSize: 11,
    color: "#999",
    marginBottom: 10,
    lineHeight: 14,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#F5F5F5",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressGreen: {
    backgroundColor: "#4CAF50",
  },
  progressOrange: {
    backgroundColor: "#FFA726",
  },
});
