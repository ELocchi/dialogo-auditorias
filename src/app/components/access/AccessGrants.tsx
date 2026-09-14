import { moduleLabels, profileLabels, type AccessProfile, type HistoricalGrant } from "@/lib/access/contracts";
import styles from "@/app/administracao/usuarios/access.module.css";

/** Historical fallback is for displaying pre-migration decisions only. */
export function AccessGrants({ grants, legacyProfile }: { grants: HistoricalGrant[]; legacyProfile?: AccessProfile }) {
  const profiles = [...new Set(grants.map((grant) => grant.perfil || legacyProfile))];
  return <div className={styles.grantGroups}>{profiles.map((profile) => {
    const selected = grants.filter((grant) => (grant.perfil || legacyProfile) === profile);
    const works = [...new Map(selected.map((grant) => [grant.obra_id, grant.obra_nome || grant.obra_id])).entries()];
    return <div key={profile || "unrecorded"} className={styles.grantGroup}>
      <h3>{profile ? profileLabels[profile] : "Perfil não registrado"} <span className={styles.scopeCount}>{works.length} {works.length === 1 ? "obra" : "obras"}</span></h3>
      <ul className={styles.grantList}>{works.map(([id, name]) => <li key={id}>
        <span>{name}</span>
        <span>{selected.filter((grant) => grant.obra_id === id).map((grant) => moduleLabels[grant.modulo]).join(" · ")}</span>
      </li>)}</ul>
    </div>;
  })}</div>;
}
