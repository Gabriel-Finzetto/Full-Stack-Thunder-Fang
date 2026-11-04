"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { ProductSlug } from "@/domain/catalog";
import styles from "./can-visual.module.css";

const FACE_COUNT = 48;
const RADIUS = 62;
const FACE_WIDTH = 2 * RADIUS * Math.tan(Math.PI / FACE_COUNT);
const TEXTURE_WIDTH = FACE_WIDTH * FACE_COUNT;
const FACES = Array.from({ length: FACE_COUNT }, (_, index) => index);

type CanVisualProps = { slug: ProductSlug; accent: string; compact?: boolean; rotateOnScroll?: boolean };

export function CanVisual({ slug, accent, compact = false, rotateOnScroll = false }: CanVisualProps) {
  const scene = useRef<HTMLDivElement>(null);
  const model = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rotateOnScroll) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!scene.current || !model.current) return;
      if (preference.matches) { model.current.style.transform = "rotateX(-6deg) rotateY(-90deg)"; return; }
      const bounds = scene.current.getBoundingClientRect();
      const viewport = window.innerHeight;
      const progress = Math.max(0, Math.min(1, (viewport * 0.78 - bounds.top) / (viewport * 0.88)));
      model.current.style.transform = `rotateX(-6deg) rotateY(${-90 + progress * 360}deg)`;
    };
    const requestUpdate = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    preference.addEventListener("change", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      preference.removeEventListener("change", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [rotateOnScroll]);

  return (
    <div ref={scene} className={`${styles.visual} ${compact ? styles.compact : ""}`} style={{ "--can-accent": accent } as CSSProperties} aria-hidden="true">
      <div className={styles.shadow} />
      <div className={styles.scale}>
        <div ref={model} className={styles.model} data-can-model={slug}>
          {FACES.map((index) => <div key={index} className={styles.face} style={{ width: `${FACE_WIDTH + 0.4}px`, marginLeft: `${-(FACE_WIDTH + 0.4) / 2}px`, transform: `rotateY(${index * 360 / FACE_COUNT}deg) translateZ(${RADIUS}px)`, backgroundImage: `url(/images/labels/${slug}.png)`, backgroundSize: `${TEXTURE_WIDTH}px 274px`, backgroundPosition: `${-index * FACE_WIDTH}px 0` }} />)}
          <div className={styles.lid}><span className={styles.lidRidge} /><span className={styles.opening} /><span className={styles.tab} /></div>
          <div className={styles.base} />
        </div>
        <div className={styles.shading} />
      </div>
    </div>
  );
}
