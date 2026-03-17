import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm hover:from-indigo-500 hover:to-blue-500 hover:shadow-md hover:shadow-indigo-500/25 hover:-translate-y-px',
        destructive:
          'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-sm hover:from-rose-500 hover:to-red-500 hover:shadow-md hover:shadow-rose-500/25 hover:-translate-y-px',
        outline:
          'border-2 border-indigo-200 bg-background text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-800',
        secondary:
          'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-transparent',
        ghost:
          'hover:bg-indigo-50 hover:text-indigo-700 text-slate-600',
        link:
          'text-indigo-600 underline-offset-4 hover:underline hover:text-indigo-700',
        success:
          'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm hover:from-emerald-500 hover:to-green-500 hover:shadow-md hover:shadow-emerald-500/25 hover:-translate-y-px',
        warning:
          'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:from-amber-400 hover:to-orange-400 hover:shadow-md hover:shadow-amber-500/25 hover:-translate-y-px',
        gradient:
          'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 bg-size-200 text-white shadow-md hover:shadow-lg hover:shadow-purple-500/30 hover:-translate-y-px hover:opacity-90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-11 rounded-lg px-8',
        icon:    'h-10 w-10',
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
