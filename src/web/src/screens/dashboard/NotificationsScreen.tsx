import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { List } from '../../components/base/List';
import { Toast } from '../../components/base/Toast';
import { useAnalytics } from '../../hooks/useAnalytics';
import { theme } from '../../config/theme';

// Types
interface Notification {
  id: string;
  type: 'injury' | 'trade' | 'lineup' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  actionUrl: string | null;
  metadata: Record<string, unknown>;
}

interface NotificationState {
  items: Notification[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
}

// Styled Components
const NotificationsContainer = styled.div`
  padding: ${theme.spacing.lg};
  height: 100%;
  overflow-y: auto;
  background-color: ${theme.colors.background};
  position: relative;
`;

const NotificationHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: ${theme.zIndex.header};
  background-color: ${theme.colors.background};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${theme.colors.text.secondary};
  text-align: center;
`;

const NotificationItem = styled.div<{ priority: string; read: boolean }>`
  padding: ${theme.spacing.md};
  border-left: 4px solid ${props => 
    props.priority === 'high' ? theme.colors.status.error :
    props.priority === 'medium' ? theme.colors.status.warning :
    theme.colors.status.info
  };
  opacity: ${props => props.read ? 0.7 : 1};
  background-color: ${props => props.read ? theme.colors.surface : theme.colors.background};
`;

const NotificationTitle = styled.h3`
  margin: 0 0 ${theme.spacing.xs} 0;
  font-size: ${theme.typography.fontSize.md};
  font-weight: ${theme.typography.fontWeight.semibold};
`;

const NotificationMessage = styled.p`
  margin: 0;
  color: ${theme.colors.text.secondary};
  font-size: ${theme.typography.fontSize.sm};
`;

const NotificationTimestamp = styled.span`
  font-size: ${theme.typography.fontSize.xs};
  color: ${theme.colors.text.disabled};
`;

const NotificationBadge = styled.div`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 12px;
  font-size: ${theme.typography.fontSize.xs};
  font-weight: ${theme.typography.fontWeight.medium};
  background-color: ${theme.colors.accent};
  color: ${theme.colors.background};
`;

export const NotificationsScreen: React.FC = () => {
  const [state, setState] = useState<NotificationState>({
    items: [],
    loading: true,
    error: null,
    hasMore: true
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { trackScreenView, trackEvent } = useAnalytics();

  // Track screen view on mount
  useEffect(() => {
    trackScreenView('notifications', {
      total_notifications: state.items.length,
      unread_count: state.items.filter(n => !n.read).length
    });
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:8080');

    ws.onmessage = (event) => {
      const notification: Notification = JSON.parse(event.data);
      setState(prev => ({
        ...prev,
        items: [notification, ...prev.items]
      }));
      
      if (notification.priority === 'high') {
        setToastMessage(notification.title);
        setShowToast(true);
      }

      trackEvent('notification_received', {
        notification_type: notification.type,
        priority: notification.priority
      });
    };

    return () => ws.close();
  }, []);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    try {
      if (!notification.read) {
        // Update read status in backend
        await fetch(`/api/notifications/${notification.id}/read`, {
          method: 'PUT'
        });

        setState(prev => ({
          ...prev,
          items: prev.items.map(item => 
            item.id === notification.id ? { ...item, read: true } : item
          )
        }));

        trackEvent('notification_read', {
          notification_id: notification.id,
          notification_type: notification.type
        });
      }

      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      }
    } catch (error) {
      setToastMessage('Failed to mark notification as read');
      setShowToast(true);
      trackEvent('notification_error', {
        error_type: 'read_status_update',
        notification_id: notification.id
      });
    }
  }, []);

  const sortedNotifications = useMemo(() => {
    return [...state.items].sort((a, b) => {
      // Sort by priority first
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by read status
      if (a.read !== b.read) return a.read ? 1 : -1;

      // Finally by timestamp
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [state.items]);

  const renderNotification = useCallback((notification: Notification, index: number) => (
    <NotificationItem
      priority={notification.priority}
      read={notification.read}
      onClick={() => handleNotificationClick(notification)}
      role="listitem"
      aria-label={`${notification.title} - ${notification.read ? 'Read' : 'Unread'}`}
    >
      <NotificationTitle>{notification.title}</NotificationTitle>
      <NotificationMessage>{notification.message}</NotificationMessage>
      <NotificationTimestamp>
        {new Date(notification.timestamp).toLocaleString()}
      </NotificationTimestamp>
      {!notification.read && (
        <NotificationBadge>New</NotificationBadge>
      )}
    </NotificationItem>
  ), [handleNotificationClick]);

  if (state.error) {
    return (
      <EmptyState>
        <h2>Error loading notifications</h2>
        <p>{state.error.message}</p>
      </EmptyState>
    );
  }

  return (
    <NotificationsContainer>
      <NotificationHeader>
        <h1>Notifications</h1>
        {state.items.some(n => !n.read) && (
          <NotificationBadge>
            {state.items.filter(n => !n.read).length} New
          </NotificationBadge>
        )}
      </NotificationHeader>

      <List
        items={sortedNotifications}
        renderItem={renderNotification}
        loading={state.loading}
        emptyMessage="No notifications to display"
        virtualized
        itemHeight={100}
        ariaLabel="Notifications list"
        role="list"
      />

      {showToast && (
        <Toast
          message={toastMessage}
          type="info"
          duration={5000}
          onClose={() => setShowToast(false)}
          position="top-right"
        />
      )}
    </NotificationsContainer>
  );
};

export default NotificationsScreen;