export interface StatusIndicatorProps {
  active: boolean
  label: string
}

export function StatusIndicator({ active, label }: StatusIndicatorProps): React.JSX.Element {
  return (
    <span className={active ? 'status-indicator active' : 'status-indicator'}>
      <span className="status-dot" />
      {label}
    </span>
  )
}
