import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { LANGS, useT, type MsgKey } from '../i18n';
import { ADMIN_PERIODS, dayRange, useAdminStats, type AdminPeriod, type AdminStats, type AuthEvent, type Count, type VisitStats } from '../lib/admin';
import { AuthFailure, useAuth } from '../lib/auth';
import { fmtDate, fmtInt, fmtNum, fmtPct, fmtTime } from '../lib/format';
import { useDocumentMeta } from '../lib/seo';

/*
 * /admin — site statistics for the owner (users listed in the ADMIN_USERS variable on Cloudflare):
 * accounts by sign-up method (Steam / password), active users, sign-ins, page views, visits in detail (who opened
 * which pages, in one visit or several), newest accounts. The owner's own activity is left out (server/stats.ts).
 * SPA only (not prerendered, not linked publicly); the account menu shows it to admins.
 */

const STEAM = 'rgb(158 190 222)';
const BRASS = 'var(--brass)';
const CREAM = 'var(--text-2)';

interface Series {
  key: string;
  label: string;
  color: string;
}

/** Day columns; `stack` piles the series up (sign-ups by method), `pair` puts them side by side (views / visitors). */
function DayBars({ rows, series, mode, from }: { rows: { day: string }[]; series: Series[]; mode: 'stack' | 'pair'; from: string }) {
  const { t } = useT();
  const byDay = new Map(rows.map((r) => [r.day, r as Record<string, unknown>]));
  const days = dayRange(from);
  const val = (day: string, key: string) => Number(byDay.get(day)?.[key] ?? 0);
  const max = Math.max(1, ...days.map((d) => (mode === 'stack' ? series.reduce((a, s) => a + val(d, s.key), 0) : Math.max(...series.map((s) => val(d, s.key))))));
  if (!rows.length) return <Empty>{t('admin.noData')}</Empty>;
  const labelEvery = Math.ceil(days.length / 15);
  return (
    <>
      <div className={`admin-bars admin-bars--${mode}`}>
        {days.map((d, i) => (
          <div className="admin-bars__col" key={d} title={`${d} · ${series.map((s) => `${s.label}: ${val(d, s.key)}`).join(' · ')}`}>
            <div className="admin-bars__plot">
              {series.map((s, n) => (
                <motion.span
                  key={s.key}
                  style={{ background: s.color }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(val(d, s.key) / max) * 100}%` }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.01, 0.3) + n * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              ))}
            </div>
            <span className="admin-bars__day num">{i % labelEvery === 0 || i === days.length - 1 ? d.slice(8) : ''}</span>
          </div>
        ))}
      </div>
      <div className="admin-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </>
  );
}

function Tile({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="admin-tile" style={accent ? { ['--accent' as string]: accent } : undefined}>
      <span className="admin-tile__val num">{value}</span>
      <span className="admin-tile__label">{label}</span>
      {sub && <span className="admin-tile__sub muted">{sub}</span>}
    </div>
  );
}

const EVENT_ORDER: AuthEvent[] = ['login_steam', 'login_password', 'register_steam', 'register_password', 'link_steam'];

/** "/players/:id" can't be opened — link to the section instead. */
const linkTo = (path: string) => (path.includes(':id') ? path.replace(/\/:id.*/, '') : path);

/** Stable colour per visitor label, so the same browser is easy to spot across the lists. */
const hue = (id: string) => Math.round((parseInt(id.slice(0, 4), 16) / 0xffff) * 360);

/** Country code → name in the UI language ("UA" → "Україна"). */
function useRegionName() {
  const { meta } = useT();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([meta.locale], { type: 'region' });
    } catch {
      /* old browser — show the code */
    }
    return (code: string | null) => {
      if (!code || code === 'XX') return null;
      if (code === 'T1') return 'Tor';
      try {
        return names?.of(code) ?? code;
      } catch {
        return code;
      }
    };
  }, [meta.locale]);
}

function VisitorTag({ id, username }: { id: string; username: string | null }) {
  const { t } = useT();
  return (
    <span className="admin-visitor">
      <span className="admin-visitor__id num" style={{ ['--h' as string]: hue(id) }} title={t('admin.v.peopleHint')}>
        #{id}
      </span>
      {username ? <b className="admin-visitor__name">{username}</b> : <span className="muted">{t('admin.v.guest')}</span>}
    </span>
  );
}

function CountList({ title, rows, total, name }: { title: string; rows: Count[]; total: number; name: (key: string) => string }) {
  return (
    <div className="admin-counts">
      <span className="eyebrow">{title}</span>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span className="admin-counts__bar" style={{ width: `${(r.n / Math.max(1, total)) * 100}%` }} />
            <span className="admin-counts__name">{name(r.key)}</span>
            <b className="num">{fmtInt(r.n)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VISITS_STEP = 15;

/** Visits in detail: who opened what, in one visit or several — shows when a few people inflate the views. */
function VisitsDetail({ v }: { v: VisitStats }) {
  const { t, ago, meta } = useT();
  const region = useRegionName();
  const [shown, setShown] = useState(VISITS_STEP);
  const multi = v.sessions - v.bounces;
  const device = (d: string) => (['desktop', 'mobile', 'tablet'].includes(d) ? t(`admin.v.device.${d}` as MsgKey) : d);
  const other = (k: string) => (k === 'Other' || !k ? t('admin.v.other') : k);
  const langLabel = (id: string) => LANGS.find((l) => l.id === id)?.label ?? id.toUpperCase();
  const fmtWhen = (unix: number) => new Date(unix * 1000).toLocaleString(meta.locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <SectionTitle title={t('admin.v.title')} />
      {!v.since ? (
        <Empty>{t('admin.v.none')}</Empty>
      ) : (
        <>
          <div className="admin-tiles">
            <Tile value={fmtInt(v.sessions)} label={t('admin.v.sessions')} sub={t('admin.v.signedIn', { x: fmtInt(v.signedIn) })} accent={BRASS} />
            <Tile
              value={fmtInt(v.visitors)}
              label={t('admin.v.visitors')}
              sub={v.visitors ? t('admin.v.perVisitor', { x: fmtNum(v.sessions / v.visitors, 1) }) : undefined}
              accent={CREAM}
            />
            <Tile
              value={v.sessions ? fmtNum(v.views / v.sessions, 1) : '—'}
              label={t('admin.v.pagesPerVisit')}
              sub={v.sessions ? t('admin.v.bounce', { x: fmtPct(v.bounces / v.sessions, 0) }) : undefined}
              accent={CREAM}
            />
            <Tile value={multi ? fmtTime(v.seconds / multi) : '—'} label={t('admin.v.time')} sub={t('admin.v.timeSub')} accent={CREAM} />
          </div>

          <div className="admin-grid">
            <Panel title={t('admin.v.pages')}>
              {!v.pages.length ? (
                <Empty>{t('admin.noData')}</Empty>
              ) : (
                <div className="admin-table-wrap">
                  <table className="data-table admin-table admin-vpages">
                    <thead>
                      <tr>
                        <th>{t('admin.v.col.page')}</th>
                        <th className="num">{t('admin.v.col.views')}</th>
                        <th className="num">{t('admin.v.col.visitors')}</th>
                        <th className="num hide-sm">{t('admin.v.col.visits')}</th>
                        <th className="num" title={t('admin.v.topHint')}>
                          {t('admin.v.col.top')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.pages.map((p) => {
                        const hot = p.top >= 4 && p.top * 2 >= p.views;
                        return (
                          <tr key={p.path} className={hot ? 'is-hot' : undefined} title={hot ? t('admin.v.topHint') : undefined}>
                            <td>
                              <Link to={linkTo(p.path)} className="admin-pages__path">
                                {p.path}
                              </Link>
                            </td>
                            <td className="num">{fmtInt(p.views)}</td>
                            <td className="num">{fmtInt(p.visitors)}</td>
                            <td className="num hide-sm">{fmtInt(p.sessions)}</td>
                            <td className="num admin-vpages__top">{fmtInt(p.top)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted small admin-note">{t('admin.v.topHint')}</p>
            </Panel>

            <Panel title={t('admin.v.people')}>
              {!v.people.length ? (
                <Empty>{t('admin.noData')}</Empty>
              ) : (
                <ul className="admin-people">
                  {v.people.map((p) => (
                    <li key={`${p.id}-${p.day}`}>
                      <div>
                        <VisitorTag id={p.id} username={p.username} />
                        <span className="muted small admin-people__meta">
                          {[region(p.country), device(p.device), other(p.browser), other(p.os)].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <div className="admin-people__nums">
                        <b className="num">{t('admin.v.viewsN', { n: p.views })}</b>
                        <span className="muted small">
                          {t('admin.v.visitsN', { n: p.sessions })} · {t('admin.v.pagesN', { n: p.pages })} · {ago(p.lastAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small admin-note">{t('admin.v.peopleHint')}</p>
            </Panel>
          </div>

          <Panel title={t('admin.v.audience')} className="admin-audience">
            <div className="admin-counts-grid">
              <CountList title={t('admin.v.sources')} rows={v.sources} total={v.sessions} name={(k) => k || t('admin.v.direct')} />
              <CountList title={t('admin.v.countries')} rows={v.countries} total={v.sessions} name={(k) => region(k) ?? t('admin.v.unknown')} />
              <CountList title={t('admin.v.devices')} rows={v.devices} total={v.sessions} name={device} />
              <CountList title={t('admin.v.browsers')} rows={v.browsers} total={v.sessions} name={other} />
              <CountList title={t('admin.v.systems')} rows={v.systems} total={v.sessions} name={other} />
            </div>
          </Panel>

          <Panel title={t('admin.v.recent')} className="admin-audience">
            {!v.recent.length ? (
              <Empty>{t('admin.noData')}</Empty>
            ) : (
              <>
                <ul className="admin-visits">
                  {v.recent.slice(0, shown).map((r) => (
                    <li key={r.id}>
                      <div className="admin-visits__head">
                        <VisitorTag id={r.visitor} username={r.username} />
                        <span className="muted small">
                          {[region(r.country), device(r.device), other(r.browser), other(r.os), langLabel(r.lang)].filter(Boolean).join(' · ')}
                        </span>
                        {r.ref && <span className="chip admin-visits__ref">{t('admin.v.from', { x: r.ref })}</span>}
                        <span className="admin-visits__when muted small num" title={fmtWhen(r.startedAt)}>
                          {ago(r.startedAt)} · {t('admin.v.viewsN', { n: r.views })}
                          {r.views > 1 && ` · ${fmtTime(r.lastAt - r.startedAt)}`}
                        </span>
                      </div>
                      <ol className="admin-visits__path">
                        {r.pages.map((p, i) => (
                          <li key={i}>
                            <Link to={linkTo(p.path)}>{p.path}</Link>
                            {i > 0 && <span className="muted num">+{fmtTime(p.t)}</span>}
                          </li>
                        ))}
                        {r.views > r.pages.length && <li className="muted">+{r.views - r.pages.length}</li>}
                      </ol>
                    </li>
                  ))}
                </ul>
                {v.recent.length > shown && (
                  <button className="btn btn--ghost admin-more" onClick={() => setShown((n) => n + VISITS_STEP)}>
                    {t('admin.v.more')}
                  </button>
                )}
              </>
            )}
          </Panel>
          <p className="muted small-note">{t('admin.v.since', { date: v.since })}</p>
        </>
      )}
    </>
  );
}

function Report({ s }: { s: AdminStats }) {
  const { t, ago } = useT();
  const u = s.users;
  const share = (n: number) => (u.total ? ` · ${fmtPct(n / u.total, 0)}` : '');
  const eventsFrom = s.eventsSince ? new Date(s.eventsSince * 1000).toISOString().slice(0, 10) : null;
  const periodStart = (fallback: string | null) =>
    s.days ? new Date(Date.now() - (s.days - 1) * 86400_000).toISOString().slice(0, 10) : fallback ?? new Date().toISOString().slice(0, 10);
  const langName = (id: string) => LANGS.find((l) => l.id === id)?.label ?? id.toUpperCase();
  const topMax = Math.max(1, ...s.traffic.top.map((p) => p.views));

  return (
    <>
      <SectionTitle title={t('admin.accounts')} />
      <div className="admin-tiles">
        <Tile value={fmtInt(u.total)} label={t('admin.users')} sub={t('admin.newInPeriod', { n: u.newTotal })} accent={BRASS} />
        <Tile value={fmtInt(u.steam)} label={t('admin.viaSteam')} sub={`+${u.newSteam}${share(u.steam)}`} accent={STEAM} />
        <Tile value={fmtInt(u.password)} label={t('admin.viaPassword')} sub={`+${u.newPassword} · ${t('admin.linked', { n: u.passwordLinked })}`} accent={BRASS} />
        <Tile value={fmtInt(u.active)} label={t('admin.active')} sub={t('admin.activeSub')} accent={CREAM} />
        <Tile value={fmtInt(u.favorites)} label={t('admin.favorites')} sub={t('admin.favUsers', { n: u.favoriteUsers })} accent={CREAM} />
      </div>

      <div className="admin-grid">
        <Panel title={t('admin.signups')}>
          <DayBars
            rows={s.signups}
            mode="stack"
            from={periodStart(s.signups[0]?.day ?? null)}
            series={[
              { key: 'steam', label: t('admin.method.steam'), color: STEAM },
              { key: 'password', label: t('admin.method.password'), color: BRASS },
            ]}
          />
        </Panel>
        <Panel title={t('admin.signins')}>
          <ul className="admin-events">
            {EVENT_ORDER.map((k) => (
              <li key={k}>
                <span>{t(`admin.ev.${k}` as MsgKey)}</span>
                <b className="num">{fmtInt(s.events[k])}</b>
              </li>
            ))}
          </ul>
          <p className="muted small admin-note">{eventsFrom ? t('admin.eventsSince', { date: eventsFrom }) : t('admin.eventsNone')}</p>
        </Panel>
      </div>

      <SectionTitle title={t('admin.traffic')} />
      {!s.traffic.since ? (
        <Empty>{t('admin.trafficNone')}</Empty>
      ) : (
        <>
          <div className="admin-tiles">
            <Tile value={fmtInt(s.traffic.views)} label={t('admin.views')} accent={BRASS} />
            <Tile value={fmtInt(s.traffic.visitors)} label={t('admin.visitors')} accent={CREAM} />
            <Tile value={s.traffic.visitors ? fmtNum(s.traffic.views / s.traffic.visitors, 1) : '—'} label={t('admin.perVisitor')} accent={CREAM} />
          </div>
          <div className="admin-grid">
            <Panel title={t('admin.viewsByDay')}>
              <DayBars
                rows={s.traffic.byDay}
                mode="pair"
                from={periodStart(s.traffic.since)}
                series={[
                  { key: 'views', label: t('admin.views'), color: BRASS },
                  { key: 'visitors', label: t('admin.visitors'), color: CREAM },
                ]}
              />
              <p className="muted small admin-note">{t('admin.trafficSince', { date: s.traffic.since })}</p>
            </Panel>
            <Panel title={t('admin.topPages')}>
              {!s.traffic.top.length ? (
                <Empty>{t('admin.noData')}</Empty>
              ) : (
                <ol className="admin-pages">
                  {s.traffic.top.map((p) => (
                    <li key={p.path}>
                      <Link to={p.path.includes(':id') ? p.path.replace(/\/:id.*/, '') : p.path} className="admin-pages__path">
                        {p.path}
                      </Link>
                      <span className="admin-pages__bar" style={{ width: `${(p.views / topMax) * 100}%` }} />
                      <b className="num">{fmtInt(p.views)}</b>
                    </li>
                  ))}
                </ol>
              )}
              {s.traffic.langs.length > 0 && (
                <div className="admin-langs">
                  <span className="eyebrow">{t('admin.langs')}</span>
                  {s.traffic.langs.map((l) => (
                    <span key={l.lang} className="chip">
                      {langName(l.lang)} <b className="num">{fmtPct(l.views / Math.max(1, s.traffic.views), 0)}</b>
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      <VisitsDetail v={s.visits} />

      <SectionTitle title={t('admin.recent')} />
      {!s.recent.length ? (
        <Empty>{t('admin.noData')}</Empty>
      ) : (
        <div className="admin-table-wrap">
          <table className="data-table admin-table">
            <thead>
              <tr>
                <th>{t('admin.col.user')}</th>
                <th>{t('admin.col.method')}</th>
                <th>{t('admin.col.steam')}</th>
                <th className="hide-sm">{t('admin.col.created')}</th>
                <th>{t('admin.col.last')}</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r) => (
                <tr key={`${r.username}-${r.createdAt}`}>
                  <td className="admin-table__user">{r.username}</td>
                  <td>
                    <span className={`admin-method admin-method--${r.viaSteam ? 'steam' : 'password'}`}>
                      {t(r.viaSteam ? 'admin.method.steam' : 'admin.method.password')}
                    </span>
                  </td>
                  <td className="muted">{r.steamLinked ? t('admin.yes') : t('admin.no')}</td>
                  <td className="hide-sm muted num">{fmtDate(r.createdAt)}</td>
                  <td className="muted">{ago(r.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small-note">{t('admin.note')}</p>
    </>
  );
}

export function AdminPage() {
  const { t } = useT();
  const { user, isLoading } = useAuth();
  const [days, setDays] = useState<AdminPeriod>(30);
  const stats = useAdminStats(days, !!user);
  useDocumentMeta(t('meta.admin'));
  const forbidden = stats.error instanceof AuthFailure && (stats.error.status === 403 || stats.error.status === 401);

  return (
    <Page className="admin-page">
      <div className="container">
        <header className="page-head">
          <div>
            <span className="eyebrow">{t('admin.eyebrow')}</span>
            <h1 className="display page-head__title">{t('admin.title')}</h1>
            <p className="page-head__sub muted">{t('admin.sub')}</p>
          </div>
          {user && !forbidden && (
            <Segmented id="admin-days" value={days} onChange={setDays} options={ADMIN_PERIODS.map((d) => ({ value: d, label: t(`admin.period.${d}` as MsgKey) }))} />
          )}
        </header>

        {isLoading ? (
          <Skeleton h={320} r={14} />
        ) : !user ? (
          <Panel className="admin-gate">
            <p>{t('admin.login')}</p>
            <Link className="btn btn--brass" to="/login?next=/admin">
              {t('auth.login')}
            </Link>
          </Panel>
        ) : forbidden ? (
          <Panel className="admin-gate">
            <p>{t('admin.forbidden')}</p>
            <p className="muted small">{t('admin.signedAs', { name: user.username })}</p>
          </Panel>
        ) : stats.error ? (
          <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
        ) : !stats.data ? (
          <Skeleton h={420} r={14} />
        ) : (
          <div className={stats.isFetching ? 'is-refreshing' : ''}>
            <Report s={stats.data} />
          </div>
        )}
      </div>
    </Page>
  );
}
