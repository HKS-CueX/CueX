import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'cuex-btn inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 select-none active:scale-[0.97]',
  {
    variants: {
      variant: {
        default: 'bg-ink text-ground hover:bg-ink-hover',
        quiet: 'border border-line-strong bg-surface text-ink hover:bg-ground-2',
        ghost: 'text-ink hover:bg-ground-2',
        link: 'text-ink underline-offset-4 hover:underline p-0 h-auto',
        amber: 'bg-amber-ink text-white hover:opacity-90',
        violet: 'bg-violet text-white hover:bg-violet-ink',
        resolved: 'bg-resolved text-white hover:opacity-90',
        alert: 'border border-alert/40 bg-surface text-alert hover:bg-alert-tint',
      },
      size: {
        default: 'h-9 min-h-[40px] sm:min-h-0 px-4 py-2 text-sm rounded',
        sm: 'h-8 min-h-[36px] sm:min-h-0 px-3 text-xs rounded',
        lg: 'h-11 px-5 py-2.5 text-sm sm:text-base rounded',
        icon: 'h-9 w-9 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 rounded',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
