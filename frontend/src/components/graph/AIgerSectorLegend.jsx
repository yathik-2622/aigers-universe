import React from 'react'
import styles from './AIgerGraph.module.css'

export default function AIgerSectorLegend({ legend = {}, counts = {}, onClick = () => {}, active = null }) {
  const keys = Object.keys(legend || {}).sort()
  return (
    <div className={styles.legend}>
      {keys.map((key) => {
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            className={`${styles.legendItem} ${isActive ? styles.legendItemActive : ''}`}
            onClick={() => onClick(isActive ? '' : key)}
          >
            <span className={styles.legendSwatch} style={{ background: legend[key] || '#888' }} />
            <span className={styles.legendLabel}>{key}</span>
            <span className={styles.legendCount}>{counts[key] || 0}</span>
          </button>
        )
      })}
    </div>
  )
}
