import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { palette, radius, shadow, spacing } from "../constants/ui";

type DialogType = "confirm" | "error" | "info" | "success" | "warning";

type DialogAction = {
  label: string;
  onPress?: () => void;
  style?: "cancel" | "default" | "destructive";
};

type DialogOptions = {
  actions?: DialogAction[];
  message: string;
  onCancel?: () => void;
  title: string;
  type?: DialogType;
};

type DialogContextValue = {
  showConfirm: (options: {
    cancelLabel?: string;
    confirmLabel?: string;
    message: string;
    title: string;
    type?: DialogType;
  }) => Promise<boolean>;
  showDialog: (options: DialogOptions) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const dialogMeta: Record<
  DialogType,
  { color: string; icon: keyof typeof Ionicons.glyphMap; softColor: string }
> = {
  confirm: {
    color: palette.primary,
    icon: "help-circle",
    softColor: palette.primarySoft,
  },
  error: {
    color: palette.danger,
    icon: "alert-circle",
    softColor: palette.dangerSoft,
  },
  info: {
    color: palette.primary,
    icon: "information-circle",
    softColor: palette.primarySoft,
  },
  success: {
    color: palette.success,
    icon: "checkmark-circle",
    softColor: palette.successSoft,
  },
  warning: {
    color: palette.warning,
    icon: "warning",
    softColor: palette.warningSoft,
  },
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);

  const closeDialog = useCallback((runCancel = true) => {
    setDialog((current) => {
      if (runCancel) {
        current?.onCancel?.();
      }
      return null;
    });
  }, []);

  const showDialog = useCallback((options: DialogOptions) => {
    setDialog({
      ...options,
      actions: options.actions || [{ label: "OK" }],
      type: options.type || "info",
    });
  }, []);

  const showConfirm = useCallback(
    ({
      cancelLabel = "Cancel",
      confirmLabel = "Confirm",
      message,
      title,
      type = "confirm",
    }: {
      cancelLabel?: string;
      confirmLabel?: string;
      message: string;
      title: string;
      type?: DialogType;
    }) =>
      new Promise<boolean>((resolve) => {
        setDialog({
          title,
          message,
          type,
          onCancel: () => resolve(false),
          actions: [
            {
              label: cancelLabel,
              onPress: () => resolve(false),
              style: "cancel",
            },
            {
              label: confirmLabel,
              onPress: () => resolve(true),
              style: type === "error" ? "destructive" : "default",
            },
          ],
        });
      }),
    [],
  );

  const value = useMemo(
    () => ({ showConfirm, showDialog }),
    [showConfirm, showDialog],
  );

  const type = dialog?.type || "info";
  const meta = dialogMeta[type];

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(dialog)}
        onRequestClose={() => closeDialog()}
      >
        <Pressable style={styles.overlay} onPress={() => closeDialog()}>
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.iconWrap, { backgroundColor: meta.softColor }]}>
              <Ionicons name={meta.icon} size={34} color={meta.color} />
            </View>
            <Text style={styles.title}>{dialog?.title}</Text>
            <Text style={styles.message}>{dialog?.message}</Text>
            <View style={styles.actions}>
              {(dialog?.actions || []).map((action) => {
                const isCancel = action.style === "cancel";
                const isDestructive = action.style === "destructive";
                return (
                  <TouchableOpacity
                    key={action.label}
                    style={[
                      styles.button,
                      isCancel ? styles.secondaryButton : styles.primaryButton,
                      isDestructive && styles.destructiveButton,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      closeDialog(false);
                      action.onPress?.();
                    }}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isCancel ? styles.secondaryButtonText : styles.primaryButtonText,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used inside AppDialogProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 41, 51, 0.45)",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...shadow.card,
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    marginBottom: spacing.lg,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    color: palette.textMuted,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
    marginBottom: spacing.xl,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  primaryButton: {
    backgroundColor: palette.primary,
  },
  secondaryButton: {
    backgroundColor: palette.surfaceMuted,
  },
  destructiveButton: {
    backgroundColor: palette.danger,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "900",
  },
  primaryButtonText: {
    color: palette.surface,
  },
  secondaryButtonText: {
    color: palette.textMuted,
  },
});
