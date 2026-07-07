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
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, // 🚨 新增：用于显示 AI 解析时的 Loading 圈
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "../../components/app-header";
import { useAppDialog } from "../../components/app-dialog";
import { palette, radius, shadow, spacing } from "../../constants/ui";
import { auth, db } from "../../firebaseConfig";
import {
  createReactiveBudgetAlert,
  TransactionRecord,
} from "../../services/financialIntelligence";
import { getNextRecurringDate } from "../../services/recurringService";
import {
  allocationsByCategoryName,
  CategoryRecord,
  findCategorySelection,
} from "../../services/categoryData";
import { parseAmountInput } from "../../services/amountValidation";

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
  goalId?: string;
  id: string;
  isGoal?: boolean;
  name: string;
  parentId: string | null;
  type: string;
};

type EntrySource = "manual" | "receipt" | "voice";

const RECEIPT_MAX_EDGE = 1600;
const RECEIPT_JPEG_QUALITY = 0.78;
const VOICE_WAVE_BAR_HEIGHTS = [18, 34, 52, 28, 46, 64, 38, 56, 24];

const InputField = ({ label, children }: InputFieldProps) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <View style={styles.inputContainer}>{children}</View>
  </View>
);

export default function AddTransactionScreen() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const bottomActionOffset = Math.max(insets.bottom + 88, 112);
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
    returnedCategoryId,
    returnedCategoryName,
    returnedCategoryParentId,
    returnedCategoryParentName,
    returnedType,
    returnedAmount,
    returnedNote,
    returnedDate,
    returnedRecurring,
    returnedGoalId,
    editId: paramEditId,
    recurringId: paramRecurringId,
  } = useLocalSearchParams();

  // 基础状态
  const [amount, setAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editRecurringId, setEditRecurringId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [categoryParentName, setCategoryParentName] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [note, setNote] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("Expense");
  const [userCategories, setUserCategories] = useState<CategoryType[]>([]);
  const [userCategoryNames, setUserCategoryNames] = useState<string[]>([]);
  const [, setIsAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"receipt" | "voice" | null>(null);
  const [entrySource, setEntrySource] = useState<EntrySource>("manual");
  const [isVoiceModalVisible, setVoiceModalVisible] = useState(false);
  const [isVoiceRecordingPanelVisible, setVoiceRecordingPanelVisible] =
    useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const voicePulseAnim = useRef(new Animated.Value(0)).current;
  const voiceWaveAnims = useRef(
    VOICE_WAVE_BAR_HEIGHTS.map(() => new Animated.Value(0)),
  ).current;

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

  const resolveCategorySelection = (categoryName = category) => {
    const selectedFromId = categoryId
      ? userCategories.find((item) => item.id === categoryId)
      : null;
    const selectedByName =
      findCategorySelection(
        categoryName,
        selectedSegment,
        userCategories as CategoryRecord[],
      ) ||
      (selectedFromId
        ? findCategorySelection(
            categoryName || selectedFromId.name,
            selectedSegment,
            userCategories as CategoryRecord[],
          )
        : null);

    return {
      categoryId: selectedByName?.categoryId || categoryId || null,
      categoryName: selectedByName?.categoryName || categoryName,
      categoryParentId:
        selectedByName?.categoryParentId || categoryParentId || categoryId || null,
      categoryParentName:
        selectedByName?.categoryParentName ||
        categoryParentName ||
        categoryName.split(" - ")[0] ||
        "",
    };
  };

  const applyCategorySelection = (categoryName: string) => {
    const resolved = findCategorySelection(
      categoryName,
      selectedSegment,
      userCategories as CategoryRecord[],
    );

    setCategory(resolved?.category || categoryName);
    setCategoryId(resolved?.categoryId || "");
    setCategoryParentId(resolved?.categoryParentId || "");
    setCategoryParentName(resolved?.categoryParentName || "");
  };

  const formatRecordingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
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
    if (!isVoiceRecordingPanelVisible) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulseAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(voicePulseAnim, {
          toValue: 0,
          duration: 850,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const waveLoop = Animated.loop(
      Animated.stagger(
        80,
        voiceWaveAnims.map((anim, index) =>
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 260 + index * 12,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 280,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );

    pulseLoop.start();
    waveLoop.start();

    return () => {
      pulseLoop.stop();
      waveLoop.stop();
      voicePulseAnim.setValue(0);
      voiceWaveAnims.forEach((anim) => anim.setValue(0));
    };
  }, [isVoiceRecordingPanelVisible, voicePulseAnim, voiceWaveAnims]);

  useEffect(() => {
    if (!recorderState.isRecording) return;

    const timer = setInterval(() => {
      setVoiceRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [recorderState.isRecording]);

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
      setUserCategories(categories);
      const isGoalCategory = (item: CategoryType) =>
        Boolean(item.isGoal) || item.name.startsWith("🎯");
      const expenseCategories = categories.filter(
        (c) => c.type === "Expense" && !isGoalCategory(c),
      );
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
    if (returnedCategoryId) setCategoryId(returnedCategoryId as string);
    if (returnedCategoryParentId) {
      setCategoryParentId(returnedCategoryParentId as string);
    }
    if (returnedCategoryParentName) {
      setCategoryParentName(returnedCategoryParentName as string);
    }
    if (returnedCategoryName && !returnedCategory) {
      setCategory(returnedCategoryName as string);
    }
    if (returnedType) setSelectedSegment(returnedType as string);
    if (returnedAmount) setAmount(returnedAmount as string);
    if (returnedNote) setNote(returnedNote as string);
    if (returnedRecurring) setRecurring(returnedRecurring as string);
    if (paramEditId) setEditId(paramEditId as string);
    if (paramRecurringId) setEditRecurringId(paramRecurringId as string);
    if (returnedGoalId && typeof returnedGoalId === "string") {
      setSelectedGoalId(returnedGoalId);
    }

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
    returnedCategoryId,
    returnedCategoryName,
    returnedCategoryParentId,
    returnedCategoryParentName,
    returnedType,
    returnedAmount,
    returnedNote,
    returnedDate,
    returnedRecurring,
    returnedGoalId,
    paramEditId,
    paramRecurringId,
  ]);

  useEffect(() => {
    if (!editRecurringId) return;

    getDoc(doc(db, "recurring_transactions", editRecurringId))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        const nextDate = snapshot.data().nextExecuteDate;
        if (typeof nextDate === "string" && nextDate.trim()) {
          setNextRecurringDate(new Date(nextDate));
        }
      })
      .catch(() => undefined);
  }, [editRecurringId]);

  // ==========================================
  // 🚨 新增：AI 智能解析逻辑
  // ==========================================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          applyCategorySelection(result.category);
          appAlert(
            "✨ Smart Parse Success",
            "Form autofilled. Please review and save.",
          );
        }
      }
    } catch {
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
    if (resolvedCategory) applyCategorySelection(resolvedCategory);
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

  const scanReceiptAsset = async (asset: ImagePicker.ImagePickerAsset) => {
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

    await scanReceiptAsset(image.assets[0]);
  };

  const handleReceiptAlbumPick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      appAlert("Photo Permission", "Please allow photo access to choose a receipt.");
      return;
    }

    const image = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: false,
      quality: 1,
      allowsMultipleSelection: false,
    });

    if (image.canceled) return;

    await scanReceiptAsset(image.assets[0]);
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
        const message =
          error instanceof Error
            ? error.message
            : "Failed to recognize the voice entry. Please try again.";
        appAlert("Voice Parse Error", message);
      } finally {
        setAiMode(null);
        setVoiceRecordingPanelVisible(false);
        setVoiceRecordingSeconds(0);
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
      setVoiceRecordingSeconds(0);
      setVoiceRecordingPanelVisible(true);
      audioRecorder.record();
    } catch {
      setVoiceRecordingPanelVisible(false);
      appAlert("Voice Error", "Could not start recording. Please try again.");
    }
  };

  const handleCancelVoiceRecording = async () => {
    if (aiMode === "voice") return;

    try {
      if (recorderState.isRecording) {
        await audioRecorder.stop();
      }
    } catch {
      appAlert("Voice Error", "Could not cancel recording. Please try again.");
    } finally {
      setVoiceRecordingPanelVisible(false);
      setVoiceRecordingSeconds(0);
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to parse the transcript. Please try again.";
      appAlert("Voice Parse Error", message);
    } finally {
      setAiMode(null);
    }
  };

  const getPostSaveBudgetAlert = async (
    savedTransaction: TransactionRecord,
    userId: string,
  ) => {
    if (String(savedTransaction.type || "").toLowerCase() !== "expense") {
      return null;
    }

    const transactionMonth = String(savedTransaction.date || formatDate(new Date())).slice(0, 7);
    const budgetSnapshot = await getDoc(
      doc(db, "monthly_budgets", `${userId}_${transactionMonth}`),
    );
    const allocations = budgetSnapshot.exists()
      ? budgetSnapshot.data().allocations || {}
      : {};
    const transactionQuery = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      where("date", ">=", `${transactionMonth}-01`),
      where("date", "<=", `${transactionMonth}-31`),
    );
    const transactionSnapshot = await getDocs(transactionQuery);
    const monthTransactions = transactionSnapshot.docs.map((transactionDoc) => ({
      id: transactionDoc.id,
      ...transactionDoc.data(),
    })) as TransactionRecord[];

    if (
      savedTransaction.id &&
      !monthTransactions.some((transaction) => transaction.id === savedTransaction.id)
    ) {
      monthTransactions.push(savedTransaction);
    }

    return createReactiveBudgetAlert(
      savedTransaction,
      monthTransactions,
      allocationsByCategoryName(allocations, userCategories as CategoryRecord[]),
    );
  };

  // ==========================================
  // 保存逻辑
  // ==========================================
  const handleSave = async () => {
    const numericAmount = parseAmountInput(amount);
    if (numericAmount === null) {
      appAlert("Oops!", "Please enter a valid amount greater than 0, with up to 2 decimal places.");
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
      const now = new Date();
      const isTransfer = selectedSegment === "Transfer";
      const goalFields = isTransfer ? { goalId: selectedGoalId || null } : { goalId: null };
      const sourceFields =
        entrySource === "manual"
          ? {}
          : {
              entrySource,
            };
      const categoryFields = resolveCategorySelection();
      let saveMessage = editId
        ? "Transaction updated successfully."
        : "Transaction saved successfully.";

      if (editId) {
        const recurringRef =
          editRecurringId || recurring !== "Never"
            ? editRecurringId
              ? doc(db, "recurring_transactions", editRecurringId)
              : doc(collection(db, "recurring_transactions"))
            : null;

        await updateDoc(doc(db, "transactions", editId), {
          amount: numericAmount,
          category: deleteField(),
          categoryId: categoryFields.categoryId,
          categoryName: categoryFields.categoryName,
          categoryParentId: categoryFields.categoryParentId,
          categoryParentName: categoryFields.categoryParentName,
          note: note,
          date: formatDate(date),
          type: selectedSegment,
          recurring: recurring,
          recurringId: recurring !== "Never" ? recurringRef?.id || null : null,
          updatedAt: now,
          ...goalFields,
          ...sourceFields,
        });

        if (recurringRef && recurring !== "Never") {
          await setDoc(
            recurringRef,
            {
              userId: user.uid,
              amount: numericAmount,
              category: deleteField(),
              categoryId: categoryFields.categoryId,
              categoryName: categoryFields.categoryName,
              categoryParentId: categoryFields.categoryParentId,
              categoryParentName: categoryFields.categoryParentName,
              note: note,
              type: selectedSegment,
              frequency: recurring,
              firstTransactionId: editId,
              startDate: formatDate(date),
              nextExecuteDate: formatDate(nextRecurringDate),
              isActive: true,
              updatedAt: now,
              ...goalFields,
            },
            { merge: true },
          );
        } else if (recurringRef && recurring === "Never") {
          await updateDoc(recurringRef, {
            isActive: false,
            updatedAt: now,
          });
        }

        const savedTransaction: TransactionRecord = {
          id: editId,
          amount: numericAmount,
          categoryId: categoryFields.categoryId,
          categoryName: categoryFields.categoryName,
          categoryParentId: categoryFields.categoryParentId,
          categoryParentName: categoryFields.categoryParentName,
          date: formatDate(date),
          note,
          recurring,
          type: selectedSegment,
          ...goalFields,
        };
        const budgetAlert =
          selectedSegment === "Expense"
            ? await getPostSaveBudgetAlert(savedTransaction, user.uid)
            : null;
        if (budgetAlert) {
          saveMessage = `${saveMessage}\n\nAI Coach: ${budgetAlert.description}`;
        }
      } else {
        const transactionRef = doc(collection(db, "transactions"));
        const recurringRef =
          recurring !== "Never"
            ? doc(collection(db, "recurring_transactions"))
            : null;

        await setDoc(transactionRef, {
          userId: user.uid,
          amount: numericAmount,
          categoryId: categoryFields.categoryId,
          categoryName: categoryFields.categoryName,
          categoryParentId: categoryFields.categoryParentId,
          categoryParentName: categoryFields.categoryParentName,
          note: note,
          date: formatDate(date),
          type: selectedSegment,
          recurring: recurring,
          recurringId: recurringRef?.id || null,
          createdAt: now,
          entrySource,
          ...goalFields,
        });

        if (recurringRef) {
          await setDoc(recurringRef, {
            userId: user.uid,
            amount: numericAmount,
            categoryId: categoryFields.categoryId,
            categoryName: categoryFields.categoryName,
            categoryParentId: categoryFields.categoryParentId,
            categoryParentName: categoryFields.categoryParentName,
            note: note,
            type: selectedSegment,
            frequency: recurring,
            firstTransactionId: transactionRef.id,
            startDate: formatDate(date),
            nextExecuteDate: formatDate(nextRecurringDate),
            isActive: true,
            createdAt: now,
            ...goalFields,
          });
        }

        const savedTransaction: TransactionRecord = {
          id: transactionRef.id,
          amount: numericAmount,
          categoryId: categoryFields.categoryId,
          categoryName: categoryFields.categoryName,
          categoryParentId: categoryFields.categoryParentId,
          categoryParentName: categoryFields.categoryParentName,
          date: formatDate(date),
          note,
          recurring,
          type: selectedSegment,
          ...goalFields,
        };
        const budgetAlert =
          selectedSegment === "Expense"
            ? await getPostSaveBudgetAlert(savedTransaction, user.uid)
            : null;
        if (budgetAlert) {
          saveMessage = `${saveMessage}\n\nAI Coach: ${budgetAlert.description}`;
        }
      }

      appAlert("Success!", saveMessage);

      setAmount("");
      setCategory("");
      setCategoryId("");
      setCategoryParentId("");
      setCategoryParentName("");
      setSelectedGoalId("");
      setNote("");
      setDate(new Date());
      setNextRecurringDate(new Date());
      setRecurring("Never");
      setEditId(null);
      setEditRecurringId(null);
      setEntrySource("manual");

      router.setParams({
        returnedType: "",
        returnedCategory: "",
        returnedCategoryId: "",
        returnedCategoryName: "",
        returnedCategoryParentId: "",
        returnedCategoryParentName: "",
        returnedAmount: "",
        returnedNote: "",
        returnedDate: "",
        returnedRecurring: "",
        returnedGoalId: "",
        editId: "",
        recurringId: "",
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

  const voicePulseStyle = {
    opacity: voicePulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0],
    }),
    transform: [
      {
        scale: voicePulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.9],
        }),
      },
    ],
  };
  const isVoiceAnalyzing = aiMode === "voice" && !recorderState.isRecording;
  const segmentColor =
    selectedSegment === "Expense"
      ? palette.danger
      : selectedSegment === "Income"
        ? palette.success
        : palette.primary;

  return (
    <View style={styles.container}>
      <AppHeader
        showBack={Boolean(editId)}
        title={editId ? "Edit Transaction" : "Add Transaction"}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomActionOffset + 96 },
        ]}
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
              setCategoryId("");
              setCategoryParentId("");
              setCategoryParentName("");
              setSelectedGoalId("");
              router.setParams({
                returnedType: "Expense",
                returnedCategory: "",
                returnedCategoryId: "",
                returnedCategoryName: "",
                returnedCategoryParentId: "",
                returnedCategoryParentName: "",
                returnedGoalId: "",
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
              setCategoryId("");
              setCategoryParentId("");
              setCategoryParentName("");
              setSelectedGoalId("");
              router.setParams({
                returnedType: "Income",
                returnedCategory: "",
                returnedCategoryId: "",
                returnedCategoryName: "",
                returnedCategoryParentId: "",
                returnedCategoryParentName: "",
                returnedGoalId: "",
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

          <TouchableOpacity
            style={[
              styles.segment,
              selectedSegment === "Transfer" && styles.segmentSelected,
            ]}
            onPress={() => {
              setSelectedSegment("Transfer");
              setCategory("");
              setCategoryId("");
              setCategoryParentId("");
              setCategoryParentName("");
              setSelectedGoalId("");
              router.setParams({
                returnedType: "Transfer",
                returnedCategory: "",
                returnedCategoryId: "",
                returnedCategoryName: "",
                returnedCategoryParentId: "",
                returnedCategoryParentName: "",
                returnedGoalId: "",
              });
            }}
          >
            <Text
              style={[
                styles.segmentText,
                selectedSegment === "Transfer" && styles.segmentTextSelected,
              ]}
            >
              Transfer
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
                  color: segmentColor,
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
                      segmentColor,
                    minWidth: 60,
                  },
                ]}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
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

      <View style={[styles.bottomActions, { bottom: bottomActionOffset }]}>
        <View style={styles.floatingButtons}>
          <TouchableOpacity
            style={styles.fabSmall}
            onPress={handleReceiptScan}
            disabled={aiMode !== null}
            accessibilityLabel="Scan receipt with camera"
          >
            {aiMode === "receipt" ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <FontAwesome name="camera" size={24} color="#FFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.fabSmall}
            onPress={handleReceiptAlbumPick}
            disabled={aiMode !== null}
            accessibilityLabel="Choose receipt from photo album"
          >
            <FontAwesome name="image" size={24} color="#FFF" />
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
                  if (option !== "Never") {
                    setNextRecurringDate(
                      new Date(getNextRecurringDate(formatDate(date), option)),
                    );
                  }
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
        visible={isVoiceRecordingPanelVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelVoiceRecording}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.recordingModalContent}>
            <View style={styles.recordingIconWrap}>
              {!isVoiceAnalyzing && (
                <Animated.View
                  style={[styles.recordingPulse, voicePulseStyle]}
                />
              )}
              <View style={styles.recordingIcon}>
                {isVoiceAnalyzing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <MaterialIcons name="keyboard-voice" size={38} color="#FFF" />
                )}
              </View>
            </View>

            <Text style={styles.recordingTitle}>
              {isVoiceAnalyzing ? "Analyzing voice..." : "Recording..."}
            </Text>
            <Text style={styles.recordingTimer}>
              {formatRecordingTime(voiceRecordingSeconds)}
            </Text>

            <View style={styles.voiceWave}>
              {VOICE_WAVE_BAR_HEIGHTS.map((height, index) => (
                <Animated.View
                  key={`${height}-${index}`}
                  style={[
                    styles.voiceWaveBar,
                    {
                      height,
                      transform: [
                        {
                          scaleY: voiceWaveAnims[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.45, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.recordingActions}>
              <TouchableOpacity
                style={[styles.recordingButton, styles.recordingCancelButton]}
                onPress={handleCancelVoiceRecording}
                disabled={isVoiceAnalyzing}
              >
                <Text style={styles.recordingCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.recordingButton, styles.recordingStopButton]}
                onPress={handleVoiceRecordingPress}
                disabled={isVoiceAnalyzing}
              >
                {isVoiceAnalyzing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="stop" size={22} color="#FFF" />
                    <Text style={styles.recordingStopText}>Stop</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isVoiceModalVisible}
        transparent={true}
        animationType="slide"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
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
        </KeyboardAvoidingView>
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
    </View>
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
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  floatingButtons: { flexDirection: "row" },
  fabSmall: {
    backgroundColor: palette.primary,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
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
  recordingModalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 34,
    alignItems: "center",
  },
  recordingIconWrap: {
    alignItems: "center",
    height: 112,
    justifyContent: "center",
    marginBottom: 6,
    width: 112,
  },
  recordingPulse: {
    backgroundColor: palette.danger,
    borderRadius: 56,
    height: 86,
    position: "absolute",
    width: 86,
  },
  recordingIcon: {
    alignItems: "center",
    backgroundColor: palette.danger,
    borderRadius: 38,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  recordingTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  recordingTimer: {
    color: palette.danger,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  voiceWave: {
    alignItems: "center",
    flexDirection: "row",
    height: 74,
    justifyContent: "center",
    marginTop: 16,
    width: "100%",
  },
  voiceWaveBar: {
    backgroundColor: palette.primary,
    borderRadius: 4,
    marginHorizontal: 4,
    width: 8,
  },
  recordingActions: {
    flexDirection: "row",
    marginTop: 20,
    width: "100%",
  },
  recordingButton: {
    alignItems: "center",
    borderRadius: radius.lg,
    flex: 1,
    flexDirection: "row",
    height: 54,
    justifyContent: "center",
  },
  recordingCancelButton: {
    backgroundColor: palette.surfaceMuted,
    marginRight: 10,
  },
  recordingStopButton: {
    backgroundColor: palette.danger,
    marginLeft: 10,
  },
  recordingCancelText: {
    color: palette.textMuted,
    fontSize: 16,
    fontWeight: "bold",
  },
  recordingStopText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 6,
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

