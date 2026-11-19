import React from 'react';

export type ActionButtonVariant =
  | 'primary'
  | 'secondary'
  | 'view'
  | 'edit'
  | 'delete'
  | 'print'
  | 'pdf'
  | 'excel'
  | 'amber'
  | 'ghost';

export type ActionButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  /** Stops click event bubbling to parent table rows (defaults to true) */
  stopPropagation?: boolean;
  /** Optional leading icon */
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  primary:
    'bg-[#0A1628] hover:bg-[#13294B] text-white border border-[#D4AF37]/60 shadow-2xs',
  secondary:
    'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs',
  view:
    'bg-teal-600 hover:bg-teal-700 text-white border border-teal-500/60 shadow-2xs',
  edit:
    'bg-[#0A1628] hover:bg-[#13294B] text-white border border-[#D4AF37]/60 shadow-2xs',
  delete:
    'bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs',
  print:
    'bg-slate-700 hover:bg-slate-800 text-white border border-slate-600 shadow-2xs',
  pdf:
    'bg-rose-700 hover:bg-rose-800 text-white border border-rose-600 shadow-2xs',
  excel:
    'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-600 shadow-2xs',
  amber:
    'bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-400 shadow-2xs',
  ghost:
    'bg-transparent hover:bg-slate-100 text-slate-700 border border-transparent',
};

const SIZE_CLASSES: Record<ActionButtonSize, string> = {
  xs: 'px-2 py-1 text-[11px] rounded-lg gap-1',
  sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-3.5 py-2 text-xs rounded-xl gap-1.5',
};

/**
 * Shared Button component for all table actions & form controls.
 * - Defaults to `type="button"` to prevent accidental form submission/page reload.
 * - Automatically calls `e.stopPropagation()` on click (unless disabled) to prevent bubbling into parent table rows.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'xs',
  stopPropagation = true,
  type = 'button',
  icon,
  onClick,
  className = '',
  children,
  ...rest
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    if (type === 'button') {
      e.preventDefault();
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      className={`inline-flex items-center justify-center font-black whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0 inline-flex items-center">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;
