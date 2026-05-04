import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

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
  td: { padding: "10px 12px", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" },
  input: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" },
  btn: (color = C.accent) => ({ background: color + "22", color: color, border: `1px solid ${color}55`, borderRadius: 4, padding: "7px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
};

const statusColor = (s) => s === "Present" ? C.green : s === "Absent" ? C.red : C.accent;
const shiftColor = (s) => s === "Morning" ? C.accent : C.blue;
const staffTypeColor = (t) => t === "company" ? C.blue : C.green;

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

function getEffectiveSalary(employee, posts) {
  if (employee.staff_type === "contract") {
    const post = posts.find(p => p.name === employee.post);
    return post?.contract_salary || 0;
  }
  return employee.base_salary;
}

function calcPayroll(employee, attendance, posts) {
  const salary = getEffectiveSalary(employee, posts);
  const dailyRate = salary / 26;
  const hourlyRate = dailyRate / 12;
  const rec = attendance[employee.id] || {};
  const otPay = (rec.ot_hours || 0) * hourlyRate;
  const deduc = rec.status === "Absent" ? dailyRate : 0;
  return { base: salary, ot: +otPay.toFixed(2), deduct: +deduc.toFixed(2), total: +(salary + otPay - deduc).toFixed(2) };
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
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>DAILY OVERVIEW · {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
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

function AttendanceView({ employees, user }) {
  // Helper to get local YYYY-MM-DD string reliably
  const getLocalDateStr = (dObj = new Date()) => {
    const d = new Date(dObj);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const todayStr = getLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dayAttendance, setDayAttendance] = useState({});
  const [filterShift, setFilterShift] = useState("All");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = employees.filter(e => e.status === "active");
  const filtered = filterShift === "All" ? active : active.filter(e => e.shift === filterShift);
  
  const isAdmin = user?.email === "abdshafeeque@gmail.com";
  const isLocked = isSubmitted && !isAdmin;

  useEffect(() => {
    const loadDay = async () => {
      setLoading(true);
      const { data: subData } = await supabase.from("daily_submissions").select("*").eq("date", selectedDate).single();
      setIsSubmitted(!!subData);
      setIsHoliday(subData?.is_holiday || false);

      const { data: attData } = await supabase.from("attendance").select("*").eq("date", selectedDate);
      const attMap = {};
      if (attData) {
        attData.forEach(a => { attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours, dbId: a.id }; });
      }
      setDayAttendance(attMap);
      setLoading(false);
    };
    loadDay();
  }, [selectedDate]);

  const toggle = (id, field, value) => {
    if (isLocked) return; 
    setDayAttendance(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { status: "Present", ot_hours: 0 }), [field]: value }
    }));
  };

  const handleHolidaySubmit = async () => {
    if (selectedDate > todayStr) return alert("Cannot submit for future dates!");
    if (!window.confirm(`Mark ${selectedDate} as a Non-Functioning Holiday?\n\nStaff present yesterday will be marked Present. Staff absent yesterday will be marked Absent.`)) return;
    setSaving(true);

    // 1. Get yesterday's date to calculate carry-over
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);

    // 2. Fetch yesterday's attendance
    const { data: yAtt } = await supabase.from("attendance").select("*").eq("date", yesterdayStr);
    const yMap = {};
    if (yAtt) yAtt.forEach(a => yMap[a.employee_id] = a.status);

    // 3. Prepare holiday data based on yesterday
    const insertData = active.map(emp => {
      const wasPresent = yMap[emp.id] === "Present";
      return {
        employee_id: emp.id,
        date: selectedDate,
        status: wasPresent ? "Present" : "Absent",
        ot_hours: 0
      };
    });

    await supabase.from("attendance").delete().eq("date", selectedDate);
    const { error: attError } = await supabase.from("attendance").insert(insertData);

    if (!isSubmitted && !attError) {
      await supabase.from("daily_submissions").insert({ date: selectedDate, is_holiday: true });
      setIsSubmitted(true);
      setIsHoliday(true);
      
      // Update local state to reflect new values
      const newMap = {};
      insertData.forEach(d => newMap[d.employee_id] = { status: d.status, ot_hours: 0 });
      setDayAttendance(newMap);
    }
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (selectedDate > todayStr) return alert("Cannot submit for future dates!");
    if (!window.confirm(`Save and submit regular attendance for ${selectedDate}?`)) return;
    setSaving(true);

    const insertData = active.map(emp => {
      const rec = dayAttendance[emp.id] || { status: "Present", ot_hours: 0 };
      return { employee_id: emp.id, date: selectedDate, status: rec.status, ot_hours: rec.ot_hours };
    });

    await supabase.from("attendance").delete().eq("date", selectedDate);
    const { error: attError } = await supabase.from("attendance").insert(insertData);

    if (!isSubmitted && !attError) {
      // Upsert submission
      const { error: subErr } = await supabase.from("daily_submissions").upsert({ date: selectedDate, is_holiday: false });
      if (!subErr) {
        setIsSubmitted(true);
        setIsHoliday(false);
      }
    }

    // --- SMART SANDWICH RULE CHECK ---
    // If we just submitted today, check if yesterday was a holiday.
    // If yes, anyone marked present today gets their yesterday (holiday) attendance switched to present!
    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);

    const { data: ySub } = await supabase.from("daily_submissions").select("*").eq("date", yesterdayStr).single();
    if (ySub && ySub.is_holiday) {
      const presentTodayIds = active.filter(emp => (dayAttendance[emp.id]?.status || "Present") === "Present").map(e => e.id);
      if (presentTodayIds.length > 0) {
        // Retroactively update yesterday
        await supabase.from("attendance")
          .update({ status: "Present" })
          .eq("date", yesterdayStr)
          .in("employee_id", presentTodayIds);
      }
    }

    setSaving(false);
    if (attError) alert("Error saving attendance. Check connection.");
  };

  const handleUnsubmit = async () => {
    if (!window.confirm("Unlock this day? Staff will be able to edit it again.")) return;
    await supabase.from("daily_submissions").delete().eq("date", selectedDate);
    setIsSubmitted(false);
    setIsHoliday(false);
  };

  // Prevent selection of future dates
  const handleDateChange = (e) => {
    const newVal = e.target.value;
    if (newVal > todayStr) {
      alert("You cannot log attendance for future dates.");
      return;
    }
    setSelectedDate(newVal);
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 15 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>ATTENDANCE LOG</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input 
              type="date" 
              max={todayStr}
              value={selectedDate} 
              onChange={handleDateChange} 
              style={{ 
                ...css.input, 
                fontSize: 18, 
                fontWeight: 700, 
                padding: "8px 12px", 
                border: `2px solid ${C.accent}44`,
                color: "#1E293B", 
                backgroundColor: "#FFFFFF",
                colorScheme: "light" 
              }}
            />
            {isHoliday ? (
              <span style={css.badge(isAdmin ? C.accent : C.blue)}>
                {isAdmin ? "⚠ HOLIDAY / OFF DAY (ADMIN OVERRIDE ACTIVE)" : "⛱ HOLIDAY / OFF DAY"}
              </span>
            ) : isSubmitted ? (
              <span style={css.badge(isAdmin ? C.accent : C.green)}>
                {isAdmin ? "⚠ SUBMITTED (ADMIN OVERRIDE ACTIVE)" : "✓ SUBMITTED & LOCKED"}
              </span>
            ) : (
              <span style={css.badge(C.textDim)}>DRAFT MODE</span>
            )}
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 6 }}>
          {["All", "Morning", "Night"].map(s => <button key={s} style={css.navBtn(filterShift === s)} onClick={() => setFilterShift(s)}>{s}</button>)}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>Loading {selectedDate}...</div>
      ) : (
        <>
          <div style={{ overflowX: "auto", opacity: isLocked ? 0.7 : 1, transition: "opacity 0.2s" }}>
            <table style={css.table}>
              <thead><tr>{["Name", "Post", "Type", "Shift", "Status", "OT Hours", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No active employees.</td></tr>
                )}
                {filtered.map(emp => {
                  const rec = dayAttendance[emp.id] || { status: isHoliday ? "Absent" : "Present", ot_hours: 0 };
                  return (
                    <tr key={emp.id} style={{ background: rec.status === "Absent" ? C.red + "08" : "transparent" }}>
                      <td style={css.td}><div style={{ fontWeight: 700 }}>{emp.name}</div></td>
                      <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                      <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                      <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                      <td style={css.td}><span style={css.badge(statusColor(rec.status))}>{rec.status}</span></td>
                      <td style={css.td}>
                        <input 
                          type="number" min="0" max="12" step="0.5" 
                          value={rec.ot_hours || 0} 
                          onChange={e => toggle(emp.id, "ot_hours", +e.target.value)} 
                          style={{ ...css.input, width: 60, textAlign: "center" }} 
                          disabled={isLocked || isHoliday}
                        />
                      </td>
                      <td style={css.td}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["Present", "Absent", "Leave"].map(s => (
                            <button 
                              key={s} 
                              style={{ ...css.btn(statusColor(s)), opacity: rec.status === s ? 1 : 0.25, padding: "4px 10px", fontSize: 10, cursor: (isLocked || isHoliday) ? "not-allowed" : "pointer" }} 
                              onClick={() => toggle(emp.id, "status", s)}
                              disabled={isLocked || isHoliday}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Bar at the bottom */}
          <div style={{ marginTop: 20, padding: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 15 }}>
             <div style={{ fontSize: 12, color: C.textDim, maxWidth: 500, lineHeight: 1.5 }}>
               {isHoliday ? "This is a Holiday. Attendance carried over from previous working day. Overrides apply if staff show up next day." 
                : isLocked ? "This day has been submitted and cannot be changed." 
                : "Changes are kept as a draft until you submit the day."}
             </div>
             
             <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
               {isAdmin && isSubmitted && (
                 <button style={css.btn(C.red)} onClick={handleUnsubmit}>Unlock Day</button>
               )}
               
               {(!isSubmitted || isAdmin) && (
                 <>
                   <button style={css.btn(C.blue)} onClick={handleHolidaySubmit} disabled={saving || isHoliday}>
                     {saving ? "Processing..." : "Mark as Holiday / Off"}
                   </button>
                   <button style={css.btn(C.green)} onClick={handleSubmit} disabled={saving}>
                     {saving ? "Saving..." : isSubmitted ? "Update Submitted Day" : "Submit Full Day"}
                   </button>
                 </>
               )}
             </div>
          </div>
        </>
      )}
    </div>
  );
}

function PayrollView({ employees, attendance, posts }) {
  const active = employees.filter(e => e.status === "active");
  const rows = active.map(e => ({ emp: e, pay: calcPayroll(e, attendance, posts) }));
  const totalPayroll = rows.reduce((s, r) => s + r.pay.total, 0);
  const totalOT = rows.reduce((s, r) => s + r.pay.ot, 0);
  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>PAYROLL</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Salary Calculation</div>
      </div>
      <div style={{ ...css.grid4, marginBottom: 20 }}>
        <StatCard label="Total Payroll" value={`₹${totalPayroll.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} sub="This month est." accent={C.green} />
        <StatCard label="Total OT Cost" value={`₹${totalOT.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} sub="Overtime" accent={C.accent} />
        <StatCard label="Staff on Payroll" value={active.length} sub="Active" accent={C.blue} />
        <StatCard label="OT Rate" value="1×" sub="Per hour basis" accent={C.textDim} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr>{["Employee", "Post", "Type", "Shift", "Base Salary", "OT Pay", "Deductions", "Total"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No active employees.</td></tr>
            )}
            {rows.map(({ emp, pay }) => (
              <tr key={emp.id}>
                <td style={css.td}><div style={{ fontWeight: 700 }}>{emp.name}</div></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td} align="right"><span style={{ color: C.text }}>₹{Number(pay.base).toLocaleString("en-IN")}</span></td>
                <td style={css.td} align="right"><span style={{ color: C.green }}>+ ₹{pay.ot.toFixed(2)}</span></td>
                <td style={css.td} align="right"><span style={{ color: pay.deduct > 0 ? C.red : C.textDim }}>{pay.deduct > 0 ? `- ₹${pay.deduct.toFixed(2)}` : "—"}</span></td>
                <td style={css.td} align="right"><strong style={{ color: C.accent, fontSize: 14 }}>₹{pay.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td colSpan={7} style={{ ...css.td, textAlign: "right", color: C.textDim, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Total Payroll</td>
              <td style={css.td} align="right"><strong style={{ color: C.green, fontSize: 16 }}>₹{totalPayroll.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StaffView({ employees, setEmployees, posts }) {
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [searchPost, setSearchPost] = useState("All");
  const [form, setForm] = useState({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");
  const filtered = searchPost === "All" ? active : active.filter(e => e.post === searchPost);

  const getContractSalary = (postName) => {
    const post = posts.find(p => p.name === postName);
    return post?.contract_salary || 0;
  };

  const handlePostChange = (postName) => {
    setForm(f => ({
      ...f,
      post: postName,
      base_salary: f.staff_type === "contract" ? getContractSalary(postName) : f.base_salary
    }));
  };

  const handleTypeChange = (type) => {
    setForm(f => ({
      ...f,
      staff_type: type,
      base_salary: type === "contract" ? getContractSalary(f.post) : ""
    }));
  };

  const addEmp = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.aadhar.trim() || form.aadhar.length !== 12 || isNaN(form.aadhar)) { setError("Valid 12-digit Aadhar number is required."); return; }
    if (!form.post) { setError("Please select a post."); return; }
    if (!form.base_salary) { setError("Salary is required."); return; }

    setLoading(true);
    const { data, error: dbError } = await supabase.from("employees").insert({
      name: form.name, aadhar: form.aadhar, post: form.post, shift: form.shift,
      base_salary: +form.base_salary, staff_type: form.staff_type, status: "active"
    }).select().single();
    if (!dbError && data) {
      setEmployees(prev => [...prev, data]);
      setForm({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company" });
      setShowForm(false);
    } else {
      setError("Failed to save. Try again.");
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={css.btn(C.textDim)} onClick={() => setShowInactive(v => !v)}>{showInactive ? "Hide" : "Show"} Inactive ({inactive.length})</button>
          <button style={css.btn(C.green)} onClick={() => setShowForm(v => !v)}>+ Add Employee</button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, borderColor: C.green + "44" }}>
          <div style={css.sectionTitle}>New Employee</div>
          {posts.length === 0 && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>⚠ Please add posts in Settings first!</div>}
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>⚠ {error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FULL NAME *</div>
              <input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>AADHAR NUMBER * (12 digits)</div>
              <input type="text" maxLength={12} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.aadhar} onChange={e => setForm(f => ({ ...f, aadhar: e.target.value.replace(/\D/g, "") }))} placeholder="123456789012" />
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
              <input
                type="number"
                style={{ ...css.input, width: "100%", boxSizing: "border-box", background: form.staff_type === "contract" ? C.border : C.bg }}
                value={form.base_salary}
                onChange={e => form.staff_type === "company" && setForm(f => ({ ...f, base_salary: e.target.value }))}
                readOnly={form.staff_type === "contract"}
                placeholder={form.staff_type === "contract" ? "Auto from post" : "e.g. 20000"}
              />
              {form.staff_type === "contract" && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>Auto-set from post's contract salary</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addEmp} disabled={loading || posts.length === 0}>{loading ? "Saving..." : "Save Employee"}</button>
            <button style={css.btn(C.red)} onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.textDim, marginRight: 4 }}>FILTER BY ROLE:</span>
        {["All", ...posts.map(p => p.name)].map(p => (
          <button key={p} style={{ ...css.navBtn(searchPost === p), padding: "4px 12px" }} onClick={() => setSearchPost(p)}>{p}</button>
        ))}
      </div>

      <div style={css.sectionTitle}>Active Staff ({filtered.length}{searchPost !== "All" ? ` in ${searchPost}` : ""})</div>
      <div style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={css.table}>
          <thead><tr>{["Name", "Aadhar", "Post / Role", "Type", "Shift", "Salary", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ ...css.td, color: C.textDim, textAlign: "center", padding: 30 }}>No employees found.</td></tr>
            )}
            {filtered.map(emp => (
              <tr key={emp.id}>
                <td style={css.td}><strong>{emp.name}</strong></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim, letterSpacing: 1 }}>{emp.aadhar ? `••••••${emp.aadhar.slice(-4)}` : "—"}</span></td>
                <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td}><span style={{ color: C.accent }}>₹{Number(emp.base_salary).toLocaleString("en-IN")}</span></td>
                <td style={css.td}><button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => markInactive(emp)}>Mark as Left</button></td>
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
              <thead><tr>{["Name", "Post / Role", "Type", "Shift", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {inactive.length === 0 && (
                  <tr><td colSpan={5} style={{ ...css.td, color: C.textDim, textAlign: "center", padding: 30 }}>No inactive employees.</td></tr>
                )}
                {inactive.map(emp => (
                  <tr key={emp.id} style={{ opacity: 0.5 }}>
                    <td style={css.td}><strong>{emp.name}</strong></td>
                    <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                    <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                    <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
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

function SettingsView({ posts, setPosts }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", required_morning: 1, required_night: 1, contract_salary: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); 

  const addPost = async () => {
    setError(""); 
    if (!form.name.trim()) return;
    
    setLoading(true);
    const { data, error: dbError } = await supabase.from("posts").insert({
      name: form.name, 
      required_morning: +form.required_morning,
      required_night: +form.required_night, 
      contract_salary: +form.contract_salary,
    }).select().single();
    
    if (dbError) {
      console.error("Supabase Error adding post:", dbError);
      setError(dbError.message || "Database error. Check console.");
    } else if (data) {
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
    await supabase.from("posts").update({ [field]: field === "name" ? value : +value }).eq("id", post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, [field]: field === "name" ? value : +value } : p));
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
          
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 12, background: C.red+"11", padding: 8, borderRadius: 4 }}>⚠ {error}</div>}
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST NAME</div>
              <input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Machine Operator" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REQUIRED (MORNING)</div>
              <input type="number" min="0" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.required_morning} onChange={e => setForm(f => ({ ...f, required_morning: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REQUIRED (NIGHT)</div>
              <input type="number" min="0" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.required_night} onChange={e => setForm(f => ({ ...f, required_night: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>CONTRACT SALARY (₹)</div>
              <input type="number" min="0" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.contract_salary} onChange={e => setForm(f => ({ ...f, contract_salary: e.target.value }))} placeholder="e.g. 18000" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addPost} disabled={loading}>{loading ? "Saving..." : "Save Post"}</button>
            <button style={css.btn(C.red)} onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Posts & Required Staff per Shift</div>
      {posts.length === 0 && (
        <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim }}>No posts added yet. Click "+ Add Post" to get started!</div>
      )}
      {posts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr>{["Post / Role", "Req. Morning", "Req. Night", "Contract Salary (₹)", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td style={css.td}><strong>{post.name}</strong></td>
                  <td style={css.td}><input type="number" min="0" value={post.required_morning} onChange={e => updatePost(post, "required_morning", e.target.value)} style={{ ...css.input, width: 60, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" min="0" value={post.required_night} onChange={e => updatePost(post, "required_night", e.target.value)} style={{ ...css.input, width: 60, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" min="0" value={post.contract_salary || 0} onChange={e => updatePost(post, "contract_salary", e.target.value)} style={{ ...css.input, width: 100, textAlign: "center" }} /></td>
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

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [posts, setPosts] = useState([]);
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
      const { data: postsData } = await supabase.from("posts").select("*").order("name");
      if (postsData) setPosts(postsData);
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

  const alerts = getCoverage(employees.filter(e => e.status === "active"), attendance, posts);

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
      `}</style>
      <header style={css.header}>
        <div style={css.logo}>⚙ PRFM HR Portal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
          {tab === "dashboard" && <DashboardView employees={employees} attendance={attendance} posts={posts} />}
          {tab === "attendance" && <AttendanceView employees={employees} user={user} />}
          {tab === "staff" && <StaffView employees={employees} setEmployees={setEmployees} posts={posts} />}
          {tab === "payroll" && <PayrollView employees={employees} attendance={attendance} posts={posts} />}
          {tab === "settings" && <SettingsView posts={posts} setPosts={setPosts} />}
        </>
      )}
    </div>
  );
}