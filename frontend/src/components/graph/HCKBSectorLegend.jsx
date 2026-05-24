import React from "react";
import styles from "./AigersKGComponents.module.css";

export default function HCKBSectorLegend({ legend = {}, counts = {}, onClick = () => {}, active = null }) {
  const safe = legend || {};
  const keys = Object.keys(safe).sort();
  return (
    <div className={styles.HCKB_legend}>
      {keys.map((key) => {
        const color = safe[key] || "#888";
        const count = counts && counts[key] ? counts[key] : 0;
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            className={`${styles.HCKB_legendItem} ${isActive ? styles.HCKB_active : ""}`}
            onClick={() => onClick(isActive ? "" : key)}
          >
            <span className={styles.HCKB_swatch} style={{ background: color }} />
            <span className={styles.HCKB_label}>{key}</span>
            <span className={styles.HCKB_count}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
