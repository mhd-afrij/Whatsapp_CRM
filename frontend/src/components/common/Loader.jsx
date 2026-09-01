export function Loader({ size = "md", className }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div className={className}>
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-border border-t-primary`}
      />
    </div>
  );
}
