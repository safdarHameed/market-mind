import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand brand-hover text-white shadow-[0_6px_16px_-8px_var(--grad-to)]",
        secondary: "bg-surface text-text border border-border hover:bg-surface-2 hover:border-border-strong",
        outline: "border border-border-strong text-text hover:bg-surface-2",
        ghost: "text-muted hover:text-text hover:bg-surface-2",
        danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
        link: "text-primary hover:underline underline-offset-4 px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export function ButtonLink({
  href,
  className,
  variant,
  size,
  children,
  external,
  ...rest
}: { href: string; external?: boolean; children: React.ReactNode; className?: string } & VariantProps<typeof buttonVariants> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}
