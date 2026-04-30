import { useState, useEffect, useCallback } from "react";

const DEMO_CSV = `user_id,name,ticker,company,industry
User1,Analyst A,AAPL,Apple Inc,Consumer Technology
User1,Analyst A,MSFT,Microsoft Corp,Enterprise Software
User2,Analyst B,NVDA,NVIDIA Corp,Semiconductors
User2,Analyst B,AMD,Advanced Micro Devices,Semiconductors
User3,Analyst C,JPM,JPMorgan Chase,Banking & Finance
User3,Analyst C,GS,Goldman Sachs,Investment Banking
User4,Analyst D,TSLA,Tesla Inc,Electric Vehicles
User5,Analyst E,AMZN,Amazon.com Inc,E-Commerce & Cloud
User6,Analyst F,META,Meta Platforms,Social Media & Ads`;

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function matchAlert(alertText, users) {
  const lower = alertText.toLowerCase();
  // Deduplicate by user_id — one card per user even if multiple tickers match
  const matched = users.filter(u =>
    lower.includes(u.ticker.toLowerCase()) ||
    lower.includes(u.company.toLowerCase()) ||
    lower.includes(u.industry.toLowerCase())
  );
  const seen = new Set();
  return matched.filter(u => {
    if (seen.has(u.user_id)) return false;
    seen.add(u.user_id);
    return true;
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function generateEmailDraft(alert, user) {
  return `Hi ${user.name},\n\nI wanted to flag some news that just came across regarding ${user.company} (${user.ticker}), which I know you cover in the ${user.industry} space.\n\n"${alert.headline}"\n\nGiven your coverage, I thought this might be relevant for your current work. Would love to connect and see if our expert network can be helpful here.\n\nBest,\n[Your Name]`;
}

const STORAGE_KEY = "market_dashboard_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveState(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [newAlert, setNewAlert] = useState({ headline: "", source: "", url: "" });
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [dismissed, setDismissed] = useState({});
  const [contacted, setContacted] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const d = loadState();
    if (d.users) setUsers(d.users);
    if (d.alerts) setAlerts(d.alerts);
    if (d.dismissed) setDismissed(d.dismissed);
    if (d.contacted) setContacted(d.contacted);
  }, []);

  const save = useCallback((u, a, dis, con) => {
    saveState({ users: u, alerts: a, dismissed: dis, contacted: con });
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCSVLoad = () => {
    try {
      const parsed = parseCSV(csvText);
      if (!parsed.length || !parsed[0].ticker) throw new Error("Missing required columns");
      setUsers(parsed);
      save(parsed, alerts, dismissed, contacted);
      showToast(`Loaded ${parsed.length} coverage rows`);
      setCsvError("");
      setTab("dashboard");
    } catch (e) {
      setCsvError("CSV parse error: " + e.message + ". Make sure columns are: user_id, name, ticker, company, industry");
    }
  };

  const handleLoadDemo = () => {
    setCsvText(DEMO_CSV);
    const parsed = parseCSV(DEMO_CSV);
    setUsers(parsed);
    save(parsed, alerts, dismissed, contacted);
    showToast("Demo data loaded");
    setTab("dashboard");
  };

  const handleAddAlert = () => {
    if (!newAlert.headline.trim()) return;
    const matched = matchAlert(newAlert.headline + " " + newAlert.source, users);
    const alert = {
      id: Date.now().toString(),
      ...newAlert,
      timestamp: Date.now(),
      matchedUsers: matched.map(u => u.user_id),
    };
    const updated = [alert, ...alerts];
    setAlerts(updated);
    save(users, updated, dismissed, contacted);
    setNewAlert({ headline: "", source: "", url: "" });
    showToast(`Alert added — matched ${matched.length} analyst${matched.length !== 1 ? "s" : ""}`);
    setTab("dashboard");
  };

  const dismiss = (alertId, userId) => {
    const key = `${alertId}_${userId}`;
    const updated = { ...dismissed, [key]: true };
    setDismissed(updated);
    save(users, alerts, updated, contacted);
  };

  const markContacted = (alertId, userId) => {
    const key = `${alertId}_${userId}`;
    const updated = { ...contacted, [key]: true };
    setContacted(updated);
    save(users, alerts, dismissed, updated);
    showToast("Marked as contacted ✓");
  };

  const deleteAlert = (alertId) => {
    const updated = alerts.filter(a => a.id !== alertId);
    setAlerts(updated);
    save(users, updated, dismissed, contacted);
  };

  // Build dashboard cards — one per unique user per alert
  const actionItems = [];
  for (const alert of alerts) {
    for (const userId of alert.matchedUsers) {
      const key = `${alert.id}_${userId}`;
      if (dismissed[key]) continue;
      // Get the first row for this user (for display)
      const user = users.find(u => u.user_id === userId);
      if (!user) continue;
      // Get all tickers for this user
      const allTickers = [...new Set(users.filter(u => u.user_id === userId).map(u => u.ticker))];
      actionItems.push({ alert, user, allTickers, key, isContacted: !!contacted[key] });
    }
  }
  const pending = actionItems.filter(i => !i.isContacted);
  const done = actionItems.filter(i => i.isContacted);

  // Unique analysts for coverage tab
  const uniqueUsers = Object.values(
    users.reduce((acc, u) => {
      if (!acc[u.user_id]) acc[u.user_id] = { ...u, tickers: [] };
      acc[u.user_id].tickers.push({ ticker: u.ticker, company: u.company, industry: u.industry });
      return acc;
    }, {})
  );

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>Market Dashboard</span>
          <span style={styles.logoSub}>Coverage Intelligence</span>
        </div>
        <div style={styles.headerStats}>
          <Stat label="Analysts" value={uniqueUsers.length} />
          <Stat label="Alerts" value={alerts.length} />
          <Stat label="Pending" value={pending.length} accent />
        </div>
      </header>

      <nav style={styles.nav}>
        {["dashboard", "alerts", "coverage", "setup"].map(t => (
          <button key={t} style={{ ...styles.navBtn, ...(tab === t ? styles.navBtnActive : {}) }} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "dashboard" && pending.length > 0 && (
              <span style={styles.badge}>{pending.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={styles.main}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            {users.length === 0 && (
              <EmptyState icon="📋" title="No coverage data loaded" sub="Go to Setup to paste your CSV or load demo data" action={() => setTab("setup")} actionLabel="Go to Setup →" />
            )}
            {users.length > 0 && pending.length === 0 && alerts.length === 0 && (
              <EmptyState icon="📡" title="No alerts yet" sub="Go to Alerts to paste in a news headline and match it to your coverage" action={() => setTab("alerts")} actionLabel="Add an Alert →" />
            )}
            {users.length > 0 && pending.length === 0 && alerts.length > 0 && (
              <EmptyState icon="✅" title="All caught up" sub="No pending outreach items" />
            )}
            {pending.length > 0 && (
              <>
                <SectionLabel>Action Required — {pending.length} outreach{pending.length !== 1 ? "s" : ""}</SectionLabel>
                {pending.map(({ alert, user, allTickers, key }) => (
                  <AlertCard
                    key={key}
                    alert={alert}
                    user={user}
                    allTickers={allTickers}
                    isContacted={false}
                    emailExpanded={expandedEmail === key}
                    onToggleEmail={() => setExpandedEmail(expandedEmail === key ? null : key)}
                    onDismiss={() => dismiss(alert.id, user.user_id)}
                    onContacted={() => markContacted(alert.id, user.user_id)}
                    emailDraft={generateEmailDraft(alert, user)}
                  />
                ))}
              </>
            )}
            {done.length > 0 && (
              <>
                <SectionLabel style={{ marginTop: 32, color: "#4a5568" }}>Completed — {done.length}</SectionLabel>
                {done.map(({ alert, user, allTickers, key }) => (
                  <AlertCard key={key} alert={alert} user={user} allTickers={allTickers} isContacted compact />
                ))}
              </>
            )}
          </div>
        )}

        {/* ALERTS */}
        {tab === "alerts" && (
          <div>
            <SectionLabel>Paste a New Alert</SectionLabel>
            <div style={styles.card}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Headline / Alert Body *</label>
                <textarea
                  style={styles.textarea}
                  placeholder="e.g. 'Apple Inc names new CEO as Tim Cook steps down…'"
                  value={newAlert.headline}
                  onChange={e => setNewAlert(p => ({ ...p, headline: e.target.value }))}
                  rows={3}
                />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ ...styles.formGroup, flex: 1, minWidth: 160 }}>
                  <label style={styles.label}>Source (optional)</label>
                  <input style={styles.input} placeholder="e.g. Bloomberg, Reuters" value={newAlert.source} onChange={e => setNewAlert(p => ({ ...p, source: e.target.value }))} />
                </div>
                <div style={{ ...styles.formGroup, flex: 1, minWidth: 160 }}>
                  <label style={styles.label}>URL (optional)</label>
                  <input style={styles.input} placeholder="https://..." value={newAlert.url} onChange={e => setNewAlert(p => ({ ...p, url: e.target.value }))} />
                </div>
              </div>
              <button style={styles.primaryBtn} onClick={handleAddAlert}>
                Match Alert to Coverage →
              </button>
            </div>

            <SectionLabel style={{ marginTop: 32 }}>Google Alerts → Auto Ingest</SectionLabel>
            <div style={{ ...styles.card, ...styles.infoCard }}>
              <p style={styles.infoText}>To automate alert ingestion from Google Alerts:</p>
              <ol style={styles.ol}>
                <li>Set up <strong>Google Alerts</strong> at alerts.google.com for each ticker or company</li>
                <li>In <strong>Make.com</strong> (free), create a scenario: Gmail trigger → parse email subject → paste into this tool</li>
                <li>Or use <strong>Zapier</strong>: Gmail → Webhook POST to a small backend that writes to your alerts list</li>
              </ol>
              <p style={{ ...styles.infoText, marginTop: 8, color: "#d69e2e" }}>💡 Want a fully automated webhook server? Ask Claude to build one for Vercel or Railway — it takes about 30 minutes.</p>
            </div>

            {alerts.length > 0 && (
              <>
                <SectionLabel style={{ marginTop: 32 }}>All Alerts ({alerts.length})</SectionLabel>
                {alerts.map(alert => (
                  <div key={alert.id} style={{ ...styles.card, marginBottom: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.alertHeadline}>{alert.headline}</div>
                      <div style={styles.alertMeta}>
                        {alert.source && <span>{alert.source} · </span>}
                        <span>{timeAgo(alert.timestamp)}</span>
                        <span> · {alert.matchedUsers.length} match{alert.matchedUsers.length !== 1 ? "es" : ""}</span>
                        {alert.url && <span> · <a href={alert.url} target="_blank" rel="noreferrer" style={{ color: "#d69e2e" }}>link</a></span>}
                      </div>
                    </div>
                    <button style={styles.deleteBtn} onClick={() => deleteAlert(alert.id)} title="Delete alert">✕</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* COVERAGE */}
        {tab === "coverage" && (
          <div>
            <SectionLabel>Coverage Database — {uniqueUsers.length} analysts, {users.length} ticker assignments</SectionLabel>
            {uniqueUsers.length === 0 ? (
              <EmptyState icon="👥" title="No analysts loaded" sub="Go to Setup to load your CSV" action={() => setTab("setup")} actionLabel="Setup →" />
            ) : (
              uniqueUsers.map((u, i) => (
                <div key={u.user_id} style={{ ...styles.card, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontFamily: "monospace", color: "#d69e2e", fontSize: 12, marginRight: 10 }}>{u.user_id}</span>
                      <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{u.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#4a5568" }}>{u.tickers.length} ticker{u.tickers.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {u.tickers.map(t => (
                      <div key={t.ticker} style={styles.tickerChip}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#68d391", fontSize: 13 }}>{t.ticker}</span>
                        <span style={{ fontSize: 11, color: "#718096", marginLeft: 6 }}>{t.company}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SETUP */}
        {tab === "setup" && (
          <div>
            <SectionLabel>Load Coverage Data</SectionLabel>
            <div style={styles.card}>
              <p style={styles.infoText}>Paste your CSV below. Required columns: <code style={styles.code}>user_id, name, ticker, company, industry</code></p>
              <p style={{ ...styles.infoText, color: "#718096", marginBottom: 12 }}>Add multiple rows per user to assign multiple tickers. Use <code style={styles.code}>User1</code>, <code style={styles.code}>User2</code> etc. to stay anonymous.</p>
              <textarea
                style={{ ...styles.textarea, fontFamily: "monospace", fontSize: 12, height: 200 }}
                placeholder={DEMO_CSV}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
              />
              {csvError && <div style={styles.errorMsg}>{csvError}</div>}
              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <button style={styles.primaryBtn} onClick={handleCSVLoad}>Load CSV</button>
                <button style={styles.secondaryBtn} onClick={handleLoadDemo}>Load Demo Data</button>
              </div>
            </div>

            <SectionLabel style={{ marginTop: 32 }}>CSV Format (multiple tickers per user)</SectionLabel>
            <div style={{ ...styles.card, ...styles.infoCard }}>
              <pre style={{ ...styles.code, display: "block", whiteSpace: "pre", overflowX: "auto", lineHeight: 1.8, padding: 12 }}>{DEMO_CSV}</pre>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#c53030" : "#276749" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, user, allTickers, isContacted, emailExpanded, onToggleEmail, onDismiss, onContacted, emailDraft, compact }) {
  return (
    <div style={{ ...styles.card, ...styles.alertCard, ...(isContacted ? styles.alertCardDone : {}), marginBottom: 10 }}>
      <div style={styles.alertCardTop}>
        <div style={styles.alertCardLeft}>
          <div style={styles.outreachBadge}>
            {isContacted ? "✓ Contacted" : "📣 Should you reach out?"}
          </div>
          <div style={styles.alertHeadline}>{alert?.headline}</div>
          <div style={styles.alertMeta}>
            {alert?.source && <>{alert.source} · </>}
            {timeAgo(alert?.timestamp)}
          </div>
        </div>
        <div style={styles.userChip}>
          <div style={styles.userId}>{user.user_id}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            {allTickers?.map(t => (
              <span key={t} style={styles.userTicker}>{t}</span>
            ))}
          </div>
          <div style={styles.userIndustry}>{user.industry}</div>
        </div>
      </div>

      {!compact && !isContacted && (
        <div style={styles.alertCardActions}>
          <button style={styles.actionBtn} onClick={onToggleEmail}>
            {emailExpanded ? "Hide Draft ▲" : "✉ Draft Email"}
          </button>
          <button style={{ ...styles.actionBtn, ...styles.actionBtnGreen }} onClick={onContacted}>
            Mark Contacted ✓
          </button>
          <button style={{ ...styles.actionBtn, ...styles.actionBtnGhost }} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}

      {emailExpanded && !isContacted && (
        <div style={styles.emailDraft}>
          <div style={styles.emailDraftLabel}>Draft Email</div>
          <pre style={styles.emailPre}>{emailDraft}</pre>
          <button style={styles.copyBtn} onClick={() => navigator.clipboard?.writeText(emailDraft)}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statValue, color: accent ? "#f6ad55" : "#e2e8f0" }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function SectionLabel({ children, style }) {
  return <div style={{ ...styles.sectionLabel, ...style }}>{children}</div>;
}

function EmptyState({ icon, title, sub, action, actionLabel }) {
  return (
    <div style={styles.emptyState}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptySub}>{sub}</div>
      {action && <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={action}>{actionLabel}</button>}
    </div>
  );
}

const styles = {
  root: {
    background: "#0a0e14",
    minHeight: "100vh",
    color: "#e2e8f0",
    fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
    fontSize: 14,
  },
  header: {
    background: "#0d1117",
    borderBottom: "1px solid #1e2a38",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: { display: "flex", alignItems: "baseline", gap: 10 },
  logo: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#d69e2e", letterSpacing: 2 },
  logoSub: { fontSize: 12, color: "#4a5568", letterSpacing: 1, textTransform: "uppercase" },
  headerStats: { display: "flex", gap: 24 },
  stat: { textAlign: "right" },
  statValue: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 20, lineHeight: 1 },
  statLabel: { fontSize: 10, color: "#4a5568", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  nav: {
    background: "#0d1117",
    borderBottom: "1px solid #1e2a38",
    padding: "0 24px",
    display: "flex",
    gap: 0,
    overflowX: "auto",
  },
  navBtn: {
    background: "none",
    border: "none",
    color: "#4a5568",
    padding: "12px 18px",
    cursor: "pointer",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    borderBottom: "2px solid transparent",
    whiteSpace: "nowrap",
    position: "relative",
  },
  navBtnActive: { color: "#d69e2e", borderBottomColor: "#d69e2e" },
  badge: {
    background: "#c05621",
    color: "#fff",
    borderRadius: 10,
    fontSize: 10,
    padding: "1px 5px",
    marginLeft: 6,
    fontWeight: 700,
  },
  main: { padding: "24px", maxWidth: 900, margin: "0 auto" },
  card: {
    background: "#0d1117",
    border: "1px solid #1e2a38",
    borderRadius: 6,
    padding: 16,
    marginBottom: 12,
  },
  infoCard: { borderColor: "#2d3748" },
  tickerChip: {
    background: "#161d27",
    border: "1px solid #2d3748",
    borderRadius: 4,
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#4a5568",
    marginBottom: 10,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  alertCard: { borderLeft: "3px solid #d69e2e" },
  alertCardDone: { borderLeftColor: "#276749", opacity: 0.65 },
  alertCardTop: { display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" },
  alertCardLeft: { flex: 1 },
  outreachBadge: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    color: "#f6ad55", textTransform: "uppercase", marginBottom: 4,
  },
  alertHeadline: { fontSize: 14, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 4 },
  alertMeta: { fontSize: 11, color: "#4a5568" },
  userChip: {
    background: "#161d27",
    border: "1px solid #2d3748",
    borderRadius: 4,
    padding: "8px 12px",
    textAlign: "right",
    minWidth: 110,
    flexShrink: 0,
  },
  userId: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#d69e2e", marginBottom: 4 },
  userTicker: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
    fontWeight: 700, color: "#68d391",
    background: "#0d1a12", border: "1px solid #276749",
    borderRadius: 3, padding: "1px 5px",
  },
  userIndustry: { fontSize: 10, color: "#4a5568", marginTop: 4 },
  alertCardActions: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  actionBtn: {
    background: "#161d27", border: "1px solid #2d3748",
    color: "#a0aec0", borderRadius: 4, padding: "6px 12px",
    cursor: "pointer", fontSize: 12,
  },
  actionBtnGreen: { borderColor: "#276749", color: "#68d391" },
  actionBtnGhost: { opacity: 0.5 },
  emailDraft: {
    marginTop: 14, background: "#060a0f",
    border: "1px solid #2d3748", borderRadius: 4, padding: 14,
  },
  emailDraftLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#4a5568", marginBottom: 8 },
  emailPre: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
    color: "#a0aec0", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0,
  },
  copyBtn: {
    marginTop: 10, background: "none", border: "1px solid #2d3748",
    color: "#d69e2e", padding: "5px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer",
  },
  formGroup: { marginBottom: 14 },
  label: { display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "#4a5568", marginBottom: 6 },
  input: {
    width: "100%", background: "#060a0f", border: "1px solid #2d3748",
    borderRadius: 4, padding: "8px 10px", color: "#e2e8f0", fontSize: 13,
    outline: "none", boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "#060a0f", border: "1px solid #2d3748",
    borderRadius: 4, padding: "8px 10px", color: "#e2e8f0", fontSize: 13,
    outline: "none", resize: "vertical", boxSizing: "border-box",
  },
  primaryBtn: {
    background: "#d69e2e", color: "#0a0e14", border: "none",
    borderRadius: 4, padding: "9px 18px", fontWeight: 700,
    fontSize: 13, cursor: "pointer", letterSpacing: 0.3,
  },
  secondaryBtn: {
    background: "none", color: "#a0aec0", border: "1px solid #2d3748",
    borderRadius: 4, padding: "9px 18px", fontSize: 13, cursor: "pointer",
  },
  deleteBtn: {
    background: "none", border: "none", color: "#4a5568",
    cursor: "pointer", fontSize: 14, padding: "2px 6px", flexShrink: 0,
  },
  errorMsg: { color: "#fc8181", fontSize: 12, marginTop: 8 },
  infoText: { color: "#a0aec0", fontSize: 13, lineHeight: 1.6, margin: "0 0 4px" },
  ol: { color: "#a0aec0", fontSize: 13, lineHeight: 2, paddingLeft: 20 },
  code: {
    fontFamily: "'IBM Plex Mono', monospace", background: "#161d27",
    padding: "1px 5px", borderRadius: 3, fontSize: 12, color: "#d69e2e",
  },
  emptyState: { textAlign: "center", padding: "60px 20px", color: "#4a5568" },
  emptyTitle: { fontSize: 16, color: "#718096", marginBottom: 8 },
  emptySub: { fontSize: 13, color: "#4a5568" },
  toast: {
    position: "fixed", bottom: 24, right: 24,
    padding: "12px 18px", borderRadius: 6, color: "#fff",
    fontSize: 13, fontWeight: 600, zIndex: 999,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },
};
