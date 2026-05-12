import { FontAwesome, Ionicons, MaterialIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, // 🚨 新增：用于显示 AI 解析时的 Loading 圈
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppDialog } from "../../components/app-dialog";
import { palette, radius, shadow, spacing } from "../../constants/ui";
import { auth, db } from "../../firebaseConfig";

// 🚨 新增：引入你写好的 AI 解析服务
import {
  parseVoiceAudio,
  parseTransactionText,
  parseVoiceExpense,
  scanReceiptImage,
} from "../../services/aiService";

type InputFieldProps = {
  label: string;
  children: React.ReactNode;
};

type CategoryType = {
  id: string;
  name: string;
  parentId: string | null;
  type: string;
};

type EntrySource = "manual" | "receipt" | "voice";

const RECEIPT_MAX_EDGE = 1600;
const RECEIPT_JPEG_QUALITY = 0.78;

const InputField = ({ label, children }: InputFieldProps) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <View style={styles.inputContainer}>{children}</View>
  </View>
);

export default function AddTransactionScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const appAlert = (title: string, message = "") => {
    const lowerTitle = title.toLowerCase();
    const type: "error" | "info" | "success" | "warning" = lowerTitle.includes(
      "success",
    )
      ? "success"
      : lowerTitle.includes("error") || lowerTitle.includes("failed")
        ? "error"
        : lowerTitle.includes("permission") ||
            lowerTitle.includes("needed") ||
            lowerTitle.includes("oops")
          ? "warning"
          : "info";

    showDialog({ title, message, type });
  };
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const {
    returnedCategory,
    returnedType,
    returnedAmount,
    returnedNote,
    returnedDate,
    returnedRecurring,
    editId: paramEditId,
  } = useLocalSearchParams();

  // 基础状态
  const [amount, setAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("Expense");
  const [userCategoryNames, setUserCategoryNames] = useState<string[]>([]);
  const [, setIsAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"receipt" | "voice" | null>(null);
  const [entrySource, setEntrySource] = useState<EntrySource>("manual");
  const [isVoiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  // 双日历状态管理
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nextRecurringDate, setNextRecurringDate] = useState(new Date());
  const [showNextDatePicker, setShowNextDatePicker] = useState(false);

  const [recurring, setRecurring] = useState("Never");
  const [isRecurringModalVisible, setRecurringModalVisible] = useState(false);

  // 时区防偏移的日期格式化工具
  const formatDate = (d: Date) => {
    const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return localDate.toISOString().split("T")[0];
  };

  const prepareReceiptImage = async (asset: ImagePicker.ImagePickerAsset) => {
    const longestEdge = Math.max(asset.width || 0, asset.height || 0);
    const resize =
      longestEdge > RECEIPT_MAX_EDGE
        ? asset.width && asset.height && asset.width >= asset.height
          ? { width: RECEIPT_MAX_EDGE }
          : { height: RECEIPT_MAX_EDGE }
        : null;

    const processed = await ImageManipulator.manipulateAsync(
      asset.uri,
      resize ? [{ resize }] : [],
      {
        base64: true,
        compress: RECEIPT_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    return {
      base64: processed.base64,
      mimeType: "image/jpeg",
    };
  };

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 获取当前用户的所有分类
    const q = query(
      collection(db, "categories"),
      where("userId", "==", user.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 提取所有的分类名称，组成一个纯字符串数组传给 AI
      const categories = snapshot.docs.map((categoryDoc) => ({
        id: categoryDoc.id,
        ...categoryDoc.data(),
      })) as CategoryType[];
      const expenseCategories = categories.filter((c) => c.type === "Expense");
      const expenseParents = expenseCategories.filter((c) => !c.parentId);
      const categoryNames = expenseParents.flatMap((parent) => {
        const subcategories = expenseCategories.filter(
          (sub) => sub.parentId === parent.id,
        );

        if (subcategories.length === 0) {
          return [parent.name];
        }

        return subcategories.map((sub) => `${parent.name} - ${sub.name}`);
      });
      setUserCategoryNames(categoryNames);
    });

    return () => unsubscribe();
  }, []);

  // 极其安全的监听参数逻辑
  useEffect(() => {
    if (returnedCategory) setCategory(returnedCategory as string);
    if (returnedType) setSelectedSegment(returnedType as string);
    if (returnedAmount) setAmount(returnedAmount as string);
    if (returnedNote) setNote(returnedNote as string);
    if (returnedRecurring) setRecurring(returnedRecurring as string);
    if (paramEditId) setEditId(paramEditId as string);

    if (
      returnedDate &&
      typeof returnedDate === "string" &&
      returnedDate.trim() !== ""
    ) {
      const parsedDate = new Date(returnedDate);
      if (!isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
      }
    }
  }, [
    returnedCategory,
    returnedType,
    returnedAmount,
    returnedNote,
    returnedDate,
    returnedRecurring,
    paramEditId,
  ]);

  // ==========================================
  // 🚨 新增：AI 智能解析逻辑
  // ==========================================
  const handleSmartInput = async () => {
    setVoiceModalVisible(true);
    if (Date.now() >= 0) return;
    // 作为测试阶段，我们先让用户在 Note 框输入文字，然后按麦克风识别
    if (!note.trim()) {
      appAlert(
        "Hint",
        "Please type your transaction details in the Note field first (e.g., 'spent 15 on lunch'), then tap this icon. (Real voice input coming soon!)",
      );
      return;
    }

    setIsAiLoading(true);
    try {
      const result = await parseTransactionText(note, userCategoryNames);

      if (result) {
        // 自动填充返回的数据
        if (result.amount) setAmount(result.amount.toString());
        if (result.note) setNote(result.note || "");
        if (result.type) {
          setSelectedSegment(
            result.type.toLowerCase() === "income" ? "Income" : "Expense",
          );
        }

        // 智能分类处理
        if (
          result.category === "NeedsNewCategory" ||
          result.category === "Other"
        ) {
          appAlert(
            "Category Needed",
            "AI couldn't map this to your existing categories. Amount is filled, please select a category manually.",
          );
        } else if (result.category) {
          setCategory(result.category);
          appAlert(
            "✨ Smart Parse Success",
            "Form autofilled. Please review and save.",
          );
        }
      }
    } catch (error) {
      appAlert("Error", "Failed to parse text. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiResultToForm = (
    result: {
      amount?: number;
      category?: string;
      date?: string;
      item_description?: string;
      note?: string;
      type?: string;
    },
    source: Exclude<EntrySource, "manual">,
  ) => {
    setEntrySource(source);
    const categoryFallback = userCategoryNames.includes("Other") ? "Other" : "";
    const suggestedCategory = result.category?.trim();
    const resolvedCategory =
      suggestedCategory && userCategoryNames.includes(suggestedCategory)
        ? suggestedCategory
        : categoryFallback;

    if (result.amount) setAmount(result.amount.toString());
    if (resolvedCategory) setCategory(resolvedCategory);
    if (result.note || result.item_description) {
      setNote(result.note || result.item_description || "");
    }
    if (result.date) {
      const parsedDate = new Date(result.date);
      if (!isNaN(parsedDate.getTime())) setDate(parsedDate);
    }
    setSelectedSegment(
      result.type?.toLowerCase() === "income" ? "Income" : "Expense",
    );

    if (!resolvedCategory) {
      appAlert(
        "Category Needed",
        "AI filled the transaction details, but please choose the category manually.",
      );
      return;
    }

    appAlert(
      "AI Autofill Complete",
      suggestedCategory && suggestedCategory !== resolvedCategory
        ? `Category set to ${resolvedCategory}. Please review before saving.`
        : "Please review the details before saving.",
    );
  };

  const handleReceiptScan = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      appAlert("Camera Permission", "Please allow camera access to scan receipts.");
      return;
    }

    const image = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: false,
      quality: 1,
    });

    if (image.canceled) return;

    const asset = image.assets[0];
    if (!asset?.uri) {
      appAlert("Receipt Error", "Could not read the receipt image. Please try again.");
      return;
    }

    setAiMode("receipt");
    try {
      const receiptImage = await prepareReceiptImage(asset);
      if (!receiptImage.base64) {
        throw new Error("Failed to prepare receipt image.");
      }

      const result = await scanReceiptImage(
        receiptImage.base64,
        receiptImage.mimeType,
        userCategoryNames,
        formatDate(new Date()),
      );
      applyAiResultToForm(result, "receipt");
      const user = auth.currentUser;
      if (user) {
        addDoc(collection(db, "achievement_events"), {
          userId: user.uid,
          type: "receipt_scan",
          source: "receipt",
          date: formatDate(new Date()),
          createdAt: new Date(),
        }).catch(() => undefined);
      }
    } catch (error) {
      appAlert(
        "Receipt Scanner Error",
        error instanceof Error
          ? error.message
          : "Failed to scan receipt. Please try again.",
      );
    } finally {
      setAiMode(null);
    }
  };

  const handleVoiceRecordingPress = async () => {
    if (recorderState.isRecording) {
      setAiMode("voice");
      try {
        await audioRecorder.stop();
        const recordingUri = audioRecorder.uri;

        if (!recordingUri) {
          appAlert("Voice Error", "Could not find the recorded audio. Please try again.");
          return;
        }

        const audioFile = new File(recordingUri);
        const audioBase64 = await audioFile.base64();
        const result = await parseVoiceAudio(
          audioBase64,
          "audio/mp4",
          userCategoryNames,
          formatDate(new Date()),
        );
        applyAiResultToForm(result, "voice");
      } catch (error) {
        appAlert("Voice Parse Error", "Failed to recognize the voice entry. Please try again.");
      } finally {
        setAiMode(null);
      }
      return;
    }

    const permission = await AudioModule.requestRecordingPermissionsAsync();

    if (!permission.granted) {
      appAlert("Microphone Permission", "Please allow microphone access to use voice entry.");
      return;
    }

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      appAlert("Voice Error", "Could not start recording. Please try again.");
    }
  };

  const handleVoiceTranscriptParse = async () => {
    if (!voiceTranscript.trim()) {
      appAlert("Voice Transcript", "Please enter or paste the voice transcript first.");
      return;
    }

    setAiMode("voice");
    try {
      const result = await parseVoiceExpense(
        voiceTranscript.trim(),
        userCategoryNames,
        formatDate(new Date()),
      );
      setVoiceModalVisible(false);
      setVoiceTranscript("");
      applyAiResultToForm(result, "voice");
    } catch (error) {
      appAlert("Voice Parse Error", "Failed to parse the transcript. Please try again.");
    } finally {
      setAiMode(null);
    }
  };

  // ==========================================
  // 保存逻辑
  // ==========================================
  const handleSave = async () => {
    if (!amount) {
      appAlert("Oops!", "Please enter an amount.");
      return;
    }
    if (!category) {
      appAlert("Oops!", "Please choose a category.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      appAlert("Error", "You must be logged in to save a transaction.");
      return;
    }

    try {
      const numericAmount = parseFloat(amount);
      const now = new Date();
      const sourceFields =
        entrySource === "manual"
          ? {}
          : {
              aiMode: entrySource,
              entrySource,
              source: entrySource,
            };

      if (editId) {
        await updateDoc(doc(db, "transactions", editId), {
          amount: numericAmount,
          category: category,
          note: note,
          date: formatDate(date),
          type: selectedSegment,
          recurring: recurring,
          updatedAt: now,
          ...sourceFields,
        });
        appAlert("Success!", "Transaction updated successfully.");
      } else {
        await addDoc(collection(db, "transactions"), {
          userId: user.uid,
          amount: numericAmount,
          category: category,
          note: note,
          date: formatDate(date),
          type: selectedSegment,
          recurring: recurring,
          createdAt: now,
          entrySource,
          source: entrySource,
        });

        if (recurring !== "Never") {
          await addDoc(collection(db, "recurring_transactions"), {
            userId: user.uid,
            amount: numericAmount,
            category: category,
            note: note,
            type: selectedSegment,
            frequency: recurring,
            startDate: formatDate(date),
            nextExecuteDate: formatDate(nextRecurringDate),
            isActive: true,
            createdAt: now,
          });
        }
        appAlert("Success!", "Transaction saved successfully.");
      }

      setAmount("");
      setCategory("");
      setNote("");
      setDate(new Date());
      setNextRecurringDate(new Date());
      setRecurring("Never");
      setEditId(null);
      setEntrySource("manual");

      router.setParams({
        returnedType: "",
        returnedCategory: "",
        returnedAmount: "",
        returnedNote: "",
        returnedDate: "",
        returnedRecurring: "",
        editId: "",
      });

      router.push("/(tabs)");
    } catch (error) {
      console.error("保存失败: ", error);
      appAlert("Error", "Failed to save transaction.");
    }
  };

  // ==========================================
  // UI 渲染辅助组件
  // ==========================================

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {editId ? "Edit Transaction" : "Add Transaction"}
        </Text>
        <TouchableOpacity>
          <Ionicons name="options-outline" size={28} color={palette.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[
              styles.segment,
              selectedSegment === "Expense" && styles.segmentSelected,
            ]}
            onPress={() => {
              setSelectedSegment("Expense");
              setCategory("");
              router.setParams({
                returnedType: "Expense",
                returnedCategory: "",
              });
            }}
          >
            <Text
              style={[
                styles.segmentText,
                selectedSegment === "Expense" && styles.segmentTextSelected,
              ]}
            >
              Expense
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segment,
              selectedSegment === "Income" && styles.segmentSelected,
            ]}
            onPress={() => {
              setSelectedSegment("Income");
              setCategory("");
              router.setParams({
                returnedType: "Income",
                returnedCategory: "",
              });
            }}
          >
            <Text
              style={[
                styles.segmentText,
                selectedSegment === "Income" && styles.segmentTextSelected,
              ]}
            >
              Income
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.yellowCard}>
          <InputField label="Amount">
            <View
              style={[
                styles.inputBase,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: selectedSegment === "Expense" ? palette.danger : palette.success,
                  marginRight: 5,
                }}
              >
                RM
              </Text>
              <TextInput
                style={[
                  styles.amountInput,
                  {
                    color:
                      selectedSegment === "Expense" ? palette.danger : palette.success,
                    minWidth: 60,
                  },
                ]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#CCC"
              />
            </View>
          </InputField>

          <InputField label="Category">
            <TouchableOpacity
              style={[styles.inputBase, { justifyContent: "center" }]}
              onPress={() =>
                router.push({
                  pathname: "/category",
                  params: {
                    type: selectedSegment,
                    savedAmount: amount,
                    savedNote: note,
                    savedDate: formatDate(date),
                    savedRecurring: recurring,
                    editId: editId || "",
                  },
                })
              }
            >
              <Text
                style={{
                  color: category ? palette.primary : palette.textSoft,
                  fontSize: 16,
                }}
              >
                {category || "Choose Category"}
              </Text>
            </TouchableOpacity>
          </InputField>

          <InputField label="Note">
            <TextInput
              style={styles.inputBase}
              placeholderTextColor="#FFB74D"
              placeholder="e.g. Spent 20 on taxi"
              value={note}
              onChangeText={setNote}
            />
          </InputField>

          <InputField label="Transaction Date">
            <TouchableOpacity
              style={[styles.inputBase, { justifyContent: "center" }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: palette.primary, fontSize: 16 }}>
                {formatDate(date)}
              </Text>
            </TouchableOpacity>
          </InputField>

          <InputField label="Recurring">
            <TouchableOpacity
              style={[styles.inputBase, { justifyContent: "center" }]}
              onPress={() => setRecurringModalVisible(true)}
            >
              <Text
                style={{
                  color: recurring === "Never" ? palette.textSoft : palette.primary,
                  fontSize: 16,
                }}
              >
                {recurring}
              </Text>
            </TouchableOpacity>
          </InputField>

          {recurring !== "Never" && (
            <InputField label="Next Billing Date">
              <TouchableOpacity
                style={[styles.inputBase, { justifyContent: "center" }]}
                onPress={() => setShowNextDatePicker(true)}
              >
                <Text
                  style={{ color: palette.danger, fontSize: 16, fontWeight: "bold" }}
                >
                  {formatDate(nextRecurringDate)}
                </Text>
              </TouchableOpacity>
            </InputField>
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomActions}>
        <View style={styles.floatingButtons}>
          <TouchableOpacity
            style={styles.fabSmall}
            onPress={handleReceiptScan}
            disabled={aiMode !== null}
          >
            {aiMode === "receipt" ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <FontAwesome name="camera" size={24} color="#FFF" />
            )}
          </TouchableOpacity>

          {/* 🚨 修改处：绑定 AI 逻辑，并在加载时显示圈圈 */}
          <TouchableOpacity
            style={styles.fabSmall}
            onPress={handleVoiceRecordingPress}
            disabled={aiMode !== null && !recorderState.isRecording}
          >
            {aiMode === "voice" ? (
              <ActivityIndicator color="#FFF" />
            ) : recorderState.isRecording ? (
              <MaterialIcons name="stop" size={24} color="#FFF" />
            ) : (
              <MaterialIcons name="keyboard-voice" size={24} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>
            {editId ? "Update" : "Save"}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={24}
            color="#FFF"
            style={styles.saveIcon}
          />
        </TouchableOpacity>
      </View>

      {/* Repeating Modal */}
      <Modal
        visible={isRecurringModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "80%",
              backgroundColor: palette.surface,
              borderRadius: 20,
              padding: 20,
              elevation: 10,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              Repeat
            </Text>
            {["Never", "Daily", "Weekly", "Monthly", "Yearly"].map((option) => (
              <TouchableOpacity
                key={option}
                style={{
                  paddingVertical: 15,
                  borderBottomWidth: option === "Yearly" ? 0 : 1,
                  borderBottomColor: "#EEE",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
                onPress={() => {
                  setRecurring(option);
                  setRecurringModalVisible(false);
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                  color: recurring === option ? palette.primary : palette.text,
                    fontWeight: recurring === option ? "bold" : "normal",
                  }}
                >
                  {option}
                </Text>
                {recurring === option && (
                  <Ionicons name="checkmark" size={24} color={palette.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isVoiceModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.voiceModalContent}>
            <Text style={styles.voiceModalTitle}>Voice Expense Entry</Text>
            <Text style={styles.voiceModalSubtitle}>
              Paste the speech transcript from your voice input.
            </Text>

            <TextInput
              style={styles.voiceTranscriptInput}
              placeholder="e.g. I spent 12 ringgit on a burger just now"
              placeholderTextColor="#FFB74D"
              value={voiceTranscript}
              onChangeText={setVoiceTranscript}
              multiline
            />

            <View style={styles.voiceModalActions}>
              <TouchableOpacity
                style={[styles.voiceModalButton, styles.voiceCancelButton]}
                onPress={() => {
                  setVoiceModalVisible(false);
                  setVoiceTranscript("");
                }}
                disabled={aiMode === "voice"}
              >
                <Text style={styles.voiceCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.voiceModalButton, styles.voiceParseButton]}
                onPress={handleVoiceTranscriptParse}
                disabled={aiMode === "voice"}
              >
                {aiMode === "voice" ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.voiceParseText}>Parse</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={date || new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}

      {showNextDatePicker && (
        <DateTimePicker
          value={nextRecurringDate || new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowNextDatePicker(false);
            if (selectedDate) setNextRecurringDate(selectedDate);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    zIndex: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: palette.text },
  scrollContent: { padding: spacing.xl, paddingBottom: 200 },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    marginBottom: 20,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
  },
  segmentSelected: { backgroundColor: palette.primary },
  segmentText: { fontSize: 16, fontWeight: "bold", color: palette.text },
  segmentTextSelected: { color: "#FFF" },
  yellowCard: {
    backgroundColor: palette.accent,
    borderRadius: radius.xl,
    padding: 20,
    ...shadow.card,
  },
  inputGroup: { marginBottom: 15 },
  inputLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: palette.text,
    marginBottom: 8,
  },
  inputContainer: { flexDirection: "row", alignItems: "center" },
  inputBase: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.primary,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: "bold",
    color: palette.danger,
    paddingVertical: 20,
  },
  bottomActions: {
    position: "absolute",
    bottom: 115,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  floatingButtons: { flexDirection: "row" },
  fabSmall: {
    backgroundColor: palette.primary,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.primary,
    borderRadius: 25,
    paddingVertical: 15,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonText: { fontSize: 18, fontWeight: "bold", color: "#FFF" },
  saveIcon: { marginLeft: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  voiceModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 34,
  },
  voiceModalTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  voiceModalSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  voiceTranscriptInput: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: palette.primary,
    fontSize: 16,
    minHeight: 120,
    marginTop: 20,
    padding: 16,
    textAlignVertical: "top",
  },
  voiceModalActions: {
    flexDirection: "row",
    marginTop: 18,
  },
  voiceModalButton: {
    alignItems: "center",
    borderRadius: radius.lg,
    flex: 1,
    height: 52,
    justifyContent: "center",
  },
  voiceCancelButton: {
    backgroundColor: palette.surfaceMuted,
    marginRight: 10,
  },
  voiceParseButton: {
    backgroundColor: palette.primary,
    marginLeft: 10,
  },
  voiceCancelText: {
    color: palette.textMuted,
    fontSize: 16,
    fontWeight: "bold",
  },
  voiceParseText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "bold",
  },
});

