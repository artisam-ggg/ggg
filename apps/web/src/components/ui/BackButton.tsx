"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BackButtonProps {
  children?: React.ReactNode;
  "aria-label"?: string;
  className?: string;
  href?: string;
}

export function BackButton({
  children = "Back",
  "aria-label": ariaLabel,
  className,
  href,
}: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => (href ? router.push(href) : router.back())}
      aria-label={ariaLabel}
      className={cn("text-on-surface-variant hover:text-on-surface", className)}
    >
      <ArrowLeft />
      {children}
    </Button>
  );
}
