import Image from "next/image";
import logo from "../../../public/logo-dialogo.png";
import styles from "./dialogo-logo.module.css";

export function DialogoLogo({ className = "" }: { className?: string }) {
  return <Image src={logo} alt="Diálogo Engenharia" className={`${styles.logo} ${className}`} loading="eager" unoptimized />;
}
