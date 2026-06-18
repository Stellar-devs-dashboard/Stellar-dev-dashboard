import { useCallback } from 'react';
import { useStore } from '../lib/store';
import { generateId, NOTIFICATION_DEFAULT_TIMEOUT, playSound } from '../lib/notifications';

type NotificationType =
  | 'success'
  | 'error'
  | 'info'
  | 'warning'
  | 'tx_confirm'
  | 'account_change'
  | 'network_event'
  | 'price_alert';

export const useNotifications = () => {
  const { notifications, addNotification, removeNotification, addNotificationHistory } = useStore();

  const notify = useCallback(
    (
      type: NotificationType,
      title: string,
      message: string,
      timeout: number = NOTIFICATION_DEFAULT_TIMEOUT,
      silent = false
    ) => {
      const id = generateId();

      const notification = {
        id,
        type,
        title,
        message,
        timeout,
        timestamp: Date.now(),
      };

      addNotification(notification);
      addNotificationHistory(notification);

      if (!silent) {
        playSound(type);
      }

      if (timeout !== 0) {
        setTimeout(() => {
          removeNotification(id);
        }, timeout);
      }

      return id;
    },
    [addNotification, removeNotification, addNotificationHistory]
  );

  const success = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('success', title, message, timeout, silent),
    [notify]
  );
  const error = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('error', title, message, timeout, silent),
    [notify]
  );
  const info = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('info', title, message, timeout, silent),
    [notify]
  );
  const warning = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('warning', title, message, timeout, silent),
    [notify]
  );
  const txConfirm = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('tx_confirm', title, message, timeout, silent),
    [notify]
  );
  const accountChange = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('account_change', title, message, timeout, silent),
    [notify]
  );
  const networkEvent = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('network_event', title, message, timeout, silent),
    [notify]
  );
  const priceAlert = useCallback(
    (title: string, message: string, timeout?: number, silent?: boolean) =>
      notify('price_alert', title, message, timeout, silent),
    [notify]
  );

  return {
    notifications,
    notify,
    success,
    error,
    info,
    warning,
    txConfirm,
    accountChange,
    networkEvent,
    priceAlert,
    remove: removeNotification,
  };
};

export default useNotifications;
