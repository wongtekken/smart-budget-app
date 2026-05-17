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
  TouchableOpacity,
  View,
} from "react-native";
import { AppHeader } from "../components/app-header";
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

type AchievementFilter = "All" | "In Progress" | "Unlocked" | "Locked";

const FILTERS: AchievementFilter[] = ["All", "In Progress", "Unlocked", "Locked"];

const getAchievementGroup = (id: string) => {
  if (id.includes("template")) return "Templates";
  if (id.includes("category")) return "Categories";
  if (id.includes("voice") || id.includes("scan")) return "AI Tools";
  if (id.includes("week") || id.includes("monthly") || id.includes("year")) {
    return "Consistency";
  }
  return "Transactions";
};

const getStatusLabel = (item: AchievementType) => {
  if (item.isUnlocked) return "Unlocked";
  if (item.progress > 0) return "In progress";
  return "Locked";
};

export default function AchievementsScreen() {
  const [categories, setCategories] = useState<AchievementCategoryData[]>([]);
  const [templates, setTemplates] = useState<AchievementTemplateData[]>([]);
  const [transactions, setTransactions] = useState<AchievementTransactionData[]>(
    [],
  );
  const [events, setEvents] = useState<AchievementEventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<AchievementFilter>("All");

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
            setCategories(snapshot.docs.map((categoryDoc) => categoryDoc.data()));
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

  const unlockedCount = achievements.filter((item) => item.isUnlocked).length;
  const completionRate =
    achievements.length > 0
      ? Math.round((unlockedCount / achievements.length) * 100)
      : 0;
  const inProgressCount = achievements.filter(
    (item) => !item.isUnlocked && item.progress > 0,
  ).length;
  const lockedCount = achievements.length - unlockedCount;

  const nextUnlocks = [...achievements]
    .filter((item) => !item.isUnlocked)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  const filteredAchievements = achievements.filter((item) => {
    if (activeFilter === "Unlocked") return item.isUnlocked;
    if (activeFilter === "In Progress") return !item.isUnlocked && item.progress > 0;
    if (activeFilter === "Locked") return !item.isUnlocked;
    return true;
  });

  const renderIcon = (
    family: string,
    name: string,
    color = palette.surface,
    size = 28,
  ) => {
    switch (family) {
      case "FontAwesome5":
        return <FontAwesome5 name={name as any} size={size - 3} color={color} />;
      case "MaterialCommunity":
        return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
      default:
        return <Ionicons name={name as any} size={size} color={color} />;
    }
  };

  const AchievementBadge = ({ item, compact = false }: { item: AchievementType; compact?: boolean }) => {
    const isActive = item.isUnlocked || item.progress > 0;
    return (
      <View
        style={[
          compact ? styles.featuredBadge : styles.badge,
          item.isUnlocked
            ? styles.badgeUnlocked
            : isActive
              ? styles.badgeActive
              : styles.badgeLocked,
        ]}
      >
        {renderIcon(
          item.iconFamily,
          item.iconName,
          item.isUnlocked
            ? palette.surface
            : isActive
              ? palette.primary
              : palette.textSoft,
          compact ? 24 : 30,
        )}
      </View>
    );
  };

  const AchievementCard = ({ item }: { item: AchievementType }) => (
    <View style={[styles.card, item.isUnlocked && styles.cardUnlocked]}>
      <AchievementBadge item={item} />

      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.groupLabel}>{getAchievementGroup(item.id)}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              item.isUnlocked
                ? styles.statusUnlocked
                : item.progress > 0
                  ? styles.statusActive
                  : styles.statusLocked,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                item.isUnlocked
                  ? styles.statusTextUnlocked
                  : item.progress > 0
                    ? styles.statusTextActive
                    : styles.statusTextLocked,
              ]}
            >
              {getStatusLabel(item)}
            </Text>
          </View>
        </View>

        <Text style={styles.cardDescription}>{item.description}</Text>

        <View style={styles.progressMetaRow}>
          <Text style={styles.progressCaption}>Progress</Text>
          <Text
            style={[
              styles.progressText,
              item.isUnlocked && styles.progressTextUnlocked,
            ]}
          >
            {item.progress}%
          </Text>
        </View>
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

  const FeaturedCard = ({ item }: { item: AchievementType }) => (
    <View style={styles.featuredCard}>
      <View style={styles.featuredTop}>
        <AchievementBadge item={item} compact />
        <Text style={styles.featuredProgress}>{item.progress}%</Text>
      </View>
      <Text numberOfLines={2} style={styles.featuredTitle}>
        {item.title}
      </Text>
      <Text numberOfLines={2} style={styles.featuredDescription}>
        {item.description}
      </Text>
      <View style={styles.featuredProgressBar}>
        <View
          style={[styles.featuredProgressFill, { width: `${item.progress}%` }]}
        />
      </View>
    </View>
  );

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
          <View style={styles.summaryPanel}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.summaryEyebrow}>Achievement progress</Text>
                <Text style={styles.summaryTitle}>
                  {unlockedCount}/{achievements.length} unlocked
                </Text>
              </View>
              <View style={styles.summaryScore}>
                <Text style={styles.summaryScoreText}>{completionRate}%</Text>
              </View>
            </View>

            <View style={styles.summaryTrack}>
              <View
                style={[styles.summaryFill, { width: `${completionRate}%` }]}
              />
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{unlockedCount}</Text>
                <Text style={styles.statLabel}>Unlocked</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{inProgressCount}</Text>
                <Text style={styles.statLabel}>In progress</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{lockedCount}</Text>
                <Text style={styles.statLabel}>Locked</Text>
              </View>
            </View>
          </View>

          {nextUnlocks.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Next Unlocks</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featuredList}
              >
                {nextUnlocks.map((item) => (
                  <FeaturedCard key={item.id} item={item} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.filterRow}>
            {FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter}
                activeOpacity={0.85}
                onPress={() => setActiveFilter(filter)}
                style={[
                  styles.filterButton,
                  activeFilter === filter && styles.filterButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    activeFilter === filter && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{activeFilter}</Text>
            <Text style={styles.sectionCount}>{filteredAchievements.length} items</Text>
          </View>

          {filteredAchievements.length > 0 ? (
            filteredAchievements.map((item) => (
              <AchievementCard key={item.id} item={item} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={36} color={palette.textSoft} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                Keep recording transactions and building your budget setup.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 60,
  },
  summaryPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    ...shadow.subtle,
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  summaryEyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  summaryTitle: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "900",
  },
  summaryScore: {
    alignItems: "center",
    backgroundColor: palette.primarySoft,
    borderColor: palette.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  summaryScoreText: {
    color: palette.primary,
    fontSize: 17,
    fontWeight: "900",
  },
  summaryTrack: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 10,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  summaryFill: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    height: "100%",
  },
  statsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  statDivider: {
    backgroundColor: palette.border,
    height: 34,
    width: 1,
  },
  sectionBlock: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: spacing.md,
  },
  featuredList: {
    paddingRight: spacing.xl,
  },
  featuredCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginRight: spacing.md,
    minHeight: 166,
    padding: spacing.lg,
    width: 190,
    ...shadow.subtle,
  },
  featuredTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  featuredBadge: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  featuredProgress: {
    color: palette.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  featuredTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  featuredDescription: {
    color: palette.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  featuredProgressBar: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 7,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  featuredProgressFill: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    height: "100%",
  },
  filterRow: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginBottom: spacing.xl,
    padding: 4,
  },
  filterButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  filterButtonActive: {
    backgroundColor: palette.surface,
    ...shadow.subtle,
  },
  filterText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  filterTextActive: {
    color: palette.text,
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionCount: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: spacing.md,
    padding: spacing.lg,
    ...shadow.subtle,
  },
  cardUnlocked: {
    borderColor: palette.accent,
  },
  badge: {
    alignItems: "center",
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    marginRight: spacing.md,
    width: 60,
  },
  badgeUnlocked: {
    backgroundColor: palette.primary,
  },
  badgeActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.accent,
    borderWidth: 1,
  },
  badgeLocked: {
    backgroundColor: palette.surfaceMuted,
  },
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  cardTitleWrap: {
    flex: 1,
  },
  groupLabel: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 3,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusUnlocked: {
    backgroundColor: palette.successSoft,
  },
  statusActive: {
    backgroundColor: palette.primarySoft,
  },
  statusLocked: {
    backgroundColor: palette.surfaceMuted,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  statusTextUnlocked: {
    color: palette.success,
  },
  statusTextActive: {
    color: palette.primary,
  },
  statusTextLocked: {
    color: palette.textSoft,
  },
  cardDescription: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  progressMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressCaption: {
    color: palette.textSoft,
    fontSize: 11,
    fontWeight: "900",
  },
  progressText: {
    color: palette.warning,
    fontSize: 12,
    fontWeight: "900",
  },
  progressTextUnlocked: {
    color: palette.success,
  },
  progressBarBg: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 7,
    overflow: "hidden",
  },
  progressBarFill: {
    borderRadius: radius.pill,
    height: "100%",
  },
  progressGreen: {
    backgroundColor: palette.success,
  },
  progressOrange: {
    backgroundColor: palette.primary,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xxl,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
