import { useState } from "react";

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const POSTS = ["Machine Operator", "Quality Control", "Forklift Driver", "Line Supervisor", "Safety Officer"];
const REQUIRED_PER_POST = { "Machine Operator": 3, "Quality Control": 2, "Forklift Driver": 2, "Line Supervisor": 1, "Safety Officer": 1 };

const EMPLOYEES = [
  { id: 1, name: "Ahmad Razif",     post: "Line Supervisor",   shift: "Morning", base: 2800 },
  { id: 2, name: "Nurul Ain",       post: "Quality Control",   shift: "Morning", base: 2200 },
  { id: 3, name: "Hafiz Zulkifli",  post: "Machine Operator",  shift: "Morning", base: 2000 },
  { id: 4, name: "Siti Rohani",     post: "Machine Operator",  shift: "Morning", base: 2000 },
  { id: 5, name: "Rajan Kumar",     post: "Forklift Driver",   shift: "Morning", base: 2100 },
  { id: 6, name: "Lee Wei Ming",    post: "Safety Officer",    shift: "Morning", base: 2400 },
  { id: 7, name: "Faridah Ismail",  post: "Machine Operator",  shift: "Night",   base: 2000 },
  { id: 8, name: "Zulhilmi Bakar",  post: "Quality Control",   shift: "Night",   base: 2200 },
  { id: 9, name: "Chandran Nair",   post: "Forklift Driver",   shift: "Night",   base: 2100 },
  { id: 10, name: "Rokiah Hamid",   post: "Line Supervisor",   shift: "Night",   base: 2800 },
  { id: 11, name: "Amirul Hakeem",  post: "Machine Operator",  shift: "Night",   base: 2000 },
  { id: 12, name: "Tan Bee Lian",   post: "Safety Officer",    shift: "Night",   base: 2400 },
];

const TODAY = new Date().toISOString().split("T")[0];

const INIT_ATTENDANCE = EMPLOYEES.reduce((acc, e) => {
  acc[e.id] = { status: ["Present","Present","Present","Present","Absent","Present","Present"][e.id % 7], ot: [0,1,2,0,0,1.5,0][e.id % 7] };
  return acc;
}, {});

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#0D0F14",
  panel:    "#13161E",
  border:   "#1E2330",
  accent:   "#F0A500",
  accentDim:"#F0A50022",
  green:    "#29D884",
  red:      "#FF4D6A",
  blue:     "#3D8EF0",
  muted:    "#5C6478",
  text:     "#E8EAF0",
  textDim:  "#8890A4",
};

const css = {
  app: {
    minHeight: "100vh",
    background: C.bg,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    color: C.text,
    paddingBottom: 40,
  },
  header: {
    background: C.panel,
    borderBottom: `1px solid ${C.border}`,
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 60,
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 3,
    color: C.accent,
    textTransform: "uppercase",
  },
  badge: (color) => ({
    background: color + "22",
    color: color,
    border: `1px solid ${color}55`,
    borderRadius: 4,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
  }),
  nav: {
    display: "flex",
    gap: 4,
    padding: "12px 24px",
    borderBottom: `1px solid ${C.border}`,
    background: C.panel,
    overflowX: "auto",
  },
  navBtn: (active) => ({
    background: active ? C.accentDim : "transparent",
    color: active ? C.accent : C.textDim,
    border: `1px solid ${active ? C.accent + "55" : "transparent"}`,
    borderRadius: 4,
    padding: "6px 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  }),
  page: { padding: "24px 24px 0" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  card: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 20,
  },
  statCard: (accent) => ({
    background: C.panel,
    border: `1px solid ${accent}33`,
    borderRadius: 8,
    padding: 20,
    borderLeft: `3px solid ${accent}`,
  }),
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 3,
    color: C.textDim,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  alert: {
    background: C.red + "15",
    border: `1px solid ${C.red}44`,
    borderRadius: 6,
    padding: "10px 16px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: C.textDim,
    fontWeight: 700,
    letterSpacing: 1.5,
    fontSize: 10,
    textTransform: "uppercase",
    borderBottom: `1px solid ${C.border}`,
  },
  td: {
    padding: "10px 12px",
    borderBottom: `1px solid ${C.border}11`,
    verticalAlign: "middle",
  },
  input: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.text,
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "inherit",
    outline: "none",
  },
  btn: (color = C.accent) => ({
    background: color + "22",
    color: color,
    border: `1px solid ${color}55`,
    borderRadius: 4,
    padding: "7px 16px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: "inherit",
  }),
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const statusColor = (s) => s === "Present" ? C.green : s === "Absent" ? C.red : C.accent;
const shiftColor  = (s) => s === "Morning" ? C.accent : C.blue;

function getCoverage(employees, attendance) {
  const alerts = [];
  ["Morning","Night"].forEach(shift => {
    POSTS.forEach(post => {
      const required = REQUIRED_PER_POST[post] || 1;
      const present  = employees.filter(e =>
        e.shift === shift &&
        e.post  === post &&
        attendance[e.id]?.status === "Present"
      ).length;
      if (present < required) {
        alerts.push({ shift, post, present, required, shortage: required - present });
      }
    });
  });
  return alerts;
}

function calcPayroll(employee, attendance) {
  const OT_RATE   = employee.base / 26 / 8 * 1.5;
  const DAILY_RATE = employee.base / 26;
  const rec  = attendance[employee.id] || {};
  const otPay = (rec.ot || 0) * OT_RATE;
  const deduc = rec.status === "Absent" ? DAILY_RATE : 0;
  return {
    base:  employee.base,
    ot:    +otPay.toFixed(2),
    deduct:+deduc.toFixed(2),
    total: +(employee.base + otPay - deduc).toFixed(2),
  };
}

// ─── SUBCOMPONENTS ────────────────────────────────────────────────────────────
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
    <div style={{ ...css.alert, background: C.green+"15", border:`1px solid ${C.green}44` }}>
      <span style={{ color: C.green, fontSize: 16 }}>✓</span>
      <span style={{ color: C.green, fontSize: 12 }}>All posts fully covered for both shifts today.</span>
    </div>
  );
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} style={css.alert}>
          <span style={{ color: C.red, fontSize: 16 }}>⚠</span>
          <span style={{ color: C.red }}>
            <strong>[{a.shift.toUpperCase()}]</strong> {a.post} — {a.shortage} person{a.shortage > 1 ? "s" : ""} short ({a.present}/{a.required} present)
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
function DashboardView({ employees, attendance }) {
  const present   = employees.filter(e => attendance[e.id]?.status === "Present").length;
  const absent    = employees.filter(e => attendance[e.id]?.status === "Absent").length;
  const morningOn = employees.filter(e => e.shift === "Morning" && attendance[e.id]?.status === "Present").length;
  const nightOn   = employees.filter(e => e.shift === "Night"   && attendance[e.id]?.status === "Present").length;
  const alerts    = getCoverage(employees, attendance);

  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>
          DAILY OVERVIEW · {new Date().toLocaleDateString("en-MY", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Operations Dashboard</div>
      </div>

      <div style={{ ...css.grid4, marginBottom: 20 }}>
        <StatCard label="Total Staff"    value={employees.length}  sub="Registered"           accent={C.blue}   />
        <StatCard label="Present Today"  value={present}           sub={`${absent} absent`}   accent={C.green}  />
        <StatCard label="Morning Shift"  value={morningOn}         sub="Active now"           accent={C.accent} />
        <StatCard label="Night Shift"    value={nightOn}           sub="Active now"           accent={C.blue}   />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Coverage Alerts</div>
        <AlertBanner alerts={alerts} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Shift Summary</div>
        <div style={css.grid2}>
          {["Morning","Night"].map(shift => {
            const sEmp = employees.filter(e => e.shift === shift);
            const sPresent = sEmp.filter(e => attendance[e.id]?.status === "Present").length;
            return (
              <div key={shift} style={css.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{shift} Shift</span>
                  <span style={css.badge(shiftColor(shift))}>{sPresent}/{sEmp.length}</span>
                </div>
                {POSTS.map(post => {
                  const req  = REQUIRED_PER_POST[post] || 1;
                  const pres = sEmp.filter(e => e.post===post && attendance[e.id]?.status==="Present").length;
                  const pct  = Math.min(100, (pres/req)*100);
                  const col  = pres >= req ? C.green : pres > 0 ? C.accent : C.red;
                  return (
                    <div key={post} style={{ marginBottom: 8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:3 }}>
                        <span style={{ color: C.textDim }}>{post}</span>
                        <span style={{ color: col, fontWeight:700 }}>{pres}/{req}</span>
                      </div>
                      <div style={{ height:3, background: C.border, borderRadius:2 }}>
                        <div style={{ height:3, width:`${pct}%`, background:col, borderRadius:2, transition:"width 0.3s" }} />
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

  const filtered = filterShift === "All" ? employees : employees.filter(e => e.shift === filterShift);

  const toggle = (id, field, value) => {
    setAttendance(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  return (
    <div style={css.page}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>ATTENDANCE LOG</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Daily Attendance · {TODAY}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {["All","Morning","Night"].map(s => (
            <button key={s} style={css.navBtn(filterShift===s)} onClick={() => setFilterShift(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={css.table}>
          <thead>
            <tr>
              {["Name","Post","Shift","Status","OT Hours","Action"].map(h => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => {
              const rec = attendance[emp.id] || { status:"Present", ot:0 };
              return (
                <tr key={emp.id} style={{ background: rec.status==="Absent" ? C.red+"08" : "transparent" }}>
                  <td style={css.td}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{emp.name}</div>
                    <div style={{ fontSize:10, color:C.textDim }}>ID #{String(emp.id).padStart(3,"0")}</div>
                  </td>
                  <td style={css.td}><span style={{ fontSize:11, color:C.textDim }}>{emp.post}</span></td>
                  <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                  <td style={css.td}><span style={css.badge(statusColor(rec.status))}>{rec.status}</span></td>
                  <td style={css.td}>
                    <input
                      type="number" min="0" max="12" step="0.5"
                      value={rec.ot || 0}
                      onChange={e => toggle(emp.id, "ot", +e.target.value)}
                      style={{ ...css.input, width:60, textAlign:"center" }}
                    />
                  </td>
                  <td style={css.td}>
                    <div style={{ display:"flex", gap:6 }}>
                      {["Present","Absent","Leave"].map(s => (
                        <button
                          key={s}
                          style={{ ...css.btn(statusColor(s)), opacity: rec.status===s ? 1 : 0.35, padding:"4px 10px", fontSize:10 }}
                          onClick={() => toggle(emp.id, "status", s)}
                        >{s}</button>
                      ))}
                    </div>
                  </td>
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
  const rows = employees.map(e => ({ emp: e, pay: calcPayroll(e, attendance) }));
  const totalPayroll = rows.reduce((s, r) => s + r.pay.total, 0);
  const totalOT      = rows.reduce((s, r) => s + r.pay.ot, 0);

  return (
    <div style={css.page}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>PAYROLL</div>
        <div style={{ fontSize:22, fontWeight:700 }}>Salary Calculation</div>
      </div>

      <div style={{ ...css.grid4, marginBottom:20 }}>
        <StatCard label="Total Payroll"   value={`RM ${totalPayroll.toLocaleString("en-MY",{minimumFractionDigits:2})}`}   sub="This month est." accent={C.green}  />
        <StatCard label="Total OT Cost"   value={`RM ${totalOT.toLocaleString("en-MY",{minimumFractionDigits:2})}`}         sub="Overtime"         accent={C.accent} />
        <StatCard label="Staff on Payroll" value={employees.length}  sub="Active"           accent={C.blue}   />
        <StatCard label="OT Rate"         value="1.5×"                sub="Daily rate basis" accent={C.textDim}/>
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={css.table}>
          <thead>
            <tr>{["Employee","Post","Shift","Base Salary","OT Pay","Deductions","Total"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ emp, pay }) => (
              <tr key={emp.id}>
                <td style={css.td}>
                  <div style={{ fontWeight:700 }}>{emp.name}</div>
                  <div style={{ fontSize:10, color:C.textDim }}>#{String(emp.id).padStart(3,"0")}</div>
                </td>
                <td style={css.td}><span style={{ fontSize:11, color:C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td} align="right"><span style={{ color:C.text }}>RM {pay.base.toLocaleString()}</span></td>
                <td style={css.td} align="right"><span style={{ color:C.green }}>+ RM {pay.ot.toFixed(2)}</span></td>
                <td style={css.td} align="right"><span style={{ color: pay.deduct>0?C.red:C.textDim }}>{ pay.deduct > 0 ? `- RM ${pay.deduct.toFixed(2)}` : "—" }</span></td>
                <td style={css.td} align="right"><strong style={{ color:C.accent, fontSize:14 }}>RM {pay.total.toLocaleString("en-MY",{minimumFractionDigits:2})}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop:`2px solid ${C.border}` }}>
              <td colSpan={6} style={{ ...css.td, textAlign:"right", color:C.textDim, fontSize:11, letterSpacing:2, textTransform:"uppercase" }}>Total Payroll</td>
              <td style={css.td} align="right"><strong style={{ color:C.green, fontSize:16 }}>RM {totalPayroll.toLocaleString("en-MY",{minimumFractionDigits:2})}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StaffView({ employees, setEmployees }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", post:POSTS[0], shift:"Morning", base:2000 });

  const addEmp = () => {
    if (!form.name.trim()) return;
    setEmployees(prev => [...prev, { id: Date.now(), ...form, base: +form.base }]);
    setForm({ name:"", post:POSTS[0], shift:"Morning", base:2000 });
    setShowForm(false);
  };

  return (
    <div style={css.page}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>WORKFORCE</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Staff Directory</div>
        </div>
        <button style={css.btn(C.green)} onClick={() => setShowForm(v=>!v)}>+ Add Employee</button>
      </div>

      {showForm && (
        <div style={{ ...css.card, marginBottom:20, borderColor:C.green+"44" }}>
          <div style={css.sectionTitle}>New Employee</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
            <div>
              <div style={{ fontSize:10, color:C.textDim, marginBottom:4, letterSpacing:1 }}>FULL NAME</div>
              <input style={{ ...css.input, width:"100%", boxSizing:"border-box" }} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ahmad bin Ali" />
            </div>
            <div>
              <div style={{ fontSize:10, color:C.textDim, marginBottom:4, letterSpacing:1 }}>POST / ROLE</div>
              <select style={{ ...css.input, width:"100%", boxSizing:"border-box" }} value={form.post} onChange={e=>setForm(f=>({...f,post:e.target.value}))}>
                {POSTS.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:C.textDim, marginBottom:4, letterSpacing:1 }}>SHIFT</div>
              <select style={{ ...css.input, width:"100%", boxSizing:"border-box" }} value={form.shift} onChange={e=>setForm(f=>({...f,shift:e.target.value}))}>
                <option>Morning</option><option>Night</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:C.textDim, marginBottom:4, letterSpacing:1 }}>BASE SALARY (RM)</div>
              <input type="number" style={{ ...css.input, width:"100%", boxSizing:"border-box" }} value={form.base} onChange={e=>setForm(f=>({...f,base:e.target.value}))} />
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14 }}>
            <button style={css.btn(C.green)} onClick={addEmp}>Save Employee</button>
            <button style={css.btn(C.red)} onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ overflowX:"auto" }}>
        <table style={css.table}>
          <thead>
            <tr>{["#","Name","Post / Role","Shift","Base Salary","Edit Role"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {employees.map((emp,i) => (
              <tr key={emp.id}>
                <td style={{ ...css.td, color:C.textDim, fontSize:11 }}>{String(i+1).padStart(2,"0")}</td>
                <td style={css.td}><strong>{emp.name}</strong></td>
                <td style={css.td}>
                  <select
                    value={emp.post}
                    onChange={e => setEmployees(prev => prev.map(x => x.id===emp.id ? {...x, post:e.target.value} : x))}
                    style={{ ...css.input, fontSize:11, padding:"4px 8px" }}
                  >
                    {POSTS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </td>
                <td style={css.td}>
                  <select
                    value={emp.shift}
                    onChange={e => setEmployees(prev => prev.map(x => x.id===emp.id ? {...x, shift:e.target.value} : x))}
                    style={{ ...css.input, fontSize:11, padding:"4px 8px" }}
                  >
                    <option>Morning</option><option>Night</option>
                  </select>
                </td>
                <td style={css.td}><span style={{ color:C.accent }}>RM {emp.base.toLocaleString()}</span></td>
                <td style={css.td}><span style={{ fontSize:10, color:C.green }}>✓ Live</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TechPlanView() {
  const sections = [
    {
      title: "Recommended Tech Stack",
      color: C.accent,
      items: [
        { label: "Frontend", value: "React + Vite", note: "Fast setup, beginner-friendly" },
        { label: "UI Library", value: "shadcn/ui + Tailwind CSS", note: "Pre-built components" },
        { label: "Backend/DB", value: "Supabase (PostgreSQL)", note: "Free tier, auth included, real-time" },
        { label: "Hosting", value: "Vercel", note: "Free, GitHub auto-deploy in minutes" },
        { label: "State Mgmt", value: "Zustand or React Context", note: "Simple for this scope" },
        { label: "PDF Reports", value: "react-pdf or jsPDF", note: "Monthly report generation" },
      ]
    },
    {
      title: "Database Schema (Supabase/PostgreSQL)",
      color: C.blue,
      items: [
        { label: "employees", value: "id, name, employee_code, base_salary, created_at" },
        { label: "posts", value: "id, name, required_count_morning, required_count_night" },
        { label: "employee_assignments", value: "id, employee_id, post_id, shift, valid_from, valid_to (supports mid-month role changes)" },
        { label: "attendance_logs", value: "id, employee_id, date, status [Present/Absent/Leave], ot_hours, notes" },
        { label: "payroll_records", value: "id, employee_id, month, year, base_salary, ot_pay, deductions, total, generated_at" },
        { label: "monthly_reports", value: "id, month, year, report_json, pdf_url, created_at" },
      ]
    },
    {
      title: "Step-by-Step Build Order",
      color: C.green,
      items: [
        { label: "Step 1", value: "npx create-vite@latest facility-app --template react", note: "Scaffold project" },
        { label: "Step 2", value: "npm install @supabase/supabase-js zustand react-router-dom", note: "Core deps" },
        { label: "Step 3", value: "Create Supabase project → run schema SQL → paste API keys in .env", note: "" },
        { label: "Step 4", value: "Build AuthContext + login page (Supabase handles this)", note: "~1 hour" },
        { label: "Step 5", value: "Build Employees CRUD page (this dashboard's Staff tab)", note: "" },
        { label: "Step 6", value: "Build Attendance page with daily log + OT input", note: "" },
        { label: "Step 7", value: "Add coverage check logic (SQL view or JS function)", note: "" },
        { label: "Step 8", value: "Build Payroll calculator page", note: "" },
        { label: "Step 9", value: "Supabase Edge Function: auto-generate monthly report (CRON)", note: "" },
        { label: "Step 10", value: "Deploy to Vercel via GitHub push", note: "~5 minutes" },
      ]
    },
    {
      title: "Key SQL Snippet: Mid-Month Role Tracking",
      color: C.red,
      items: [
        { label: "Query", value: "SELECT e.*, p.name AS post FROM employee_assignments a JOIN employees e ON e.id = a.employee_id JOIN posts p ON p.id = a.post_id WHERE a.valid_from <= NOW() AND (a.valid_to IS NULL OR a.valid_to >= NOW())", note: "Gets current active assignment per employee" },
      ]
    },
  ];

  return (
    <div style={css.page}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>TECHNICAL BLUEPRINT</div>
        <div style={{ fontSize:22, fontWeight:700 }}>Build Plan & Architecture</div>
      </div>
      {sections.map(sec => (
        <div key={sec.title} style={{ ...css.card, marginBottom:16, borderLeft:`3px solid ${sec.color}` }}>
          <div style={{ fontWeight:700, fontSize:13, color:sec.color, marginBottom:14, letterSpacing:1 }}>{sec.title}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {sec.items.map((item,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"140px 1fr", gap:12, borderBottom:`1px solid ${C.border}33`, paddingBottom:8 }}>
                <span style={{ fontSize:10, color:C.textDim, fontWeight:700, letterSpacing:1, textTransform:"uppercase", paddingTop:1 }}>{item.label}</span>
                <div>
                  <span style={{ fontSize:12, color:C.text, fontFamily:"'DM Mono', monospace" }}>{item.value}</span>
                  {item.note && <span style={{ fontSize:11, color:C.textDim, marginLeft:8 }}>— {item.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [employees, setEmployees] = useState(EMPLOYEES);
  const [attendance, setAttendance] = useState(INIT_ATTENDANCE);
  const alerts = getCoverage(employees, attendance);

  const TABS = [
    { id:"dashboard",  label:"Dashboard"   },
    { id:"attendance", label:"Attendance"  },
    { id:"staff",      label:"Staff"       },
    { id:"payroll",    label:"Payroll"     },
    { id:"techplan",   label:"Tech Plan"   },
  ];

  return (
    <div style={css.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background: #0D0F14; }
        ::-webkit-scrollbar-thumb { background: #2a2f3e; border-radius:2px; }
        select option { background: #13161E; color: #E8EAF0; }
        input[type=number]::-webkit-inner-spin-button { opacity:0.3; }
      `}</style>

      <header style={css.header}>
        <div style={css.logo}>⚙ FacilityOS</div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {alerts.length > 0 && (
            <span style={{ ...css.badge(C.red), animation:"pulse 2s infinite" }}>
              ⚠ {alerts.length} Alert{alerts.length>1?"s":""}
            </span>
          )}
          <span style={css.badge(C.green)}>LIVE</span>
        </div>
      </header>

      <nav style={css.nav}>
        {TABS.map(t => (
          <button key={t.id} style={css.navBtn(tab===t.id)} onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard"  && <DashboardView  employees={employees} attendance={attendance} />}
      {tab === "attendance" && <AttendanceView employees={employees} attendance={attendance} setAttendance={setAttendance} />}
      {tab === "staff"      && <StaffView      employees={employees} setEmployees={setEmployees} />}
      {tab === "payroll"    && <PayrollView    employees={employees} attendance={attendance} />}
      {tab === "techplan"   && <TechPlanView />}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.5; }
        }
      `}</style>
    </div>
  );
}
