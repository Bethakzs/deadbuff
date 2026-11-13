import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';

interface Props {
  content: ReactNode;
  children: ReactNode;
  placement?: Placement;
  /** wide = item/ability cards, default = small label */
  variant?: 'label' | 'card';
  className?: string;
}

/** Hover/focus tooltip rendered in a portal (never clipped by tables or overflow). */
export function Tooltip({ content, children, placement = 'top', variant = 'label', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const hover = useHover(context, { delay: { open: variant === 'card' ? 90 : 40, close: 40 }, move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <>
      <span ref={refs.setReference} className={`tt-anchor ${className}`} tabIndex={0} {...getReferenceProps()}>
        {children}
      </span>
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <div ref={refs.setFloating} style={floatingStyles} className="tt-layer" {...getFloatingProps()}>
              <motion.div
                className={`tt tt--${variant}`}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 3, scale: 0.98, transition: { duration: 0.08 } }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
