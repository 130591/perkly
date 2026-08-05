import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'
type Size = 'default' | 'compact'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

/** `size="compact"` — for a button sitting inline next to text (e.g. a page header action next to the balance chip), where the default 48px form-CTA sizing reads as oversized. */
export function Button({ variant = 'primary', size = 'default', fullWidth, className, ...rest }: Props) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'compact' ? styles.compact : '',
    fullWidth ? styles.fullWidth : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button className={classes} {...rest} />
}
