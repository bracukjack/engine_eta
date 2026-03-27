"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline" | "accent";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          "disabled:pointer-events-none disabled:opacity-40",
          // variants
          variant === "default" && "bg-white border border-edge text-primary hover:bg-slate-50 shadow-sm",
          variant === "ghost" && "text-muted hover:text-primary hover:bg-slate-100",
          variant === "outline" && "border border-edge text-primary hover:bg-slate-50 shadow-sm",
          variant === "accent" && "bg-accent text-white font-semibold hover:bg-accent-hover shadow-sm",
          // sizes
          size === "sm" && "h-7 px-2.5 text-xs rounded",
          size === "md" && "h-9 px-4 text-sm rounded-md",
          size === "lg" && "h-11 px-6 text-sm rounded-md",
          size === "icon" && "h-9 w-9 rounded-md",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
