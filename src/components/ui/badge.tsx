import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm hover:shadow-indigo-400/30',
        secondary:
          'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200',
        destructive:
          'border-transparent bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm',
        outline:
          'border-indigo-300 text-indigo-700 bg-indigo-50',
        success:
          'border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
        warning:
          'border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200',
        info:
          'border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-200',
        error:
          'border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-200',
        purple:
          'border-purple-200 bg-purple-100 text-purple-800 hover:bg-purple-200',
        cyan:
          'border-cyan-200 bg-cyan-100 text-cyan-800 hover:bg-cyan-200',
        orange:
          'border-orange-200 bg-orange-100 text-orange-800 hover:bg-orange-200',
        pink:
          'border-pink-200 bg-pink-100 text-pink-800 hover:bg-pink-200',
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
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
