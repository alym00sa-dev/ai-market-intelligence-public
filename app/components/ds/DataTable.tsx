import type { ReactNode } from "react"

export type Column<T> = {
  key: string
  header: ReactNode
  numeric?: boolean
  width?: string
  render?: (row: T) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  className?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
}: Props<T>) {
  if (rows.length === 0 && empty !== undefined) {
    return <div>{empty}</div>
  }
  return (
    <table className={`data-table ${className ?? ""}`.trim()}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={col.numeric ? "is-numeric" : undefined}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            className={onRowClick ? "is-clickable" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <td key={col.key} className={col.numeric ? "is-numeric" : undefined}>
                {col.render ? col.render(row) : String(row[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
