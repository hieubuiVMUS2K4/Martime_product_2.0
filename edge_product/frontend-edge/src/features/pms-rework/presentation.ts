// Internal identifiers remain unchanged in API requests and signed snapshots.
export function readableCode(value?: string | null) {
  if (!value || /^(?:WO-)?(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value)) return null
  return value
}
