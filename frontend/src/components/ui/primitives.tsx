import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted border border-border",
        primary: "bg-primary-soft text-primary",
        accent: "bg-accent-soft text-accent",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-subtle transition-colors hover:border-border-strong focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/15";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(inputClass, "py-2.5 resize-none", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center", className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-6">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "warning",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: "warning" | "danger" | "primary" | "accent" | "success";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    warning: "border-warning/30 bg-warning-soft [&_.al-icon]:text-warning",
    danger: "border-danger/30 bg-danger-soft [&_.al-icon]:text-danger",
    primary: "border-primary/30 bg-primary-soft [&_.al-icon]:text-primary",
    accent: "border-accent/30 bg-accent-soft [&_.al-icon]:text-accent",
    success: "border-success/30 bg-success-soft [&_.al-icon]:text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {icon && <div className="al-icon mt-0.5 shrink-0 [&_svg]:size-4">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-text">{title}</div>}
        {children && <div className="mt-0.5 text-muted">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
