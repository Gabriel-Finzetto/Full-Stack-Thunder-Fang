'use client';

import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Exiting controls leave the tab order as soon as their selection is removed. */
export function SelectionPresence({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.div inert={!present} aria-hidden={!present || undefined}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : .16 }}>{children}</motion.div>;
}

export function SelectionRow({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.li layout={reduced ? false : 'position'} inert={!present} aria-hidden={!present || undefined}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? 0 : .16 }}>{children}</motion.li>;
}
