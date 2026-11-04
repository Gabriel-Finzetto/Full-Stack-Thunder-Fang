"use client";

import { useId, useState } from "react";
import { useLocale } from "@/i18n/locale-context";
import { MAX_QUANTITY } from "@/domain/commerce";
import styles from "./catalog.module.css";

export const MAX_SAFE_QUANTITY = MAX_QUANTITY;

export function QuantityPicker({ value, onChange, label, onValidityChange }: { value: number; onChange(value: number): void; label: string; onValidityChange?(valid: boolean): void }) {
  const { t } = useLocale();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const invalid = () => { setError("Informe uma quantidade inteira maior que zero. Se o valor for muito alto, escolha uma quantidade menor."); onValidityChange?.(false); };
  const set = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > MAX_SAFE_QUANTITY) {
      invalid();
      return;
    }
    setDraft(null); setError(""); onValidityChange?.(true); onChange(next);
  };
  return <div className={styles.quantityBlock}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.quantity}>
      <button type="button" disabled={value <= 1} onClick={() => set(value - 1)} aria-label={t("Diminuir quantidade")}>−</button>
      <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" value={draft ?? value} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { const text = event.target.value; setDraft(text); if (/^\d+$/.test(text)) set(Number(text)); else invalid(); }} onBlur={() => { if (draft !== null) { const parsed = Number(draft); if (draft.trim()) set(parsed); else invalid(); } }} />
      <button type="button" disabled={value >= MAX_SAFE_QUANTITY} onClick={() => set(value + 1)} aria-label={t("Aumentar quantidade")}>+</button>
    </div>
    <div className={styles.shortcuts} aria-label={t("Atalhos de quantidade")}>{[6, 12].map((quantity) => <button type="button" key={quantity} aria-pressed={value === quantity} onClick={() => set(quantity)}>{quantity}</button>)}</div>
    {error && <p id={`${id}-error`} role="alert" className={styles.error}>{t(error)}</p>}
  </div>;
}
