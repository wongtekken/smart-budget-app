import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, StatusBar } from 'react-native';
// 引入多种图标库以完美匹配你的设计图
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { palette } from "../constants/ui";

// 1. 定义成就的数据类型
type AchievementType = {
  id: string;
  title: string;
  description: string;
  iconName: any;
  iconFamily: 'Ionicons' | 'FontAwesome5' | 'MaterialCommunity';
  progress: number; // 0 到 100 的进度
  isUnlocked: boolean;
};

// 2. 准备精美的假数据，还原你的设计图
const ACHIEVEMENTS_DATA: AchievementType[] = [
  // 已解锁的成就
  {
    id: '1',
    title: 'Monthly Mastery',
    description: 'Keep tracking for a complete calendar month',
    iconName: 'calendar-check',
    iconFamily: 'MaterialCommunity',
    progress: 100,
    isUnlocked: true,
  },
  {
    id: '2',
    title: 'First Step to Wealth',
    description: 'Create the first transaction',
    iconName: 'piggy-bank',
    iconFamily: 'FontAwesome5',
    progress: 100,
    isUnlocked: true,
  },
  // 未解锁的成就
  {
    id: '3',
    title: 'Category Creator',
    description: 'Create the first category',
    iconName: 'human-handsup', // 类似设计图的小人
    iconFamily: 'MaterialCommunity',
    progress: 85, // 模拟 85% 进度
    isUnlocked: false,
  },
  {
    id: '4',
    title: 'Thousand-Transaction Titan',
    description: 'Record a total of 1000 transactions',
    iconName: 'yen-sign',
    iconFamily: 'FontAwesome5',
    progress: 40,
    isUnlocked: false,
  },
  {
    id: '5',
    title: 'Template Master',
    description: 'Create more than 3 custom budget templates',
    iconName: 'chart-pie',
    iconFamily: 'MaterialCommunity',
    progress: 60,
    isUnlocked: false,
  },
  {
    id: '6',
    title: 'Scan Savvy Start',
    description: 'Successfully record a transaction draft using OCR ticket scanning for the first time',
    iconName: 'scan-helper',
    iconFamily: 'MaterialCommunity',
    progress: 10,
    isUnlocked: false,
  },
];

export default function AchievementsScreen() {
  const router = useRouter();

  // 渲染不同家族的图标的魔法小助手
  const renderIcon = (family: string, name: any) => {
    switch (family) {
      case 'FontAwesome5': return <FontAwesome5 name={name} size={24} color="#FFF" />;
      case 'MaterialCommunity': return <MaterialCommunityIcons name={name} size={28} color="#FFF" />;
      default: return <Ionicons name={name} size={28} color="#FFF" />;
    }
  };

  // 独立的成就卡片组件
  const AchievementCard = ({ item }: { item: AchievementType }) => (
    <View style={styles.card}>
      {/* 左侧圆形图标 */}
      <View style={[styles.iconContainer, item.isUnlocked ? styles.iconUnlocked : styles.iconLocked]}>
        {renderIcon(item.iconFamily, item.iconName)}
      </View>
      
      {/* 右侧内容与进度条 */}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDescription}>{item.description}</Text>
        
        {/* 🚨 进度条核心逻辑 */}
        <View style={styles.progressBarBg}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${item.progress}%` }, // 根据数据自动计算宽度！
              item.isUnlocked ? styles.progressGreen : styles.progressOrange
            ]} 
          />
        </View>
      </View>
    </View>
  );

  const unlockedList = ACHIEVEMENTS_DATA.filter(a => a.isUnlocked);
  const lockedList = ACHIEVEMENTS_DATA.filter(a => !a.isUnlocked);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* 顶部导航 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={32} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Achievements</Text>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="options-outline" size={30} color={palette.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Unlocked 区域 */}
        <Text style={styles.sectionTitle}>Unlocked Achievements</Text>
        {unlockedList.map(item => (
          <AchievementCard key={item.id} item={item} />
        ))}

        {/* Locked 区域 */}
        <Text style={[styles.sectionTitle, { marginTop: 15 }]}>Locked Achievement</Text>
        {lockedList.map(item => (
          <AchievementCard key={item.id} item={item} />
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

// 排版与色彩映射
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA', // 极其微弱的灰底，让白色卡片更凸显
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerIcon: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000',
    marginBottom: 15,
  },
  
  // 卡片主体
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    // 轻微阴影增加层次
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  
  // 左侧图标
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  iconUnlocked: {
    backgroundColor: '#FF9800', // 你的橘黄色
  },
  iconLocked: {
    backgroundColor: '#F5A623', // 稍微暗一点的橘色区分锁定
  },
  
  // 右侧文字与进度
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4A4A4A',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10,
    lineHeight: 14,
  },
  
  // 进度条样式
  progressBarBg: {
    height: 6,
    backgroundColor: '#F5F5F5', // 灰色底槽
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressGreen: {
    backgroundColor: '#4CAF50', // 完成时的绿色
  },
  progressOrange: {
    backgroundColor: '#FFA726', // 进行中的橘黄色
  },
});
