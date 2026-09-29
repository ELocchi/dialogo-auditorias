import { AdminNotifications, type AdminNotification } from "./auth/AdminNotifications";
import { AuthHeader } from "./auth/AuthHeader";
import { UserMenu } from "./auth/UserMenu";
import styles from "./administrative-header.module.css";
import { administrativeLabels, type AdministrativeScope } from "@/lib/access/contracts";
import { platformDisplayName } from "@/lib/auth/display-name";

export function AdministrativeHeader({ name, email, userId, scope, profileLabel, notifications, notificationsLoading, notificationsError, onNotificationsOpenChange, onNavigateAgenda }: {
  name: string;
  email?: string | null;
  userId: string;
  scope?: AdministrativeScope | null;
  profileLabel?: string;
  notifications?: readonly AdminNotification[];
  notificationsLoading?: boolean;
  notificationsError?: string;
  onNotificationsOpenChange?: (open: boolean) => void;
  onNavigateAgenda?: (item: AdminNotification) => void;
}) {
  const accessLabel = (profileLabel ?? (scope ? administrativeLabels[scope] : "Administração")).toLocaleUpperCase("pt-BR");
  return <AuthHeader className="site-header" context={<span className={styles.accessType}>{accessLabel}</span>}>
    <div className={styles.accountControls}>
      <AdminNotifications items={notifications} userId={userId} loading={notificationsLoading} error={notificationsError} onOpenChange={onNotificationsOpenChange} onNavigateAgenda={onNavigateAgenda} />
      <UserMenu name={platformDisplayName(email, name)} />
    </div>
  </AuthHeader>;
}
