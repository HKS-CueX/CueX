import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-ink text-ground hover:bg-ink-hover shadow-sm',
        quiet: 'border border-line-strong bg-surface text-ink hover:bg-ground-2',
        ghost: 'hover:bg-ground-2 text-ink',
        link: 'text-ink underline-offset-4 hover:underline p-0 h-auto',
        amber: 'bg-amber text-white hover:bg-amber-ink shadow-sm',
        violet: 'bg-violet text-white hover:bg-violet-ink shadow-sm',
        resolved: 'bg-resolved text-white hover:opacity-90 shadow-sm',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm rounded',
        sm: 'h-8 px-3 text-xs rounded',
        lg: 'h-11 px-6 text-base rounded',
        icon: 'h-9 w-9 rounded',
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
