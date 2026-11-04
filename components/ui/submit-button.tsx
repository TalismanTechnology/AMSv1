"use client"

import * as React from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { LogoSpinner } from "@/components/logo-spinner"

type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type" | "asChild"> & {
  /** Leading icon, swapped for the spinner while the form submits. */
  icon?: React.ReactNode
  /** Label while pending (e.g. "Signing out…"); defaults to `children`. */
  pendingText?: React.ReactNode
}

/**
 * A submit button for a `<form action={serverAction}>`: spinner, disabled and
 * `pendingText` while the action runs, including any redirect it ends with.
 * Must render inside the form (it reads useFormStatus).
 */
function SubmitButton({
  icon,
  pendingText,
  children,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <LogoSpinner /> : icon}
      {pending ? (pendingText ?? children) : children}
    </Button>
  )
}

export { SubmitButton }
