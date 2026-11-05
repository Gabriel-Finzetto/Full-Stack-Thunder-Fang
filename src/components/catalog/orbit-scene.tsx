'use client';

import Image from 'next/image';
import { canArtwork } from '@/domain/product-artwork';
import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { products, type Product } from '@/domain/catalog';
import { CAN_MOTION_PREFERENCE_KEY, canMotionChoice, orbitMotionEnabled, type OrbitMotionChoice } from '@/domain/orbit';
import { useLocale } from '@/i18n/locale-context';
import type { CanStageController } from './can-webgl';
import { useCanMotion } from './use-can-motion';
import styles from './orbit-scene.module.css';

function CanSlot({ product }: { product: Product }) {
  return <div className={styles.canSlot} data-can-slot={product.slug}>
    <div className={styles.perspective}>
      <div className={styles.canFrame} data-orbit-can={product.slug} data-can-wobble={product.slug}>
        <Image className={styles.can} src={canArtwork(product.slug)} alt="" width={1024} height={1536} sizes="(max-width: 760px) 42vw, 240px" />
      </div>
    </div>
  </div>;
}

export function OrbitScene() {
  const { t } = useLocale();
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<CanStageController | null>(null);
  const visible = useRef(false);
  const [requested, setRequested] = useState(false);
  const [graphics, setGraphics] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const progress = useMotionValue(0);
  const [ready, setReady] = useState(false); const reducedMotion = useReducedMotion();
  const [shortViewport, setShortViewport] = useState(false);
  const [motionChoice, setMotionChoice] = useState<OrbitMotionChoice>('auto');
  const graphicsAllowed = ready && orbitMotionEnabled(Boolean(reducedMotion), shortViewport, motionChoice);
  const motionDisabled = graphics !== 'ready' || !graphicsAllowed;
  const inView = useInView(track, { margin: '80px 0px 80px 0px' });
  const nearView = useInView(track, { margin: '600px 0px 600px 0px', once: true });
  useCanMotion({ track, progress, disabled: motionDisabled });
  useMotionValueEvent(progress, 'change', latest => controller.current?.setProgress(latest));
  useEffect(() => {
    visible.current = inView;
    controller.current?.setVisible(inView);
  }, [inView]);
  useEffect(() => { if (nearView && graphicsAllowed) setRequested(true); }, [nearView, graphicsAllowed]);
  useEffect(() => {
    if (!requested || !graphicsAllowed) { setGraphics('idle'); return; }
    let cancelled = false;
    setGraphics('loading');
    void import('./can-webgl').then(({ createCanStage }) => {
      if (cancelled || !canvas.current || !stage.current) return;
      controller.current = createCanStage({
        canvas: canvas.current,
        frames: Array.from(stage.current.querySelectorAll<HTMLElement>('[data-orbit-can]')),
        products,
        onReady: () => { if (!cancelled) setGraphics('ready'); },
        onFailure: () => { if (!cancelled) setGraphics('fallback'); },
      });
      controller.current.setProgress(progress.get());
      controller.current.setVisible(visible.current);
    }).catch(() => { if (!cancelled) setGraphics('fallback'); });
    return () => { cancelled = true; controller.current?.dispose(); controller.current = null; };
  }, [requested, graphicsAllowed, progress]);
  useEffect(() => { const media = window.matchMedia('(max-height: 520px)'); const update = () => setShortViewport(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(CAN_MOTION_PREFERENCE_KEY); } catch { /* Storage can be unavailable in an embedded preview. */ }
    const choice = canMotionChoice(window.location.search, saved);
    setMotionChoice(choice);
    try {
      if (choice === 'animate') localStorage.setItem(CAN_MOTION_PREFERENCE_KEY, choice);
      else localStorage.removeItem(CAN_MOTION_PREFERENCE_KEY);
    } catch { /* The explicit URL still works without persistent storage. */ }
    setReady(true);
  }, []);
  const toggleMotion = () => {
    const choice = motionChoice === 'animate' ? 'auto' : 'animate';
    setMotionChoice(choice);
    try {
      if (choice === 'animate') localStorage.setItem(CAN_MOTION_PREFERENCE_KEY, choice);
      else localStorage.removeItem(CAN_MOTION_PREFERENCE_KEY);
    } catch { /* The control still works for this visit when storage is unavailable. */ }
    // Keep an explicit link from overriding a later choice after a reload.
    const url = new URL(window.location.href);
    if (url.searchParams.has('movimento')) {
      url.searchParams.set('movimento', choice === 'animate' ? 'latas' : 'sistema');
      window.history.replaceState(null, '', url);
    }
  };
  return <>
    {ready && reducedMotion && !shortViewport && graphics !== 'fallback' && <div className={styles.motionPreferences}>
      <p>{t('Seu dispositivo está configurado para reduzir movimento.')}</p>
      <button type="button" className="btn btn-secondary" aria-pressed={motionChoice === 'animate'} onClick={toggleMotion}>{t('Animar latas')}</button>
    </div>}
    <div ref={track} className={styles.journey} data-orbit-journey data-three-status={graphics} data-can-motion-choice={motionChoice} data-animated={ready && !motionDisabled ? 'true' : 'false'}>
      <div className={styles.sticky}>
        <div ref={stage} className={styles.stage} role="img" aria-label={`Thunder Fang Energy — ${products.map(product => t(product.name)).join(', ')}`}>
          <div className={styles.canGrid}>{products.map(product => <CanSlot key={product.slug} product={product} />)}</div>
          {/* A disposed stage loses its WebGL context, so each session needs a fresh canvas. */}
          <canvas key={graphicsAllowed ? 'animated' : 'static'} ref={canvas} className={styles.canvas} data-can-renderer="3d" aria-hidden="true" />
        </div>
      </div>
    </div>
  </>;
}
