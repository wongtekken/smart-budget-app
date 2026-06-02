import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";

type RecurringTransaction = {
  amount?: number | string;
  category?: string;
  categoryId?: string | null;
  categoryName?: string;
  categoryParentId?: string | null;
  categoryParentName?: string;
  frequency?: string;
  goalId?: string | null;
  isActive?: boolean;
  nextExecuteDate?: string;
  note?: string;
  startDate?: string;
  type?: string;
  userId?: string;
};

const MAX_GENERATIONS_PER_RUN = 60;
const SUPPORTED_FREQUENCIES = new Set([
  "Daily",
  "Weekly",
  "Monthly",
  "Yearly",
]);

export const getLocalDateStr = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const parseDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (date: Date) => getLocalDateStr(date);

const addMonthsClamped = (date: Date, months: number) => {
  const day = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const daysInTargetMonth = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(day, daysInTargetMonth));
  return next;
};

export const getNextRecurringDate = (
  date: string,
  frequency: string,
): string => {
  const current = parseDate(date);

  switch (frequency as RecurringFrequency) {
    case "Daily":
      current.setDate(current.getDate() + 1);
      return formatDate(current);
    case "Weekly":
      current.setDate(current.getDate() + 7);
      return formatDate(current);
    case "Monthly":
      return formatDate(addMonthsClamped(current, 1));
    case "Yearly":
      return formatDate(addMonthsClamped(current, 12));
    default:
      return date;
  }
};

export const processDueRecurringTransactions = async (userId: string) => {
  const today = getLocalDateStr();
  const recurringQuery = query(
    collection(db, "recurring_transactions"),
    where("userId", "==", userId),
    where("isActive", "==", true),
  );
  const snapshot = await getDocs(recurringQuery);
  let generatedCount = 0;

  await Promise.all(
    snapshot.docs.map(async (recurringDoc) => {
      const recurring = recurringDoc.data() as RecurringTransaction;
      const frequency = recurring.frequency || "Never";
      let dueDate = recurring.nextExecuteDate || recurring.startDate;

      if (
        !dueDate ||
        frequency === "Never" ||
        !SUPPORTED_FREQUENCIES.has(frequency) ||
        dueDate > today
      ) {
        return;
      }

      let nextExecuteDate = dueDate;
      let lastGeneratedDate = dueDate;
      let localGeneratedCount = 0;

      while (
        nextExecuteDate <= today &&
        localGeneratedCount < MAX_GENERATIONS_PER_RUN
      ) {
        const transactionId = `${recurringDoc.id}_${nextExecuteDate}`;
        await setDoc(
          doc(db, "transactions", transactionId),
          {
            userId,
            amount: Number(recurring.amount) || 0,
            category: recurring.category || "",
            categoryId: recurring.categoryId || null,
            categoryName: recurring.categoryName || recurring.category || "",
            categoryParentId: recurring.categoryParentId || null,
            categoryParentName:
              recurring.categoryParentName ||
              String(recurring.categoryName || recurring.category || "").split(" - ")[0],
            note: recurring.note || "",
            type: recurring.type || "Expense",
            recurring: frequency,
            recurringId: recurringDoc.id,
            recurringInstanceDate: nextExecuteDate,
            goalId: recurring.goalId || null,
            date: nextExecuteDate,
            entrySource: "recurring",
            source: "recurring",
            createdAt: new Date(),
          },
        );

        generatedCount += 1;
        localGeneratedCount += 1;
        lastGeneratedDate = nextExecuteDate;
        nextExecuteDate = getNextRecurringDate(nextExecuteDate, frequency);
      }

      await updateDoc(doc(db, "recurring_transactions", recurringDoc.id), {
        lastGeneratedDate,
        lastProcessedAt: new Date(),
        nextExecuteDate,
      });
    }),
  );

  return generatedCount;
};
