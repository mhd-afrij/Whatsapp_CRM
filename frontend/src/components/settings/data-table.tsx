"use client";

import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  className?: string;
  rowClassName?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading = false,
  empty,
  className,
  rowClassName,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-border bg-surface overflow-hidden", className)}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key as string} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                  <SkeletonCell />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key as string} className="px-4 py-3">
                    <SkeletonCell />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className={cn("rounded-2xl border border-border bg-surface p-6", className)}>{empty ?? <EmptyDataRow />}</div>;
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-surface overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider",
                    col.sortable && "cursor-pointer select-none hover:text-text",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={cn(
                  "border-t border-border/70 transition-colors hover:bg-bg/50",
                  onRowClick && "cursor-pointer",
                  rowClassName
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key as string} className={cn("px-4 py-3 text-sm text-text", col.className)}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkeletonCell() {
  return <div className="h-4 w-full animate-pulse rounded bg-border/50" />;
}

function EmptyDataRow() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-bg">
        <svg className="h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M12 18v-6" />
          <path d="M9 15h6" />
        </svg>
      </div>
      <p className="text-sm text-muted">No data available</p>
    </div>
  );
}
