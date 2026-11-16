import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium transition-[background-color,border-color,color] duration-150 ease-out-custom select-none border border-transparent',
  {
    variants: {
      variant: {
        default: 'bg-ink text-ground',
        secondary: 'bg-ground-2 text-ink-2 border-line',
        outline: 'border-line text-ink-2 bg-surface',
        amber: 'bg-amber-tint text-amber-ink border-amber/30',
        violet: 'bg-violet-tint text-violet-ink border-violet/30',
        resolved: 'bg-resolved-tint text-resolved border-resolved/30',
        alert: 'bg-alert-tint text-alert border-alert/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
