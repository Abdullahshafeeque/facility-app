import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

const C = {
  bg: "#F4F6F9", panel: "#FFFFFF", border: "#E2E8F0", accent: "#1E6FDB",
  accentDim: "#1E6FDB22", green: "#16A34A", red: "#DC2626", blue: "#2563EB",
  purple: "#7C3AED", orange: "#EA580C",
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
  td: { padding: "10px 12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" },
  input: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" },
  btn: (color = C.accent) => ({ background: color + "22", color: color, border: `1px solid ${color}55`, borderRadius: 4, padding: "7px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
};

const statusColor = (s) => s === "Present" ? C.green : s === "Absent" ? C.red : C.accent;
const shiftColor = (s) => s === "Morning" ? C.accent : C.blue;
const staffTypeColor = (t) => t === "company" ? C.blue : C.green;

const getLocalDateStr = (d = new Date()) => {
  const dt = new Date(d);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().split("T")[0];
};

const todayStr = getLocalDateStr();

function getCoverage(employees, attendance, posts) {
  if (!posts || posts.length === 0) return [];
  const alerts = [];
  ["Morning", "Night"].forEach(shift => {
    posts.forEach(post => {
      const required = shift === "Morning" ? post.required_morning : post.required_night;
      const present = employees.filter(e => e.shift === shift && e.post === post.name && attendance[e.id]?.status === "Present").length;
      if (present < required) alerts.push({ shift, post: post.name, present, required, shortage: required - present });
    });
  });
  return alerts;
}

// Calculate working days in a month from joining_date to end of month (or today)
function getWorkingDaysInMonth(joiningDate, monthStart, monthEnd) {
  const start = joiningDate > monthStart ? joiningDate : monthStart;
  const end = monthEnd < todayStr ? monthEnd : todayStr;
  if (start > end) return 0;
  const s = new Date(start), e = new Date(end);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function getEffectiveSalary(employee, posts) {
  if (employee.staff_type === "contract") {
    const post = posts.find(p => p.name === employee.post);
    return post?.contract_salary || 0;
  }
  return employee.base_salary || 0;
}

// Pro-rated salary based on joining date
function getProratedSalary(employee, posts, monthStart, monthEnd) {
  const fullSalary = getEffectiveSalary(employee, posts);
  const joiningDate = employee.joining_date || monthStart;
  const workingDays = getWorkingDaysInMonth(joiningDate, monthStart, monthEnd);
  const totalDays = getWorkingDaysInMonth(monthStart, monthStart, monthEnd);
  if (totalDays === 0) return fullSalary;
  return (fullSalary / 26) * Math.min(workingDays, 26);
}

function calcFinances(employee, posts, rangeAttendance, ledger, start, end) {
  const fullSalary = getEffectiveSalary(employee, posts);
  const dailyRate = fullSalary / 26;
  const hourlyRate = dailyRate / 12;

  // Pro-rate based on joining date
  const joiningDate = employee.joining_date || start;
  const effectiveStart = joiningDate > start ? joiningDate : start;
  const proratedSalary = getProratedSalary(employee, posts, start, end);

  const staffAtt = rangeAttendance.filter(a =>
    a.employee_id === employee.id &&
    a.date >= effectiveStart &&
    a.date <= end
  );

  const absentDays = staffAtt.filter(a => a.status === "Absent").length;
  const leaveDays = staffAtt.filter(a => a.status === "Leave").length;
  const totalOTHours = staffAtt.reduce((s, a) => s + (Number(a.ot_hours) || 0), 0);
  const attendanceDeduction = absentDays * dailyRate;
  const otEarnings = totalOTHours * hourlyRate;

  const staffLedger = (ledger || []).filter(l =>
    l.employee_id === employee.id && l.date >= start && l.date <= end
  );
  const totalBonuses = staffLedger.filter(l => l.transaction_type === "Bonus").reduce((s, l) => s + Number(l.amount), 0);
  const totalAdvances = staffLedger.filter(l => l.transaction_type === "Advance" || l.transaction_type === "Fine").reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid = staffLedger.filter(l => l.transaction_type === "Payout").reduce((s, l) => s + Number(l.amount), 0);

  const netPayable = (proratedSalary + totalBonuses + otEarnings) - (attendanceDeduction + totalAdvances + totalPaid);

  return {
    fullSalary, proratedSalary, dailyRate, joiningDate, effectiveStart,
    absentDays, leaveDays, totalOTHours, attendanceDeduction, otEarnings,
    totalBonuses, totalAdvances, totalPaid, netPayable,
  };
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
          <span style={{ color: C.red }}><strong>[{a.shift.toUpperCase()}]</strong> {a.post} — {a.shortage} short ({a.present}/{a.required})</span>
        </div>
      ))}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({ employees, attendance, posts }) {
  const active = employees.filter(e => e.status === "active");
  const present = active.filter(e => attendance[e.id]?.status === "Present").length;
  const absent = active.filter(e => attendance[e.id]?.status === "Absent").length;
  const morningOn = active.filter(e => e.shift === "Morning" && attendance[e.id]?.status === "Present").length;
  const nightOn = active.filter(e => e.shift === "Night" && attendance[e.id]?.status === "Present").length;
  const alerts = getCoverage(active, attendance, posts);
  const company = active.filter(e => e.staff_type === "company").length;
  const contract = active.filter(e => e.staff_type === "contract").length;

  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>
          DAILY OVERVIEW · {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Operations Dashboard</div>
      </div>
      <div style={{ ...css.grid4, marginBottom: 20 }}>
        <StatCard label="Active Staff" value={active.length} sub={`${company} company · ${contract} contract`} accent={C.blue} />
        <StatCard label="Present Today" value={present} sub={`${absent} absent`} accent={C.green} />
        <StatCard label="Morning Shift" value={morningOn} sub="Active now" accent={C.accent} />
        <StatCard label="Night Shift" value={nightOn} sub="Active now" accent={C.blue} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Coverage Alerts</div>
        <AlertBanner alerts={alerts} />
      </div>
      {posts.length > 0 && (
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
                  {posts.map(post => {
                    const req = shift === "Morning" ? post.required_morning : post.required_night;
                    const pres = sEmp.filter(e => e.post === post.name && attendance[e.id]?.status === "Present").length;
                    const pct = req > 0 ? Math.min(100, (pres / req) * 100) : 100;
                    const col = pres >= req ? C.green : pres > 0 ? C.accent : C.red;
                    return (
                      <div key={post.id} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: C.textDim }}>{post.name}</span>
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
      )}
    </div>
  );
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
function AttendanceView({ employees, user }) {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dayAttendance, setDayAttendance] = useState({});
  const [filterShift, setFilterShift] = useState("All");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const active = employees.filter(e => e.status === "active");
  const isAdmin = true; // Director always has override
  const isLocked = isSubmitted && !isAdmin;

  let filtered = filterShift === "All" ? active : active.filter(e => e.shift === filterShift);
  if (search.trim()) filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const loadDay = async () => {
      setLoading(true);
      const { data: subData } = await supabase.from("daily_submissions").select("*").eq("date", selectedDate).single();
      setIsSubmitted(!!subData);
      setIsHoliday(subData?.is_holiday || false);
      const { data: attData } = await supabase.from("attendance").select("*").eq("date", selectedDate);
      const attMap = {};
      if (attData) attData.forEach(a => { attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours, dbId: a.id }; });
      setDayAttendance(attMap);
      setLoading(false);
    };
    loadDay();
  }, [selectedDate]);

  const toggle = (id, field, value) => {
    if (isLocked) return;
    setDayAttendance(prev => ({ ...prev, [id]: { ...(prev[id] || { status: "Present", ot_hours: 0 }), [field]: value } }));
  };

  const markAllPresent = () => {
    if (isLocked) return;
    const newMap = { ...dayAttendance };
    filtered.forEach(emp => { newMap[emp.id] = { ...(newMap[emp.id] || {}), status: "Present", ot_hours: newMap[emp.id]?.ot_hours || 0 }; });
    setDayAttendance(newMap);
  };

  const handleSubmit = async () => {
    if (selectedDate > todayStr) return alert("Cannot submit for future dates!");
    if (!window.confirm(`Submit attendance for ${selectedDate}?`)) return;
    setSaving(true);
    const insertData = active.map(emp => {
      const rec = dayAttendance[emp.id] || { status: "Present", ot_hours: 0 };
      return { employee_id: emp.id, date: selectedDate, status: rec.status, ot_hours: rec.ot_hours || 0 };
    });
    await supabase.from("attendance").delete().eq("date", selectedDate);
    await supabase.from("attendance").insert(insertData);
    await supabase.from("daily_submissions").upsert({ date: selectedDate, is_holiday: false });
    setIsSubmitted(true);
    setIsHoliday(false);
    setSaving(false);
  };

  const handleHolidaySubmit = async () => {
    if (!window.confirm(`Mark ${selectedDate} as Holiday/Off Day?`)) return;
    setSaving(true);
    const insertData = active.map(emp => ({ employee_id: emp.id, date: selectedDate, status: "Present", ot_hours: 0 }));
    await supabase.from("attendance").delete().eq("date", selectedDate);
    await supabase.from("attendance").insert(insertData);
    await supabase.from("daily_submissions").upsert({ date: selectedDate, is_holiday: true });
    setIsSubmitted(true);
    setIsHoliday(true);
    const newMap = {};
    active.forEach(e => { newMap[e.id] = { status: "Present", ot_hours: 0 }; });
    setDayAttendance(newMap);
    setSaving(false);
  };

  const handleUnsubmit = async () => {
    if (!window.confirm("Unlock this day for editing?")) return;
    await supabase.from("daily_submissions").delete().eq("date", selectedDate);
    setIsSubmitted(false);
    setIsHoliday(false);
  };

  const presentCount = filtered.filter(e => (dayAttendance[e.id]?.status || "Present") === "Present").length;
  const absentCount = filtered.filter(e => dayAttendance[e.id]?.status === "Absent").length;

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>ATTENDANCE LOG</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input type="date" max={todayStr} value={selectedDate} onChange={e => { if (e.target.value <= todayStr) setSelectedDate(e.target.value); }}
              style={{ ...css.input, fontSize: 16, fontWeight: 700, padding: "8px 12px", border: `2px solid ${C.accent}44` }} />
            {isHoliday ? <span style={css.badge(C.orange)}>⛱ HOLIDAY</span>
              : isSubmitted ? <span style={css.badge(C.green)}>✓ SUBMITTED</span>
              : <span style={css.badge(C.textDim)}>DRAFT</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All", "Morning", "Night"].map(s => <button key={s} style={css.navBtn(filterShift === s)} onClick={() => setFilterShift(s)}>{s}</button>)}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ ...css.badge(C.green), fontSize: 12 }}>✓ Present: {presentCount}</span>
        <span style={{ ...css.badge(C.red), fontSize: 12 }}>✗ Absent: {absentCount}</span>
        <span style={{ ...css.badge(C.accent), fontSize: 12 }}>Leave: {filtered.filter(e => dayAttendance[e.id]?.status === "Leave").length}</span>
      </div>

      {/* Search + Bulk */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input placeholder="🔍 Search employee..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...css.input, flex: 1, minWidth: 180 }} />
        {!isLocked && !isHoliday && (
          <button style={css.btn(C.green)} onClick={markAllPresent}>✓ Mark All Present</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>Loading {selectedDate}...</div>
      ) : (
        <>
          <div style={{ overflowX: "auto", opacity: isLocked ? 0.7 : 1 }}>
            <table style={css.table}>
              <thead><tr>{["Name", "Post", "Type", "Shift", "Status", "OT Hrs", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No employees found.</td></tr>}
                {filtered.map(emp => {
                  const rec = dayAttendance[emp.id] || { status: "Present", ot_hours: 0 };
                  return (
                    <tr key={emp.id} style={{ background: rec.status === "Absent" ? C.red + "08" : rec.status === "Leave" ? C.accent + "08" : "transparent" }}>
                      <td style={css.td}><strong>{emp.name}</strong></td>
                      <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                      <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                      <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                      <td style={css.td}><span style={css.badge(statusColor(rec.status))}>{rec.status}</span></td>
                      <td style={css.td}>
                        <input type="number" min="0" max="12" step="0.5" value={rec.ot_hours || 0}
                          onChange={e => toggle(emp.id, "ot_hours", +e.target.value)}
                          disabled={isLocked || isHoliday}
                          style={{ ...css.input, width: 60, textAlign: "center" }} />
                      </td>
                      <td style={css.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {["Present", "Absent", "Leave"].map(s => (
                            <button key={s} disabled={isLocked || isHoliday}
                              style={{ ...css.btn(statusColor(s)), opacity: rec.status === s ? 1 : 0.25, padding: "4px 8px", fontSize: 10 }}
                              onClick={() => toggle(emp.id, "status", s)}>{s}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.textDim }}>
              {isHoliday ? "Holiday — all staff marked present." : isLocked ? "Submitted. Admin can unlock." : "Draft mode — submit when ready."}
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isSubmitted && <button style={css.btn(C.red)} onClick={handleUnsubmit}>🔓 Unlock Day</button>}
              {(!isSubmitted || isAdmin) && <>
                <button style={css.btn(C.orange)} onClick={handleHolidaySubmit} disabled={saving}>⛱ Mark Holiday</button>
                <button style={css.btn(C.green)} onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : isSubmitted ? "Update Day" : "✓ Submit Day"}</button>
              </>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── STAFF ────────────────────────────────────────────────────────────────────
function StaffView({ employees, setEmployees, posts, ledger }) {
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPost, setFilterPost] = useState("All");
  const [viewing, setViewing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company", joining_date: todayStr });

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");

  let filtered = filterPost === "All" ? active : active.filter(e => e.post === filterPost);
  if (search.trim()) filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || (e.aadhar || "").includes(search));

  const getContractSalary = (postName) => posts.find(p => p.name === postName)?.contract_salary || 0;

  const handlePostChange = (postName) => setForm(f => ({ ...f, post: postName, base_salary: f.staff_type === "contract" ? getContractSalary(postName) : f.base_salary }));
  const handleTypeChange = (type) => setForm(f => ({ ...f, staff_type: type, base_salary: type === "contract" ? getContractSalary(f.post) : "" }));

  const addEmp = async () => {
    if (!form.name.trim()) return alert("Name is required.");
    if (!form.aadhar.trim() || form.aadhar.length !== 12) return alert("Valid 12-digit Aadhar is required.");
    if (!form.post) return alert("Please select a post.");
    if (form.staff_type === "company" && !form.base_salary) return alert("Salary is required for company staff.");
    if (!form.joining_date) return alert("Joining date is required.");

    setLoading(true);
    const salary = form.staff_type === "contract" ? getContractSalary(form.post) : +form.base_salary;
    const { data, error } = await supabase.from("employees").insert({
      name: form.name, aadhar: form.aadhar, post: form.post, shift: form.shift,
      base_salary: salary, staff_type: form.staff_type, status: "active", joining_date: form.joining_date
    }).select().single();
    if (!error && data) {
      setEmployees(prev => [...prev, data]);
      setForm({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company", joining_date: todayStr });
      setShowForm(false);
    } else alert("Error: " + (error?.message || "Unknown"));
    setLoading(false);
  };

  const markInactive = async (emp) => {
    if (!window.confirm(`Mark ${emp.name} as left? Their final dues will appear in Payroll > Final Settlement.`)) return;
    const leftDate = todayStr;
    await supabase.from("employees").update({ status: "inactive", left_date: leftDate }).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "inactive", left_date: leftDate } : e));
    setViewing(null);
  };

  const reactivate = async (emp) => {
    await supabase.from("employees").update({ status: "active", left_date: null }).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "active", left_date: null } : e));
  };

  const updateEmployee = async (id, field, value) => {
    let updateData = { [field]: value };
    if (field === "post" && viewing?.staff_type === "contract") {
      updateData.base_salary = getContractSalary(value);
    }
    await supabase.from("employees").update(updateData).eq("id", id);
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updateData } : e));
    setViewing(prev => ({ ...prev, ...updateData }));
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={css.sectionTitle}>Workforce</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Staff Directory</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={css.btn(C.textDim)} onClick={() => setShowInactive(v => !v)}>{showInactive ? "Hide" : "Show"} Inactive ({inactive.length})</button>
          <button style={css.btn(C.green)} onClick={() => setShowForm(v => !v)}>+ Add Employee</button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, borderColor: C.green + "44" }}>
          <div style={css.sectionTitle}>Register New Employee</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FULL NAME *</div>
              <input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>AADHAR NO. * (12 digits)</div>
              <input maxLength={12} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.aadhar} onChange={e => setForm(f => ({ ...f, aadhar: e.target.value.replace(/\D/g, "") }))} placeholder="123456789012" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>JOINING DATE *</div>
              <input type="date" max={todayStr} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>STAFF TYPE *</div>
              <select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.staff_type} onChange={e => handleTypeChange(e.target.value)}>
                <option value="company">Company Staff</option>
                <option value="contract">Contract Staff</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST / ROLE *</div>
              <select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.post} onChange={e => handlePostChange(e.target.value)}>
                <option value="">Select post...</option>
                {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SHIFT *</div>
              <select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                <option>Morning</option><option>Night</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>BASE SALARY (₹) *</div>
              <input type="number" readOnly={form.staff_type === "contract"}
                style={{ ...css.input, width: "100%", boxSizing: "border-box", background: form.staff_type === "contract" ? C.border : C.bg }}
                value={form.base_salary}
                onChange={e => form.staff_type === "company" && setForm(f => ({ ...f, base_salary: e.target.value }))}
                placeholder={form.staff_type === "contract" ? "Auto from post" : "e.g. 20000"} />
              {form.staff_type === "contract" && form.post && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>₹{getContractSalary(form.post).toLocaleString("en-IN")} (from post settings)</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addEmp} disabled={loading}>{loading ? "Saving..." : "Save Employee"}</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="🔍 Search by name or Aadhar..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...css.input, flex: 1, minWidth: 200 }} />
        <select style={css.input} value={filterPost} onChange={e => setFilterPost(e.target.value)}>
          <option value="All">All Posts</option>
          {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {/* Staff profile modal */}
      {viewing && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 500, width: "100%", border: `2px solid ${C.accent}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>Staff Profile</div>
              <button onClick={() => setViewing(null)} style={{ background: C.red, color: "white", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>CLOSE ✕</button>
            </div>
            <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{viewing.name}</div>
              <span style={css.badge(staffTypeColor(viewing.staff_type))}>{viewing.staff_type}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, background: C.bg, padding: 14, borderRadius: 8 }}>
              <div><div style={{ fontSize: 10, color: C.textDim }}>AADHAR</div><strong>{viewing.aadhar || "—"}</strong></div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>SALARY</div><strong style={{ color: C.green }}>₹{Number(viewing.base_salary).toLocaleString("en-IN")}</strong></div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>JOINED</div><strong>{viewing.joining_date || "—"}</strong></div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SHIFT</div>
                <select style={{ ...css.input, width: "100%" }} value={viewing.shift} onChange={e => updateEmployee(viewing.id, "shift", e.target.value)}>
                  <option>Morning</option><option>Night</option>
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST / ROLE</div>
                <select style={{ ...css.input, width: "100%" }} value={viewing.post} onChange={e => updateEmployee(viewing.id, "post", e.target.value)}>
                  {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                {viewing.staff_type === "contract" && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>Salary auto-updates when post changes</div>}
              </div>
            </div>
            <div style={css.sectionTitle}>Recent Ledger</div>
            <div style={{ maxHeight: 130, overflowY: "auto", background: C.bg, borderRadius: 6, padding: 10, marginBottom: 16 }}>
              {(ledger || []).filter(l => l.employee_id === viewing.id).slice(0, 10).length === 0
                ? <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>No transactions found.</div>
                : (ledger || []).filter(l => l.employee_id === viewing.id).slice(0, 10).map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11 }}>{l.date} · {l.transaction_type}</span>
                    <strong style={{ fontSize: 11, color: l.transaction_type === "Bonus" || l.transaction_type === "Payout" ? C.green : C.red }}>₹{l.amount}</strong>
                  </div>
                ))
              }
            </div>
            <button style={{ ...css.btn(C.red), width: "100%" }} onClick={() => markInactive(viewing)}>Mark as Left / Inactive</button>
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Active Staff ({filtered.length})</div>
      <div style={{ overflowX: "auto", marginBottom: 24 }}>
        <table style={css.table}>
          <thead><tr>{["Name", "Post", "Type", "Shift", "Joined", "Salary", ""].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No employees found.</td></tr>}
            {filtered.map(emp => (
              <tr key={emp.id} style={{ cursor: "pointer" }} onClick={() => setViewing(emp)}>
                <td style={css.td}><span style={{ color: C.accent, fontWeight: 700, textDecoration: "underline" }}>{emp.name}</span></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.joining_date || "—"}</span></td>
                <td style={css.td}><span style={{ color: C.accent }}>₹{Number(emp.base_salary).toLocaleString("en-IN")}</span></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.accent }}>View →</span></td>
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
              <thead><tr>{["Name", "Post", "Type", "Left On", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {inactive.length === 0 && <tr><td colSpan={5} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No inactive employees.</td></tr>}
                {inactive.map(emp => (
                  <tr key={emp.id} style={{ opacity: 0.6 }}>
                    <td style={css.td}><strong>{emp.name}</strong></td>
                    <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                    <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                    <td style={css.td}><span style={{ fontSize: 11, color: C.red }}>{emp.left_date || "—"}</span></td>
                    <td style={css.td}><button style={{ ...css.btn(C.green), padding: "4px 10px", fontSize: 10 }} onClick={() => reactivate(emp)}>Reactivate</button></td>
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

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
function PayrollView({ employees, posts, ledger, setLedger }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(todayStr);
  const [rangeAttendance, setRangeAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState("company"); // company | contract | settlement
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: "Advance", amount: "", notes: "", date: todayStr, empId: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");
  const companyStaff = active.filter(e => e.staff_type === "company");
  const contractStaff = active.filter(e => e.staff_type === "contract");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("attendance").select("*").gte("date", start).lte("date", end);
      if (data) setRangeAttendance(data);
    };
    fetch();
  }, [start, end]);

  const handleTransaction = async () => {
    if (!form.empId || !form.amount || Number(form.amount) <= 0) return alert("Select staff and enter a valid amount.");
    setSaving(true);
    const { data, error } = await supabase.from("financial_ledger").insert({
      employee_id: form.empId, date: form.date, transaction_type: form.type, amount: Number(form.amount), notes: form.notes
    }).select().single();
    if (!error && data) {
      setLedger(prev => [data, ...prev]);
      setShowModal(false);
      setForm({ type: "Advance", amount: "", notes: "", date: todayStr, empId: "" });
    }
    setSaving(false);
  };

  const exportCSV = (rows, filename) => {
    const header = ["Name", "Post", "Base Salary", "Absent Days", "OT Hours", "Attendance Deduction", "OT Earnings", "Bonuses", "Advances/Fines", "Total Paid", "Net Payable"];
    const lines = rows.map(({ emp, fin }) => [
      emp.name, emp.post, fin.proratedSalary.toFixed(2), fin.absentDays, fin.totalOTHours,
      fin.attendanceDeduction.toFixed(2), fin.otEarnings.toFixed(2), fin.totalBonuses,
      fin.totalAdvances, fin.totalPaid, fin.netPayable.toFixed(2)
    ]);
    const csv = [header, ...lines].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  const PayrollTable = ({ staffList, label, color }) => {
    let filtered = staffList;
    if (search.trim()) filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
    const rows = filtered.map(emp => ({ emp, fin: calcFinances(emp, posts, rangeAttendance, ledger, start, end) }));
    const totalNet = rows.reduce((s, r) => s + r.fin.netPayable, 0);
    const totalBase = rows.reduce((s, r) => s + r.fin.proratedSalary, 0);

    return (
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={css.sectionTitle}>{label} ({filtered.length} staff)</div>
          <button style={css.btn(C.textDim)} onClick={() => exportCSV(rows, `${label.replace(" ", "_")}_${start}_${end}.csv`)}>📥 Export CSV</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead>
              <tr style={{ background: C.bg }}>
                {["Name", "Post", "Base (Prorated)", "Absent", "OT Hrs", "OT Earn", "Bonus", "Adv/Fine", "Paid Out", "Net Payable"].map(h => <th key={h} style={css.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No staff.</td></tr>}
              {rows.map(({ emp, fin }) => (
                <tr key={emp.id}>
                  <td style={css.td}><strong>{emp.name}</strong><br /><small style={{ color: C.textDim }}>Joined {fin.joiningDate}</small></td>
                  <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                  <td style={css.td}>₹{Math.round(fin.proratedSalary).toLocaleString("en-IN")}{fin.proratedSalary < fin.fullSalary && <small style={{ color: C.orange, display: "block" }}>of ₹{fin.fullSalary.toLocaleString()}</small>}</td>
                  <td style={{ ...css.td, color: fin.absentDays > 0 ? C.red : C.textDim }}>{fin.absentDays}d<br /><small>-₹{Math.round(fin.attendanceDeduction).toLocaleString()}</small></td>
                  <td style={css.td}>{fin.totalOTHours}h</td>
                  <td style={{ ...css.td, color: C.green }}>+₹{Math.round(fin.otEarnings).toLocaleString()}</td>
                  <td style={{ ...css.td, color: C.green }}>+₹{fin.totalBonuses.toLocaleString()}</td>
                  <td style={{ ...css.td, color: C.red }}>-₹{fin.totalAdvances.toLocaleString()}</td>
                  <td style={{ ...css.td, color: C.textDim }}>₹{fin.totalPaid.toLocaleString()}</td>
                  <td style={{ ...css.td, background: color + "11" }}>
                    <strong style={{ color: fin.netPayable < 0 ? C.red : color, fontSize: 14 }}>₹{Math.round(fin.netPayable).toLocaleString("en-IN")}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td colSpan={2} style={{ ...css.td, fontWeight: 700 }}>TOTAL</td>
                <td style={css.td}>₹{Math.round(totalBase).toLocaleString("en-IN")}</td>
                <td colSpan={6} style={css.td}></td>
                <td style={css.td}><strong style={{ color, fontSize: 15 }}>₹{Math.round(totalNet).toLocaleString("en-IN")}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  // Final Settlement for inactive employees
  const SettlementView = () => {
    const rows = inactive.map(emp => ({ emp, fin: calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || start, emp.left_date || end) }))
      .filter(r => r.fin.netPayable !== 0);
    if (rows.length === 0) return <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim }}>No pending settlements. All former staff are cleared. ✓</div>;
    return (
      <div style={{ overflowX: "auto" }}>
        <div style={{ marginBottom: 12, padding: "10px 14px", background: C.orange + "15", border: `1px solid ${C.orange}44`, borderRadius: 6, fontSize: 12, color: C.orange }}>
          ⚠ These are former employees with pending dues. Use "Register Payment/Advance" to record their final payout.
        </div>
        <table style={css.table}>
          <thead><tr>{["Name", "Post", "Left On", "Pending Amount", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ emp, fin }) => (
              <tr key={emp.id}>
                <td style={css.td}><strong>{emp.name}</strong></td>
                <td style={css.td}>{emp.post}</td>
                <td style={{ ...css.td, color: C.red }}>{emp.left_date || "—"}</td>
                <td style={css.td}><strong style={{ color: fin.netPayable < 0 ? C.red : C.green, fontSize: 15 }}>₹{Math.round(Math.abs(fin.netPayable)).toLocaleString("en-IN")}</strong><br /><small style={{ color: C.textDim }}>{fin.netPayable < 0 ? "Overpaid" : "Owed to staff"}</small></td>
                <td style={css.td}><button style={css.btn(C.green)} onClick={() => { setForm(f => ({ ...f, empId: emp.id, type: "Payout" })); setShowModal(true); }}>Record Payout</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={css.sectionTitle}>Financial Overview</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Payroll & Ledger</div>
        </div>
        <button style={css.btn(C.blue)} onClick={() => setShowModal(true)}>+ Register Transaction</button>
      </div>

      {/* Date range + search */}
      <div style={{ ...css.card, marginBottom: 20, background: "#f8fafc" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM</div><input type="date" style={{ ...css.input, width: "100%" }} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO</div><input type="date" style={{ ...css.input, width: "100%" }} value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SEARCH STAFF</div><input placeholder="Name..." style={{ ...css.input, width: "100%" }} value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["company", "🏢 Company Staff", C.blue], ["contract", "📋 Contract Staff", C.green], ["settlement", "⚖ Final Settlement", C.orange]].map(([id, label, color]) => (
          <button key={id} style={{ ...css.navBtn(activeTab === id), color: activeTab === id ? color : C.textDim, borderColor: activeTab === id ? color + "55" : "transparent", background: activeTab === id ? color + "15" : "transparent" }}
            onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {activeTab === "company" && <PayrollTable staffList={companyStaff} label="Company Staff Payroll" color={C.blue} />}
      {activeTab === "contract" && <PayrollTable staffList={contractStaff} label="Contract Staff Payroll" color={C.green} />}
      {activeTab === "settlement" && <SettlementView />}

      {/* Transaction modal */}
      {showModal && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 440, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Register Transaction</div>
              <button onClick={() => setShowModal(false)} style={{ background: C.red, color: "white", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>STAFF MEMBER</div>
                <select style={{ ...css.input, width: "100%" }} value={form.empId} onChange={e => setForm({ ...form, empId: e.target.value })}>
                  <option value="">-- Select Person --</option>
                  <optgroup label="Active Staff">{active.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
                  <optgroup label="Former Staff">{inactive.map(e => <option key={e.id} value={e.id}>{e.name} (left)</option>)}</optgroup>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TYPE</div>
                  <select style={{ ...css.input, width: "100%" }} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="Advance">Advance</option>
                    <option value="Bonus">Bonus</option>
                    <option value="Fine">Fine</option>
                    <option value="Payout">Salary Payout</option>
                  </select>
                </div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>DATE</div>
                  <input type="date" style={{ ...css.input, width: "100%" }} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>AMOUNT (₹)</div>
                <input type="number" placeholder="0" style={{ ...css.input, width: "100%", fontSize: 18, fontWeight: 700 }} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REMARKS</div>
                <input placeholder="Optional note..." style={{ ...css.input, width: "100%" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...css.btn(C.blue), flex: 1 }} onClick={handleTransaction} disabled={saving}>{saving ? "Saving..." : "Save Transaction"}</button>
                <button style={{ ...css.btn(C.red), flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsView({ posts, setPosts, employees, setEmployees }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", required_morning: 1, required_night: 1, contract_salary: 0 });
  const [loading, setLoading] = useState(false);

  const addPost = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.from("posts").insert({
      name: form.name, required_morning: +form.required_morning,
      required_night: +form.required_night, contract_salary: +form.contract_salary,
    }).select().single();
    if (!error && data) {
      setPosts(prev => [...prev, data]);
      setForm({ name: "", required_morning: 1, required_night: 1, contract_salary: 0 });
      setShowForm(false);
    }
    setLoading(false);
  };

  const deletePost = async (post) => {
    if (!window.confirm(`Remove post "${post.name}"?`)) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setPosts(prev => prev.filter(p => p.id !== post.id));
  };

  const updatePost = async (post, field, value) => {
    const newVal = field === "name" ? value : +value;
    if (field === "name" && value !== post.name) {
      await supabase.from("employees").update({ post: value }).eq("post", post.name);
      setEmployees(prev => prev.map(e => e.post === post.name ? { ...e, post: value } : e));
    }
    await supabase.from("posts").update({ [field]: newVal }).eq("id", post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, [field]: newVal } : p));
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>CONFIGURATION</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Settings</div>
        </div>
        <button style={css.btn(C.green)} onClick={() => setShowForm(v => !v)}>+ Add Post</button>
      </div>

      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, borderColor: C.green + "44" }}>
          <div style={css.sectionTitle}>New Post / Role</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            {[["POST NAME", "name", "text", "e.g. Machine Operator"], ["REQ. MORNING", "required_morning", "number", ""], ["REQ. NIGHT", "required_night", "number", ""], ["CONTRACT SALARY (₹)", "contract_salary", "number", "e.g. 18000"]].map(([label, field, type, ph]) => (
              <div key={field}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>{label}</div>
                <input type={type} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form[field]} placeholder={ph}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addPost} disabled={loading}>{loading ? "Saving..." : "Save Post"}</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Manage Posts & Requirements</div>
      {posts.length === 0 && <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim }}>No posts added yet. Click "+ Add Post" to begin.</div>}
      {posts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr>{["Post Name (click to rename)", "Req. Morning", "Req. Night", "Contract Salary (₹)", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td style={css.td}><input type="text" defaultValue={post.name} onBlur={e => e.target.value !== post.name && updatePost(post, "name", e.target.value)}
                    style={{ ...css.input, fontWeight: 700, border: "1px solid transparent", background: "transparent", width: "100%" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.required_morning} onBlur={e => updatePost(post, "required_morning", e.target.value)} style={{ ...css.input, width: 70, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.required_night} onBlur={e => updatePost(post, "required_night", e.target.value)} style={{ ...css.input, width: 70, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.contract_salary || 0} onBlur={e => updatePost(post, "contract_salary", e.target.value)} style={{ ...css.input, width: 110, textAlign: "center" }} /></td>
                  <td style={css.td}><button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => deletePost(post)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [posts, setPosts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);
      const { data: emps } = await supabase.from("employees").select("*").order("name");
      if (emps) setEmployees(emps);
      const { data: postsData } = await supabase.from("posts").select("*").order("name");
      if (postsData) setPosts(postsData);
      const { data: att } = await supabase.from("attendance").select("*").eq("date", todayStr);
      if (att) {
        const attMap = {};
        att.forEach(a => { attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours, dbId: a.id }; });
        setAttendance(attMap);
      }
      const { data: ledgData } = await supabase.from("financial_ledger").select("*").order("date", { ascending: false });
      if (ledgData) setLedger(ledgData);
      setLoading(false);
    };
    loadData();
  }, [user]);

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };

  if (!user) return <Login onLogin={setUser} />;

  const alerts = getCoverage(employees.filter(e => e.status === "active"), attendance, posts);
  const pendingSettlements = employees.filter(e => e.status === "inactive").length;

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "attendance", label: "Attendance" },
    { id: "staff", label: "Staff" },
    { id: "payroll", label: "Payroll" },
    { id: "settings", label: "⚙ Settings" },
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
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>
      <header style={css.header}>
        <div style={css.logo}>⚙ PRFM HR Portal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textDim }}>{user.email}</span>
          {alerts.length > 0 && <span style={css.badge(C.red)}>⚠ {alerts.length} Alert{alerts.length > 1 ? "s" : ""}</span>}
          {pendingSettlements > 0 && <span style={css.badge(C.orange)}>⚖ {pendingSettlements} Settlement{pendingSettlements > 1 ? "s" : ""}</span>}
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
          {tab === "dashboard" && <DashboardView employees={employees} attendance={attendance} posts={posts} />}
          {tab === "attendance" && <AttendanceView employees={employees} user={user} />}
          {tab === "staff" && <StaffView employees={employees} setEmployees={setEmployees} posts={posts} ledger={ledger} />}
          {tab === "payroll" && <PayrollView employees={employees} posts={posts} ledger={ledger} setLedger={setLedger} />}
          {tab === "settings" && <SettingsView posts={posts} setPosts={setPosts} employees={employees} setEmployees={setEmployees} />}
        </>
      )}
    </div>
  );
}