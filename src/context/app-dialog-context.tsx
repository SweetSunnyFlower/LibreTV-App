import { useThemeName } from '@/hooks/use-theme';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type AppDialogButtonStyle = 'default' | 'cancel' | 'destructive';

type AppDialogButton = {
  text: string;
  style?: AppDialogButtonStyle;
  onPress?: () => void | Promise<void>;
  closeOnPress?: boolean;
};

type ShowDialogOptions = {
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
  cancelable?: boolean;
};

type ConfirmDialogOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  cancelable?: boolean;
  onConfirm?: () => void | Promise<void>;
};

type DialogRequest = {
  options: ShowDialogOptions;
  resolve: (value?: string) => void;
};

type AppDialogContextValue = {
  showDialog: (options: ShowDialogOptions) => Promise<string | undefined>;
  alert: (title: string, message?: string) => Promise<void>;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function defaultButtons(buttons?: AppDialogButton[]) {
  return buttons && buttons.length > 0 ? buttons : [{ text: '确定' }];
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const isDark = useThemeName() === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const currentRef = useRef<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);
  const closingRef = useRef(false);

  const showNext = useCallback(() => {
    closingRef.current = false;
    const next = queueRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const showDialog = useCallback((options: ShowDialogOptions) => {
    return new Promise<string | undefined>((resolve) => {
      const request = { options, resolve };
      if (currentRef.current || closingRef.current) {
        queueRef.current.push(request);
        return;
      }
      currentRef.current = request;
      setCurrent(request);
    });
  }, []);

  const closeDialog = useCallback((button?: AppDialogButton) => {
    const request = currentRef.current;
    if (!request) return;

    const shouldClose = button?.closeOnPress !== false;

    if (shouldClose) {
      closingRef.current = true;
      currentRef.current = null;
      setCurrent(null);
      request.resolve(button?.text);
    }

    setTimeout(() => {
      if (button?.onPress) {
        Promise.resolve(button.onPress()).catch((error) => {
          console.error('[AppDialog] Button action failed:', error);
        });
      }
      if (shouldClose) {
        showNext();
      }
    }, 0);
  }, [showNext]);

  const dismissDialog = useCallback(() => {
    const request = currentRef.current;
    if (!request || request.options.cancelable === false) return;
    closeDialog();
  }, [closeDialog]);

  const alert = useCallback(async (title: string, message?: string) => {
    await showDialog({
      title,
      message,
      buttons: [{ text: '确定' }],
    });
  }, [showDialog]);

  const confirm = useCallback(async ({
    title,
    message,
    confirmText = '确定',
    cancelText = '取消',
    destructive = false,
    cancelable = true,
    onConfirm,
  }: ConfirmDialogOptions) => {
    const selected = await showDialog({
      title,
      message,
      cancelable,
      buttons: [
        { text: cancelText, style: 'cancel' },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
      ],
    });
    return selected === confirmText;
  }, [showDialog]);

  const value = useMemo(() => ({ showDialog, alert, confirm }), [alert, confirm, showDialog]);
  const options = current?.options;
  const buttons = defaultButtons(options?.buttons);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Modal transparent visible={!!options} animationType="fade" statusBarTranslucent onRequestClose={dismissDialog}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={dismissDialog} />
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {options ? (
              <>
                <Text style={[styles.title, { color: palette.text }]}>{options.title}</Text>
                {options.message ? <Text style={[styles.message, { color: palette.secondaryText }]}>{options.message}</Text> : null}
                <View style={[styles.buttonStack, { borderTopColor: palette.border }]}>
                  {buttons.map((button, index) => {
                    const isDestructive = button.style === 'destructive';
                    const isCancel = button.style === 'cancel';
                    return (
                      <Pressable
                        key={`${button.text}-${button.style ?? 'default'}`}
                        style={({ pressed }) => [
                          styles.button,
                          index < buttons.length - 1 && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth },
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={() => closeDialog(button)}>
                        <Text
                          style={[
                            styles.buttonText,
                            {
                              color: isDestructive ? palette.destructive : isCancel ? palette.secondaryText : palette.text,
                            },
                          ]}>
                          {button.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }
  return context;
}

const lightPalette = {
  card: '#FFFFFF',
  text: '#111111',
  secondaryText: '#737373',
  border: '#E8E8E6',
  destructive: '#9A2F2F',
};

const darkPalette = {
  card: '#171717',
  text: '#FAFAFA',
  secondaryText: '#A3A3A3',
  border: '#2A2A2A',
  destructive: '#E06B6B',
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
  title: {
    paddingHorizontal: 24,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 10,
    paddingHorizontal: 24,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonStack: {
    marginTop: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.62,
  },
});
