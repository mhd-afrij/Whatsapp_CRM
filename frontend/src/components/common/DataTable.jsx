export function DataTable({ columns, data, loading, emptyMessage = "No data available", onRowClick }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 rounded-[10px] bg-surface border border-border-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted text-xs uppercase tracking-wide">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left font-medium px-4 py-3 whitespace-nowrap"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-muted">
            {data.map((row, idx) => (
              <tr
                key={row.id ?? idx}
                className="hover:bg-surface-hover cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-text-secondary">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
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
