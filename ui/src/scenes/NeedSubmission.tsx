import { api } from '../lib/api'
import { useApp } from '../lib/store'

/**
 * Shown in the placement, routing and submission acts when the player has not
 * uploaded anything for this data set: the story from here on is *their*
 * placement, so there is nothing to show until they hand one in.
 */
export function NeedSubmission() {
  const instanceId = useApp((s) => s.instanceId)
  const openPage = useApp((s) => s.openPage)
  const admin = useApp((s) => !!s.user?.isAdmin)
  const startRun = useApp((s) => s.startRun)
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{
        maxWidth: 460, textAlign: 'center', border: '1px dashed var(--dc)',
        background: 'var(--panel)', padding: '26px 30px',
      }}>
        <div style={{ fontSize: 16, color: 'var(--ink-0)', fontWeight: 550 }}>
          No placement yet for {instanceId}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, margin: '8px 0 18px' }}>
          From here on the story follows <em>your</em> solution. Run your algorithm on the data
          set, then submit its <span className="mono">.out</span> to watch it fill the caches.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {instanceId && (
            <a href={api.downloadUrl(instanceId)} download={`${instanceId}.in`} style={{
              padding: '8px 14px', fontSize: 12.5, border: '1px solid var(--line-2)',
              color: 'var(--ink-1)', textDecoration: 'none',
            }}>download .in ↓</a>
          )}
          <button onClick={() => openPage('submit')} style={{
            padding: '8px 14px', fontSize: 12.5, border: '1px solid var(--ca)',
            background: 'var(--ca-dim)', color: 'var(--ink-0)',
          }}>submit solution →</button>
        </div>
        {admin && (
          <button className="lbl" onClick={() => { useApp.setState({ needSubmission: false }); void startRun() }}
            style={{ marginTop: 16, color: 'var(--dc-bright)' }}>
            admin · run the reference solver instead
          </button>
        )}
      </div>
    </div>
  )
}
