import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorState, Page, Panel, SectionTitle, Segmented, Skeleton } from '../components/UI';
import { LANGS, useT, type MsgKey } from '../i18n';
import { ADMIN_PERIODS, dayRange, useAdminStats, type AdminPeriod, type AdminStats, type AuthEvent } from '../lib/admin';
import { AuthFailure, useAuth } from '../lib/auth';
import { fmtDate, fmtInt, fmtNum, fmtPct } from '../lib/format';
import { useDocumentMeta } from '../lib/seo';

/*
 * /admin — site statistics for the owner (users listed in the ADMIN_USERS variable on Cloudflare):
 * accounts by sign-up method (Steam / password), active users, sign-ins, page views, newest accounts.
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
