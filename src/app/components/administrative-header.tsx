import { DialogoLogo } from "./dialogo-logo";
import { AdminNotifications, type AdminNotification } from "./auth/AdminNotifications";
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
  return <header className="site-header">
    <div className="header-inner">
      <div className={`header-main ${styles.headerMain}`}>
        <div className="brand"><DialogoLogo /></div>
        <div className="header-title">
          <h1>Auditorias de obra</h1>
          <p>Gestão de segurança e qualidade</p>
          <span className="context-pill">{(profileLabel ?? (scope ? administrativeLabels[scope] : "Administração")).toLocaleUpperCase("pt-BR")}</span>
        </div>
        <div className={styles.session}>
          <div className={styles.accountControls}>
            <AdminNotifications items={notifications} userId={userId} loading={notificationsLoading} error={notificationsError} onOpenChange={onNotificationsOpenChange} onNavigateAgenda={onNavigateAgenda} />
            <UserMenu name={platformDisplayName(email, name)} />
          </div>
        </div>
      </div>
    </div>
  </header>;
}
