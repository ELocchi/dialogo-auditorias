import { DialogoLogo } from "./dialogo-logo";
import { AdminNotifications, type AdminNotification } from "./auth/AdminNotifications";
import { UserMenu } from "./auth/UserMenu";
import styles from "./administrative-header.module.css";

export function AdministrativeHeader({ name, notifications, onNavigateAgenda }: {
  name: string;
  notifications?: readonly AdminNotification[];
  onNavigateAgenda?: (item: AdminNotification) => void;
}) {
  return <header className="site-header">
    <div className="header-inner">
      <div className={`header-main ${styles.headerMain}`}>
        <div className="brand"><DialogoLogo /></div>
        <div className="header-title">
          <h1>Auditorias de obra</h1>
          <p>Gestão de segurança e qualidade</p>
          <span className="context-pill">ADMINISTRAÇÃO</span>
        </div>
        <div className={styles.session}>
          <div className={styles.accountControls}>
            <AdminNotifications items={notifications} onNavigateAgenda={onNavigateAgenda} />
            <UserMenu name={name} />
          </div>
        </div>
      </div>
    </div>
  </header>;
}
