import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent-fill text-on-accent hover:brightness-110 shadow-theme',
  secondary: 'bg-surface text-fg hover:bg-surface-hover border border-line',
  ghost: 'bg-transparent text-fg hover:bg-surface-hover',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  outline: 'bg-transparent text-fg border border-line hover:bg-surface-hover',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'plain' | 'filled';
}

const ICON_SIZE = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12', xl: 'h-14 w-14' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = 'md', tone = 'plain', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40',
        ICON_SIZE[size],
        tone === 'filled'
          ? 'bg-fg text-bg hover:scale-105'
          : active
            ? 'text-accent-text hover:bg-surface-hover'
            : 'text-muted hover:bg-surface-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Screen-reader value text, e.g. "8 decibels". */
  valueText?: (v: number) => string;
  /** Visible value next to the label. */
  display?: (v: number) => string;
  disabled?: boolean;
  disabledReason?: string;
  vertical?: boolean;
  hideLabel?: boolean;
  className?: string;
  /** Value restored by double-click. */
  resetTo?: number;
  testId?: string;
}

/** Native range input: keyboard (arrows/PageUp/Home/End), touch and screen readers for free. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  valueText,
  display,
  disabled,
  disabledReason,
  vertical,
  hideLabel,
  className,
  resetTo,
  testId,
}: SliderProps) {
  const id = useId();
  const fill = `${((value - min) / (max - min)) * 100}%`;
  const text = valueText?.(value) ?? String(value);
  const input = (
    <input
      id={id}
      type="range"
      className={cn('ts-range', vertical && 'vertical')}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-valuetext={`${label} ${text}`}
      aria-describedby={disabled && disabledReason ? `${id}-why` : undefined}
      style={{ ['--fill' as string]: fill }}
      data-testid={testId}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
      onDoubleClick={() => resetTo !== undefined && !disabled && onChange(resetTo)}
    />
  );
  return (
    <div
      className={cn(
        vertical ? 'flex flex-col items-center gap-1' : 'flex flex-col gap-1',
        className,
      )}
      title={disabled ? disabledReason : undefined}
    >
      {!hideLabel && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <label htmlFor={id} className={cn('font-medium text-muted', vertical && 'sr-only')}>
            {label}
          </label>
          {display && <span className="tabular-nums text-fg">{display(value)}</span>}
        </div>
      )}
      {hideLabel && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      {input}
      {vertical && display && (
        <span className="text-[11px] tabular-nums text-muted">{display(value)}</span>
      )}
      {disabled && disabledReason && (
        <span id={`${id}-why`} className="sr-only">
          {disabledReason}
        </span>
      )}
    </div>
  );
}

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: string;
  hideLabel?: boolean;
  testId?: string;
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
  description,
  hideLabel,
  testId,
}: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className={cn('min-w-0', hideLabel && 'sr-only')}>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <RSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        data-testid={testId}
        className="relative h-6 w-11 shrink-0 rounded-full bg-surface-hover transition data-[state=checked]:bg-accent-fill disabled:opacity-40"
      >
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
      </RSwitch.Root>
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-full bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full font-medium transition disabled:opacity-40',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-accent-fill text-on-accent' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={350}>{children}</RTooltip.Provider>;
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          className="z-[80] max-w-xs rounded-ctl border border-line bg-bg-elevated px-3 py-2 text-xs text-fg shadow-theme"
        >
          {content}
          <RTooltip.Arrow className="fill-[var(--bg-elevated)]" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'warn' | 'ok';
  className?: string;
}) {
  const tones = {
    muted: 'bg-surface-hover text-muted',
    accent: 'bg-accent-soft text-accent-text',
    warn: 'bg-amber-500/15 text-amber-300',
    ok: 'bg-emerald-500/15 text-emerald-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface pad-d', className)}>
      {children}
    </div>
  );
}
