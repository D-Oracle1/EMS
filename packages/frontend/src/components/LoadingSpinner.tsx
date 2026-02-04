import clsx from 'clsx';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export default function LoadingSpinner({ size = 'md', fullScreen = false }: Props) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };

  const spinner = (
    <div
      className={clsx(
        'animate-spin rounded-full border-primary-600 border-t-transparent',
        sizeClasses[size]
      )}
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        {spinner}
      </div>
    );
  }

  return spinner;
}
