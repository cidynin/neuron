import type { ReactNode } from 'react';

interface SmoothCollapseProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Smooth, layout-jitter-free CSS Grid collapse container.
 * Put vertical spacing (padding/margin) inside children so closed height is 0px.
 */
export function SmoothCollapse({
  open,
  children,
  className = '',
}: SmoothCollapseProps) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open
          ? 'grid-rows-[1fr] opacity-100'
          : 'pointer-events-none grid-rows-[0fr] opacity-0'
      } ${className}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
