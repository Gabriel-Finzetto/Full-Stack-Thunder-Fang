"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styles from "./flag-select.module.css";

export type FlagSelectOption = {
  value: string;
  label: string;
  flag: "BR" | "US" | "ES" | "CN";
};

type FlagSelectProps = {
  id?: string;
  label: string;
  value: string;
  options: readonly FlagSelectOption[];
  onChange(value: string): void;
  compact?: boolean;
};

const searchable = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

export function FlagSelect({ id, label, value, options, onChange, compact = false }: FlagSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `flag-select-${generatedId}`;
  const listId = `${controlId}-options`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex];
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [placement, setPlacement] = useState({ up: false, maxHeight: 272 });

  const show = (index = selectedIndex) => {
    setActiveIndex(index);
    typeahead.current = { text: "", at: 0 };
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - 16;
      const above = bounds.top - 16;
      const desired = Math.min(menu.current?.scrollHeight ?? 272, 272);
      const up = below < desired && above > below;
      setPlacement({ up, maxHeight: Math.max(44, Math.min(272, up ? above : below)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!options.length) return;
    if (event.key === "Tab") {
      if (open) choose(activeIndex);
      return;
    }
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex); else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : open ? Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === "ArrowDown" ? 1 : -1))) : selectedIndex;
      if (open) setActiveIndex(next); else show(next);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - typeahead.current.at < 700 ? typeahead.current.text : "";
      const typed = searchable(event.key);
      const text = previous === typed ? typed : previous + typed;
      typeahead.current = { text, at: now };
      const start = (open ? activeIndex : selectedIndex) + (text.length === 1 ? 1 : 0);
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (searchable(options[index].label).startsWith(text)) {
          setActiveIndex(index);
          setOpen(true);
          break;
        }
      }
    }
  };

  return <div ref={root} className={`${styles.root}${compact ? ` ${styles.compact}` : ""}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} id={controlId} type="button" role="combobox" className={styles.trigger}
      aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      disabled={!options.length} onKeyDown={onKeyDown} onClick={() => open ? setOpen(false) : show()}>
      {selected && <><img className={styles.flag} src={`/images/flags/${selected.flag.toLowerCase()}.svg`} alt="" width={24} height={16} /><span className={styles.value}>{selected.label}</span></>}
      <svg className={styles.chevron} width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    {open && <ul ref={menu} id={listId} role="listbox" aria-label={label} className={styles.menu} data-up={placement.up} style={{ maxHeight: placement.maxHeight }}>
      {options.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
        className={styles.option} data-active={index === activeIndex}
        onPointerMove={() => setActiveIndex(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <img className={styles.flag} src={`/images/flags/${option.flag.toLowerCase()}.svg`} alt="" width={24} height={16} />
        <span>{option.label}</span>
        <span className={styles.check} aria-hidden="true">{option.value === value ? "✓" : ""}</span>
      </li>)}
    </ul>}
  </div>;
}
