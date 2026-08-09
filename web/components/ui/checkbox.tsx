import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, Minus } from "lucide-react"

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange'> {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)
    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = checked === 'indeterminate'
      }
    }, [checked])
    const isChecked = checked === true
    const isIndeterminate = checked === 'indeterminate'
    return (
      <label className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center cursor-pointer transition-colors select-none",
        (isChecked || isIndeterminate) && "bg-primary text-primary-foreground border-primary",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}>
        <input
          type="checkbox"
          ref={innerRef}
          checked={isChecked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="sr-only"
          {...props}
        />
        {isChecked && <Check className="h-3 w-3 text-white shrink-0" />}
        {isIndeterminate && <Minus className="h-3 w-3 text-white shrink-0" strokeWidth={3} />}
      </label>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
