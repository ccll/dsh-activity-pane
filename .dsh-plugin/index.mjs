// Host half intentionally does nothing. dsh-activity-pane only augments the
// web client; every data source (sessions / workspaces client services) is
// provided by DSH itself, so there is no host route of its own.
export const name = 'dsh-activity-pane'

export function apply() {
  return () => {}
}
