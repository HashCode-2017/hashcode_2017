import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { rateAt, type Player } from '../lib/player'
import { compact, int } from '../lib/format'
import { Chip, Label, Meter, Num, Panel, Stat } from '../components/Kit'
import { SolveStage } from '../viz/SolveStage'
import { Loading } from './Ingest'

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]

/**
 * Act 3. The greedy runs.
 *
 * The running score is accumulated from each placement's own marginal gain,
 * which sums exactly to the solver's total saved milliseconds -- so the counter
 * lands on the final score rather than drifting toward it.
 *
 * The candidate panel is the part that explains *why* the heuristic works:
 * when a cache is scanned we show its top videos ranked by savings per
 * megabyte, which is the entire rule the solver applies.
 */
export function Solve() {
  const player = useApp((s) => s.player)
  const topo = useApp((s) => s.topology)
  const meta = useApp((s) => s.meta)
  const streaming = useApp((s) => s.streaming)
  const result = useApp((s) => s.result)
  const startRun = useApp((s) => s.startRun)

  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [, force] = useState(0)
  const frac = useRef(0)
  const last = useRef(0)

  // One frame loop drives playback and the React snapshot together.
  useEffect(() => {
    if (!player) return
    let raf = 0
    last.current = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last.current) / 1000)
      last.current = now
      if (playing && player.events.length) {
        const rate = rateAt(frac.current, Math.max(player.events.length, 1), speed)
        frac.current = Math.min(player.events.length, frac.current + rate * dt)
        player.seek(frac.current, now)
      } else {
        player.seek(frac.current, now)
      }
      force((v) => (v + 1) % 1000000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [player, playing, speed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const restart = useCallback(() => {
    if (!player) return
    frac.current = 0
    player.seek(0, performance.now())
    setPlaying(true)
  }, [player])

  if (!player || !topo) return <Loading />

  const total = player.events.length
  const atEnd = player.cursor >= total && !streaming
  const waiting = streaming && player.cursor >= total && total > 0
  const scan = player.scanning
  const fill = player.capacityMB ? player.usedMB / player.capacityMB : 0

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '250px 1fr var(--tele)',
      gap: 1, background: 'var(--line)', height: '100%', minHeight: 0,
    }}>
      {/* the rule, made visible */}
      <Panel title={player.perCache ? 'cache being filled' : 'latest picks, whole network'}
        style={{ minHeight: 0 }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!player.perCache && player.recent.length > 0 ? (
            <RecentPicks player={player} />
          ) : scan ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 17, color: 'var(--ca-bright)' }}>
                  cache {scan.cache}
                </span>
                <span className="lbl mono">{int(scan.remaining)} MB free</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <Meter value={1 - scan.remaining / topo.X} segments={20} />
              </div>
              <Label style={{ marginTop: 16, marginBottom: 3 }}>
                candidates, best savings per MB first
              </Label>
              <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 9 }}>
                {int(scan.candidates)} videos would help here
              </div>
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {scan.top.map((t, i) => {
                  const density = t.gain / t.size
                  const best = scan.top[0] ? scan.top[0].gain / scan.top[0].size : 1
                  const fits = t.size <= scan.remaining
                  return (
                    <div key={t.video} style={{
                      display: 'grid', gridTemplateColumns: '46px 1fr 40px',
                      gap: 7, alignItems: 'center', padding: '3px 0',
                      opacity: fits ? 1 : 0.32,
                    }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                        {i === 0 ? '▸ ' : ''}v{t.video}
                      </span>
                      <div style={{ height: 8, background: 'var(--panel-3)' }}>
                        <div style={{
                          width: `${Math.max(2, (density / best) * 100)}%`, height: '100%',
                          background: fits ? 'var(--ca)' : 'var(--ink-4)',
                        }} />
                      </div>
                      <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'right' }}>
                        {t.size}MB
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="lbl" style={{ marginTop: 10, color: 'var(--ink-4)', lineHeight: 1.6 }}>
                dimmed = too big for the space left
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center' }}>
              <span className="lbl" style={{ color: 'var(--ink-4)' }}>
                {atEnd ? 'placement finished' : 'waiting for the first placement'}
              </span>
            </div>
          )}
        </div>
      </Panel>

      {/* the stage */}
      <Panel
        title="cache servers"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {waiting && <Chip tone="dc">solver still working…</Chip>}
            {meta && meta.cached && <Chip tone="ca">prewarmed replay</Chip>}
            {meta && !meta.cached && streaming && <Chip tone="dc">solving live</Chip>}
            <span className="lbl mono" style={{ color: 'var(--ink-3)' }}>
              {int(Math.min(player.cursor, total))} / {int(total)} events
            </span>
          </div>
        }
        flush
        style={{ minHeight: 0 }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SolveStage player={player} topo={topo} tick={0} />
          </div>
          <Controls
            playing={playing}
            setPlaying={setPlaying}
            speed={speed}
            setSpeed={setSpeed}
            frac={frac}
            player={player}
            restart={restart}
            atEnd={atEnd}
            onRerun={() => { frac.current = 0; void startRun(true); setPlaying(true) }}
          />
        </div>
      </Panel>

      {/* telemetry */}
      <Panel title="telemetry" style={{ minHeight: 0 }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          <Stat label="score — microseconds saved per request" wide accent="ca"
            note={result ? `final · ${int(result.score)}` : 'accumulating from each placement'}>
            <Num value={player.score} />
          </Stat>
          <Stat label="videos placed" note="net of evictions">
            <Num value={player.placed} />
          </Stat>
          <Stat label="copies evicted"
            note="dominated by a closer copy, space handed back">
            <Num value={player.evicted} />
          </Stat>
          <Stat label="copies swapped out"
            note="replaced by a video that saves more">
            <Num value={player.swapped} />
          </Stat>
          <Stat label="capacity used"
            note={`${int(player.usedMB)} of ${int(player.capacityMB)} MB`}>
            {(fill * 100).toFixed(1)}%
          </Stat>
          <div style={{ padding: '2px 0 12px' }}>
            <Meter value={fill} segments={32} />
          </div>
          <Stat label="pass" note={passNote(player.round, atEnd, player.evicted + player.swapped)}>
            {player.round + 1}
          </Stat>
          <Stat label="endpoints improved by the last placement">
            <Num value={player.lastTouched} />
          </Stat>

          {result && atEnd && (
            <>
              <Stat label="share of the reachable ceiling" accent="ca"
                note={`a perfect placement would score ${int(result.ceiling)}`}>
                {result.ceilingPct}%
              </Stat>
              <Stat label="solver time"
                note={meta && meta.cached ? 'from the prewarmed run' : 'measured just now'}>
                {meta && meta.solveSeconds != null ? `${meta.solveSeconds}s` : '—'}
              </Stat>
            </>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <Label style={{ marginBottom: 6 }}>how the rule works</Label>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 }}>
              {player.perCache
                ? `For each cache, every requested video is scored by the latency it would save across
              the endpoints wired to it — counting only what is not already saved by a closer
              copy. Divide by size, take the best per megabyte, keep going while it fits.`
                : `Every (cache, video) pair in the network is scored by the latency it would save —
              counting only what is not already saved by a closer copy. Divide by size and take
              the best per megabyte anywhere, re-scoring a pair only when it reaches the top.`}
              {' '}After each pass, copies another cache now serves at least as fast are evicted,
              low-value copies are swapped for videos that save more, and the space is refilled.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function RecentPicks({ player }: { player: Player }) {
  const best = Math.max(...player.recent.map((p) => p.gain / p.size), 1e-9)
  return (
    <>
      <Label style={{ marginBottom: 3 }}>newest first, best savings per MB anywhere</Label>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 9 }}>
        every cache competes for every video at once
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {player.recent.map((p, i) => (
          <div key={`${p.cache}-${p.video}-${i}`} style={{
            display: 'grid', gridTemplateColumns: '38px 46px 1fr 40px',
            gap: 7, alignItems: 'center', padding: '3px 0', opacity: i === 0 ? 1 : 0.75,
          }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ca-bright)' }}>c{p.cache}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
              {i === 0 ? '▸ ' : ''}v{p.video}
            </span>
            <div style={{ height: 8, background: 'var(--panel-3)' }}>
              <div style={{
                width: `${Math.max(2, (p.gain / p.size / best) * 100)}%`, height: '100%',
                background: 'var(--ca)',
              }} />
            </div>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', textAlign: 'right' }}>
              {p.size}MB
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function passNote(round: number, atEnd: boolean, evicted: number) {
  if (atEnd) return 'finished — nothing left to place or evict, or the pass limit was hit'
  if (round === 0) return 'first pass'
  return evicted
    ? 'refilling space freed by evictions and swaps'
    : 'refilling remaining space'
}

function Controls({ playing, setPlaying, speed, setSpeed, frac, player, restart, atEnd, onRerun }: {
  playing: boolean
  setPlaying: (v: boolean) => void
  speed: number
  setSpeed: (v: number) => void
  frac: React.MutableRefObject<number>
  player: { events: unknown[]; cursor: number; seek: (n: number, t: number) => void }
  restart: () => void
  atEnd: boolean
  onRerun: () => void
}) {
  const total = Math.max(1, player.events.length)
  return (
    <div style={{
      borderTop: '1px solid var(--line)', padding: '9px 12px',
      display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto',
    }}>
      <button
        onClick={() => (atEnd ? restart() : setPlaying(!playing))}
        className="mono"
        style={{
          width: 62, height: 26, border: '1px solid var(--line-2)',
          color: 'var(--ink-0)', fontSize: 10.5, letterSpacing: '0.08em',
        }}
      >
        {atEnd ? 'REPLAY' : playing ? 'PAUSE' : 'PLAY'}
      </button>

      <input
        type="range"
        min={0}
        max={total}
        value={Math.min(player.cursor, total)}
        onChange={(e) => {
          frac.current = Number(e.target.value)
          player.seek(frac.current, performance.now())
          setPlaying(false)
        }}
        style={{ flex: 1, accentColor: '#0DD3F8', height: 3 }}
      />

      <div style={{ display: 'flex', gap: 2 }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className="mono"
            style={{
              padding: '3px 7px', fontSize: 10,
              border: `1px solid ${speed === s ? 'var(--ca)' : 'var(--line)'}`,
              color: speed === s ? 'var(--ca-bright)' : 'var(--ink-3)',
            }}
          >{s}×</button>
        ))}
      </div>

      <button onClick={onRerun} className="lbl" style={{ color: 'var(--ink-3)' }}>
        solve again ↻
      </button>
    </div>
  )
}

export { compact }
