import React from 'react';

// Re-export shared UI primitives used across components

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={className}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}>(({ className, variant = 'default', size = 'default', ...props }, ref) => {
  const baseClass = 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  return (
    <button
      ref={ref}
      className={baseClass + ' ' + (className || '')}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-card text-card-foreground rounded-lg border shadow-sm ${className || ''}`}>
    {children}
  </div>
);
