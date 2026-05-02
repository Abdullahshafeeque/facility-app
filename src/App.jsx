import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

const POSTS = ["Machine Operator", "Quality Control", "Forklift Driver", "Line Supervisor", "Safety Officer"];
const REQUIRED_PER_POST = { "Machine Operator": 3, "Quality Control": 2, "Forklift Driver": 2, "Line Supervisor": 1, "Safety Officer": 1 };

const C = {
  bg: "#F4F6F9", panel: "#FFFFFF", border: "#E2E8F0", accent: "#1E6FDB",
  accentDim: "#1E6FDB22", green: "#16A34A", red: "#DC2626", blue: "#2563EB",
  muted: "#94A3B8", text: "#1E293B", textDim: "#64748B",
};

const css = {
  app: { minHeight: "100vh", background: C.bg, fontFamily: "'DM Mono', 'Courier New', monospace", color: C.text, paddingBottom: 40 },
  header: { background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 },
  logo: { fontSize: 13, fontWeight: 700, letterSpacing: 3, color: C.accent, textTransform: "uppercase" },
  badge: (color) => ({ background: color + "22", color: color, border: `1px solid ${color}55`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }),
  nav: { display: "flex", gap: 4, padding: "12px 24px", borderBottom: `1px solid ${C.border}`, background: C.panel, overflowX: "auto" },
  navBtn: (active) => ({ background: active ? C.accentDim : "transparent", color: active ? C.accent : C.textDim, border: `1px solid ${active ? C.accent + "55" : "transparent"}`, borderRadius: 4, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }),
  page: { padding: "24px 24px 0" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  card: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 },
  statCard: (accent) => ({ background: C.panel, border: `1px solid ${accent}33`, borderRadius: 8, padding: 20, borderLeft: `3px solid ${accent}` }),
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.textDim, textTransform: "uppercase", marginBottom: 16 },
  alert: { background: C.red + "15", border: `1px solid ${C.red}44`, borderRadius: 6, padding: "10px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "10px 12px", color: C.textDim, fontWeight: 700, letterSpacing: 1.5, fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` },
  td: { padding: "10px 12px", borderBottom: `1px solid ${C.border}11`, verticalAlign: "middle" },
  input: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" },
  btn: (color = C.accent) => ({ background: color + "22", color: color, border: `1px solid ${color}55`, borderRadius: 4, padding: "7px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
};

const statusColor = (s) => s === "Present" ? C.green : s === "Absent" ? C.red : C.accent;
const shiftColor = (s) => s === "Morning" ? C.accent : C.blue;

function getCoverage(employees, attendance) {
  const alerts = [];
  ["Morning", "Night"].forEach(shift => {
    POSTS.forEach(post => {
      const required = REQUIRED_PER_POST[post] || 1;
      const present = employees.filter(e => e.shift === shift && e.post === post && attendance[e.id]?.status === "Present").length;
      if (present < required) alerts.push({ shift, post, present, required, shortage: required - present });
    });
  });
  return alerts;
}

function calcPayroll(employee, attendance) {
  const dailyRate = employee.base_salary / 26;
  const hourlyRate = dailyRate / 12;
  const OT_RATE = hourlyRate * 1.5;
  const rec = attendance[employee.id] || {};
  const otPay = (rec.ot_hours || 0) * OT_RATE;
  const deduc = rec.status === "Absent" ? dailyRate : 0;
  return { base: employee.base_salary, ot: +otPay.toFixed(2), deduct: +deduc.toFixed(2), total: +(employee.base_salary + otPay - deduc).toFixed(2) };
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={css.statCard(accent)}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts.length) return (
    <div style={{ ...css.alert, background: C.green + "15", border: `1px solid ${C.green}44` }}>
      <span style={{ color: C.green, fontSize: 16 }}>✓</span>
      <span style={{ color: C.green, fontSize: 12 }}>All posts fully covered for both shifts today.</span>
    </div>
  );
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} style={css.alert}>
          <span style={{ color: C.red, fontSize: 16 }}>⚠</span>
          <span style={{ color: C.red }}><strong>[{a.shift.toUpperCase()}]</strong> {a.post} — {a.shortage} person{a.shortage > 1 ? "s" : ""} short ({a.present}/{a.required} present)</span>
        </div>
      ))}
    </div>
  );
}

function DashboardView({ employees, attendance }) {
  const active = employees.filter(e => e.status === "active");
  const present = active.filter(e => attendance[e.id]?.status === "Present").length;
  const absent = active.filter(e => attendance[e.id]?.status === "Absent").length;
  const morningOn = active.filter(e => e.shift === "Morning" && attendance[e.id]?.status === "Present").length;
  const nightOn = active.filter(e => e.shift === "Night" && attendance[e.id]?.status === "Present").length;
  const alerts = getCoverage(active, attendance);
  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>DAILY OVERVIEW · {new Date().toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Operations Dashboard</div>
      </div>
      <div style={{ ...css.grid4, marginBottom: 20 }}>
        <StatCard label="Active Staff" value={active.length} sub="Working here" accent={C.blue} />
        <StatCard label="Present Today" value={present} sub={`${absent} absent`} accent={C.green} />
        <StatCard label="Morning Shift" value={morningOn} sub="Active now" accent={C.accent} />
        <StatCard label="Night Shift" value={nightOn} sub="Active now" accent={C.blue} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Coverage Alerts</div>
        <AlertBanner alerts={alerts} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Shift Summary</div>
        <div style={css.grid2}>
          {["Morning", "Night"].map(shift => {
            const sEmp = active.filter(e => e.shift === shift);
            const sPresent = sEmp.filter(e => attendance[e.id]?.status === "Present").length;
            return (
              <div key={shift} style={css.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{shift} Shift</span>
                  <span style={css.badge(shiftColor(shift))}>{sPresent}/{sEmp.length}</span>
                </div>
                {POSTS.map(post => {
                  const req = REQUIRED_PER_POST[post] || 1;
                  const pres = sEmp.filter(e => e.post === post && attendance[e.id]?.status === "Present").length;
                  const pct = Math.min(100, (pres / req) * 100);
                  const col = pres >= req ? C.green : pres > 0 ? C.accent : C.red;
                  return (
                    <div key={post} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: C.textDim }}>{post}</span>
                        <span style={{ color: col, fontWeight: 700 }}>{pres}/{req}</span>
                      </div>
                      <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
                        <div style={{ height: 3, width: `${pct}%`, background: col, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttendanceView({ employees, attendance, setAttendance }) {
  const [filterShift, setFilterShift] = useState("All");
  const active = employees.filter(e => e.status === "active");
  const filtered = filterShift === "All" ? active : active.filter(e => e.shift === filterShift);
  const today = new Date().toISOString().split("T")[0];

  const toggle = async (id, field, value) => {
    setAttendance(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    const existing = attendance[id];
    if (existing?.dbId) {
      await supabase.from("attendance").update({ [field === "status" ? "status" : "ot_hours"]: value }).eq("id", existing.dbId);
    } else {
      const { data } = await supabase.from("attendance").insert({ employee_id: id, date: today, status: field === "status" ? value : "Present", ot_hours: field === "ot_hours" ? value : 0 }).select().single();
      if (data) setAttendance(prev => ({ ...prev, [id]: { ...prev[id], dbId: data.id } }));
    }
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>ATTENDANCE LOG</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Daily Attendance · {today}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["All", "Morning", "Night"].map(s => <button key={s} style={css.navBtn(filterShift === s)} onClick={() => setFilterShift(s)}>{s}</button>)}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr>{["Name", "Post", "Shift", "Status", "OT Hours", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(emp => {
              const rec = attendance[emp.id] || { status: "Present", ot_hours: 0 };
              return (
                <tr key={emp.id} style={{ background: rec.status === "Absent" ? C.red + "08" : "transparent" }}>
                  <td style={css.td}><div style={{ fontWeight: 700 }}>{emp.name}</div></td>
                  <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                  <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                  <td style={css.td}><span style={css.badge(statusColor(rec.status))}>{rec.status}</span></td>
                  <td style={css.td}><input type="number" min="0" max="12" step="0.5" value={rec.ot_hours || 0} onChange={e => toggle(emp.id, "ot_hours", +e.target.value)} style={{ ...css.input, width: 60, textAlign: "center" }} /></td>
                  <td style={css.td}><div style={{ display: "flex", gap: 6 }}>{["Present", "Absent", "Leave"].map(s => <button key={s} style={{ ...css.btn(statusColor(s)), opacity: rec.status === s ? 1 : 0.35, padding: "4px 10px", fontSize: 10 }} onClick={() => toggle(emp.id, "status", s)}>{s}</button>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayrollView({ employees, attendance }) {
  const active = employees.filter(e => e.status === "active");
  const rows = active.map(e => ({ emp: e, pay: calcPayroll(e, attendance) }));
  const totalPayroll = rows.reduce((s, r) => s + r.pay.total, 0);
  const totalOT = rows.reduce((s, r) => s + r.pay.ot, 0);
  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>PAYROLL</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Salary Calculation</div>
      </div>
      <div style={{ ...css.grid4, marginBottom: 20 }}>
        <StatCard label="Total Payroll" value={`RM ${totalPayroll.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`} sub="This month est." accent={C.green} />
        <StatCard label="Total OT Cost" value={`RM ${totalOT.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`} sub="Overtime" accent={C.accent} />
        <StatCard label="Staff on Payroll" value={active.length} sub="Active" accent={C.blue} />
        <StatCard label="OT Rate" value="1.5×" sub="Per hour basis" accent={C.textDim} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr>{["Employee", "Post", "Shift", "Base Salary", "OT Pay", "Deductions", "Total"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ emp, pay }) => (
              <tr key={emp.id}>
                <td style={css.td}><div style={{ fontWeight: 700 }}>{emp.name}</div></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td} align="right"><span style={{ color: C.text }}>RM {pay.base.toLocaleString()}</span></td>
                <td style={css.td} align="right"><span style={{ color: C.green }}>+ RM {pay.ot.toFixed(2)}</span></td>
                <td style={css.td} align="right"><span style={{ color: pay.deduct > 0 ? C.red : C.textDim }}>{pay.deduct > 0 ? `- RM ${pay.deduct.toFixed(2)}` : "—"}</span></td>
                <td style={css.td} align="right"><strong style={{ color: C.accent, fontSize: 14 }}>RM {pay.total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td colSpan={6} style={{ ...css.td, textAlign: "right", color: C.textDim, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Total Payroll</td>
              <td style={css.td} align="right"><strong style={{ color: C.green, fontSize: 16 }}>RM {totalPayroll.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StaffView({ employees, setEmployees }) {
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ name: "", post: POSTS[0], shift: "Morning", base_salary: "" });
  const [loading, setLoading] = useState(false);

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");

  const addEmp = async () => {
    if (!form.name.trim() || !form.base_salary) return;
    setLoading(true);
    const { data, error } = await supabase.from("employees").insert({
      name: form.name, post: form.post, shift: form.shift, base_salary: +form.base_salary, status: "active"
    }).select().single();
    if (!error && data) {
      setEmployees(prev => [...prev, data]);
      setForm({ name: "", post: POSTS[0], shift: "Morning", base_salary: "" });
      setShowForm(false);
    }
    setLoading(false);
  };

  const markInactive = async (emp) => {
    if (!window.confirm(`Mark ${emp.name} as left/inactive?`)) return;
    await supabase.from("employees").update({ status: "inactive" }).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "inactive" } : e));
  };

  const reactivate = async (emp) => {
    await supabase.from("employees").update({ status: "active" }).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "active" } : e));
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>WORKFORCE</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Staff Directory</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={css.btn(C.textDim)} onClick={() => setShowInactive(v => !v)}>{showInactive ? "Hide" : "Show"} Inactive ({inactive.length})</button>
          <button style={css.btn(C.green)} onClick={() => setShowForm(v => !v)}>+ Add Employee</button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, borderColor: C.green + "44" }}>
          <div style={css.sectionTitle}>New Employee</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FULL NAME</div>
              <input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST / ROLE</div>
              <select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.post} onChange={e => setForm(f => ({ ...f, post: e.target.value }))}>
                {POSTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SHIFT</div>
              <select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                <option>Morning</option><option>Night</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>BASE SALARY (RM)</div>
              <input type="number" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="e.g. 2000" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addEmp} disabled={loading}>{loading ? "Saving..." : "Save Employee"}</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Active Staff ({active.length})</div>
      <div style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={css.table}>
          <thead><tr>{["Name", "Post / Role", "Shift", "Base Salary", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {active.length === 0 && (
              <tr><td colSpan={5} style={{ ...css.td, color: C.textDim, textAlign: "center", padding: 30 }}>No active employees. Add one above!</td></tr>
            )}
            {active.map(emp => (
              <tr key={emp.id}>
                <td style={css.td}><strong>{emp.name}</strong></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td}><span style={{ color: C.accent }}>RM {Number(emp.base_salary).toLocaleString()}</span></td>
                <td style={css.td}>
                  <button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => markInactive(emp)}>Mark as Left</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInactive && (
        <>
          <div style={css.sectionTitle}>Inactive / Left Staff ({inactive.length})</div>
          <div style={{ overflowX: "auto" }}>
            <table style={css.table}>
              <thead><tr>{["Name", "Post / Role", "Shift", "Base Salary", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {inactive.length === 0 && (
                  <tr><td colSpan={5} style={{ ...css.td, color: C.textDim, textAlign: "center", padding: 30 }}>No inactive employees.</td></tr>
                )}
                {inactive.map(emp => (
                  <tr key={emp.id} style={{ opacity: 0.5 }}>
                    <td style={css.td}><strong>{emp.name}</strong></td>
                    <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                    <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                    <td style={css.td}><span style={{ color: C.accent }}>RM {Number(emp.base_salary).toLocaleString()}</span></td>
                    <td style={css.td}>
                      <button style={{ ...css.btn(C.green), padding: "4px 10px", fontSize: 10 }} onClick={() => reactivate(emp)}>Reactivate</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);
      const { data: emps } = await supabase.from("employees").select("*").order("name");
      if (emps) setEmployees(emps);

      const today = new Date().toISOString().split("T")[0];
      const { data: att } = await supabase.from("attendance").select("*").eq("date", today);
      if (att) {
        const attMap = {};
        att.forEach(a => { attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours, dbId: a.id }; });
        setAttendance(attMap);
      }
      setLoading(false);
    };
    loadData();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;

  const alerts = getCoverage(employees.filter(e => e.status === "active"), attendance);

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "attendance", label: "Attendance" },
    { id: "staff", label: "Staff" },
    { id: "payroll", label: "Payroll" },
  ];

  return (
    <div style={css.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background: #F4F6F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius:2px; }
        select option { background: #FFFFFF; color: #1E293B; }
      `}</style>
      <header style={css.header}>
        <div style={css.logo}>⚙ FacilityOS</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>{user.email}</span>
          {alerts.length > 0 && <span style={css.badge(C.red)}>⚠ {alerts.length} Alert{alerts.length > 1 ? "s" : ""}</span>}
          <span style={css.badge(C.green)}>LIVE</span>
          <button onClick={handleSignOut} style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }}>Sign Out</button>
        </div>
      </header>
      <nav style={css.nav}>
        {TABS.map(t => <button key={t.id} style={css.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: C.textDim }}>Loading data...</div>
      ) : (
        <>
          {tab === "dashboard" && <DashboardView employees={employees} attendance={attendance} />}
          {tab === "attendance" && <AttendanceView employees={employees} attendance={attendance} setAttendance={setAttendance} />}
          {tab === "staff" && <StaffView employees={employees} setEmployees={setEmployees} />}
          {tab === "payroll" && <PayrollView employees={employees} attendance={attendance} />}
        </>
      )}
    </div>
  );
}