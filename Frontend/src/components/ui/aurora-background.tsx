import { type ReactNode } from "react";

interface AuroraBackgroundProps {
  children?: ReactNode;
  className?: string;
}

export function AuroraBackground({ children, className }: AuroraBackgroundProps) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <div className="aurora-wrapper pointer-events-none absolute inset-0">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>
      {children}
    </div>
  );
}
