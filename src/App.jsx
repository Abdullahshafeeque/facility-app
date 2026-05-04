import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);

    const { data: yAtt } = await supabase.from("attendance").select("*").eq("date", yesterdayStr);
    const yMap = {};
    if (yAtt) yAtt.forEach(a => yMap[a.employee_id] = a.status);

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

    if (!attError) {
      // Use UPSERT so it overrides if the day was already submitted
      const { error: subErr } = await supabase.from("daily_submissions").upsert({ date: selectedDate, is_holiday: true });
      if (!subErr) {
        setIsSubmitted(true);
        setIsHoliday(true);
        const newMap = {};
        insertData.forEach(d => newMap[d.employee_id] = { status: d.status, ot_hours: 0 });
        setDayAttendance(newMap);
      } else {
        alert("Failed to lock the holiday in the database.");
      }
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
const generateAdvancedPDF = ({ target, start, end, ledger, employees }) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const filteredLedger = ledger.filter(l => {
    const isDateInRange = l.date >= start && l.date <= end;
    const isTargetMatch = target === "All" || l.employee_id === target;
    return isDateInRange && isTargetMatch;
  });

  doc.setFontSize(18);
  doc.text("PRFM HR - Financial Statement", 14, 22);
  doc.setFontSize(10);
  doc.text(`Period: ${start} to ${end}`, 14, 30);
  doc.text(`Target: ${target === "All" ? "Full Workforce" : employees.find(e => e.id === target)?.name}`, 14, 35);

  const tableData = filteredLedger.map(l => [
    l.date,
    employees.find(e => e.id === l.employee_id)?.name || "Unknown",
    l.transaction_type,
    `Rs. ${Number(l.amount).toLocaleString()}`,
    l.notes || "-"
  ]);

  window.jspdf.autoTable(doc, {
    startY: 45,
    head: [["Date", "Name", "Type", "Amount", "Notes"]],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 111, 219] },
    styles: { fontSize: 8 }
  });

  doc.save(`PRFM_Report_${start}_to_${end}.pdf`);
};

function PayrollView({ employees, attendance, posts, ledger, setLedger, user }) {
  const [target, setTarget] = useState("All");
  const [start, setStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [end, setEnd] = useState(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: "Advance", amount: "", notes: "", date: new Date().toISOString().split("T")[0] });
  const [saving, setSaving] = useState(false);

  const active = employees.filter(e => e.status === "active");

  const handleTransactionSubmit = async () => {
    if (!form.amount || Number(form.amount) <= 0) return alert("Enter amount");
    setSaving(true);
    const { data, error } = await supabase.from("financial_ledger").insert({
      employee_id: target === "All" ? active[0]?.id : target,
      date: form.date,
      transaction_type: form.type,
      amount: Number(form.amount),
      notes: form.notes
    }).select().single();

    if (!error && data) {
      setLedger(prev => [data, ...prev]);
      setShowModal(false);
      setForm({ type: "Advance", amount: "", notes: "", date: new Date().toISOString().split("T")[0] });
    }
    setSaving(false);
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 15 }}>
        <div>
          <div style={css.sectionTitle}>Finance & Reports</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Payroll Ledger</div>
        </div>
        <button style={css.btn(C.blue)} onClick={() => setShowModal(true)}>+ Add Transaction</button>
      </div>

      <div style={{ ...css.card, marginBottom: 25, background: "#f8fafc" }}>
        <div style={{ ...css.sectionTitle, marginBottom: 15 }}>Export Filtered Report</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 15, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SELECT PERSON</div>
            <select style={{ ...css.input, width: "100%" }} value={target} onChange={e => setTarget(e.target.value)}>
              <option value="All">All Staff</option>
              {active.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM DATE</div>
            <input type="date" style={{ ...css.input, width: "100%" }} value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO DATE</div>
            <input type="date" style={{ ...css.input, width: "100%" }} value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <button 
            style={{ ...css.btn(C.accent), height: 35 }} 
            onClick={() => generateAdvancedPDF({ target, start, end, ledger, employees })}
          >
            📥 Extract PDF Statement
          </button>
        </div>
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...css.card, maxWidth: 400, width: "100%" }}>
             <div style={css.sectionTitle}>New Transaction</div>
             <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                <select style={css.input} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                  <option value="Advance">Advance</option>
                  <option value="Bonus">Bonus</option>
                  <option value="Fine">Fine / Penalty</option>
                  <option value="Payout">Salary Payout</option>
                </select>
                <input type="number" placeholder="Amount (Rs)" style={css.input} value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
                <input type="text" placeholder="Notes (optional)" style={css.input} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={{ ...css.btn(C.blue), flex: 1 }} onClick={handleTransactionSubmit} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                  <button style={{ ...css.btn(C.red), flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                </div>
             </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={css.sectionTitle}>Transaction History</div>
        <div style={{ overflowX: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={css.table}>
            <thead>
              <tr>
                {["Date", "Staff Name", "Type", "Amount", "Notes"].map(h => (
                  <th key={h} style={css.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger
                .filter(l => {
                  const isDateInRange = l.date >= start && l.date <= end;
                  const isTargetMatch = target === "All" || l.employee_id === target;
                  return isDateInRange && isTargetMatch;
                })
                .map(l => {
                  const emp = employees.find(e => e.id === l.employee_id);
                  return (
                    <tr key={l.id}>
                      <td style={css.td}>{l.date}</td>
                      <td style={css.td}><strong>{emp ? emp.name : "Unknown"}</strong></td>
                      <td style={css.td}>
                        <span style={css.badge(
                          l.transaction_type === "Bonus" ? C.green : 
                          l.transaction_type === "Payout" ? C.blue : C.red
                        )}>
                          {l.transaction_type}
                        </span>
                      </td>
                      <td style={css.td}>
                        <strong style={{ color: l.transaction_type === "Bonus" ? C.green : C.text }}>
                          ₹{Number(l.amount).toLocaleString()}
                        </strong>
                      </td>
                      <td style={{ ...css.td, fontSize: 10, color: C.textDim }}>{l.notes || "-"}</td>
                    </tr>
                  );
                })}
              {ledger.filter(l => (target === "All" || l.employee_id === target) && (l.date >= start && l.date <= end)).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...css.td, textAlign: "center", padding: 40, color: C.textDim }}>
                    No transactions found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StaffView({ employees, setEmployees, posts, ledger }) {
  const [viewing, setViewing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company" });
  
  if (!employees) return <div style={{ padding: 20 }}>Loading workforce data...</div>;
  const active = employees.filter(e => e.status === "active");

  const addEmployee = async () => {
    if (!form.name || !form.post) return alert("Name and Post are required");
    setLoading(true);
    
    // Auto-fill salary for contract staff based on the post requirements in Settings
    let salary = form.base_salary;
    if (form.staff_type === "contract") {
      const postData = posts.find(p => p.name === form.post);
      salary = postData ? postData.contract_salary : 0;
    }

    const { data, error } = await supabase.from("employees").insert({
      ...form,
      base_salary: Number(salary),
      status: "active"
    }).select().single();

    if (!error && data) {
      setEmployees(prev => [...prev, data]);
      setShowForm(false);
      setForm({ name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company" });
    } else {
      alert("Error adding staff: " + error.message);
    }
    setLoading(false);
  };

  const updateEmployee = async (id, field, value) => {
    let updateData = { [field]: value };
    
    // AUTOMATIC SALARY SHIFT: If changing post for a contract worker, update their salary
    if (field === "post") {
      const newPostData = posts.find(p => p.name === value);
      if (newPostData && viewing.staff_type === "contract") {
        updateData.base_salary = newPostData.contract_salary;
      }
    }

    const { error } = await supabase.from("employees").update(updateData).eq("id", id);
    if (!error) {
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updateData } : e));
      setViewing(prev => ({ ...prev, ...updateData }));
    } else {
      alert("Update failed: " + error.message);
    }
  };

  const markInactive = async (emp) => {
    if (!window.confirm(`Mark ${emp.name} as left/inactive?`)) return;
    const { error } = await supabase.from("employees").update({ status: "inactive" }).eq("id", emp.id);
    if (!error) {
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "inactive" } : e));
      setViewing(null);
    }
  };

  return (
    <div style={css.page}>
      {/* --- HEADER WITH ADD BUTTON --- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={css.sectionTitle}>Workforce</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Staff Directory</div>
        </div>
        <button style={css.btn(C.green)} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Close Form" : "+ Add Employee"}
        </button>
      </div>

      {/* --- ADD EMPLOYEE FORM --- */}
      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, border: `1px solid ${C.green}44` }}>
          <div style={css.sectionTitle}>Register New Staff</div>
          <div style={css.grid4}>
            <input placeholder="Full Name" style={css.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input placeholder="Aadhar Number" style={css.input} value={form.aadhar} onChange={e => setForm({...form, aadhar: e.target.value})} />
            <select style={css.input} value={form.staff_type} onChange={e => setForm({...form, staff_type: e.target.value})}>
              <option value="company">Company Staff</option>
              <option value="contract">Contract Staff</option>
            </select>
            <select style={css.input} value={form.post} onChange={e => setForm({...form, post: e.target.value})}>
              <option value="">Select Post</option>
              {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <select style={css.input} value={form.shift} onChange={e => setForm({...form, shift: e.target.value})}>
              <option value="Morning">Morning Shift</option>
              <option value="Night">Night Shift</option>
            </select>
            {form.staff_type === "company" && (
              <input type="number" placeholder="Base Salary" style={css.input} value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})} />
            )}
          </div>
          <button style={{ ...css.btn(C.green), marginTop: 15 }} onClick={addEmployee} disabled={loading}>
            {loading ? "Registering..." : "Complete Registration"}
          </button>
        </div>
      )}

      {/* --- INDIVIDUAL PROFILE POPUP (With High Contrast Close) --- */}
      {viewing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...css.card, maxWidth: 500, width: "100%", border: `2px solid ${C.accent}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>Staff Profile</div>
              <button 
                onClick={() => setViewing(null)} 
                style={{ background: C.red, color: "white", border: "none", borderRadius: "4px", padding: "6px 14px", cursor: "pointer", fontWeight: "bold", fontSize: 12 }}
              >
                CLOSE [X]
              </button>
            </div>
            
            <div style={{ textAlign: "center", marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 15 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{viewing.name}</div>
              <span style={css.badge(staffTypeColor(viewing.staff_type))}>{viewing.staff_type}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15, marginBottom: 25, background: C.bg, padding: 15, borderRadius: 8 }}>
              <div><div style={{ fontSize: 10, color: C.textDim }}>AADHAR</div><strong>{viewing.aadhar || "-"}</strong></div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>SALARY (MONTHLY)</div><strong style={{color: C.green}}>₹{Number(viewing.base_salary).toLocaleString()}</strong></div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST / ROLE</div>
                <select style={{...css.input, width: "100%"}} value={viewing.post} onChange={(e) => updateEmployee(viewing.id, "post", e.target.value)}>
                  {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SHIFT</div>
                <select style={{...css.input, width: "100%"}} value={viewing.shift} onChange={(e) => updateEmployee(viewing.id, "shift", e.target.value)}>
                  <option value="Morning">Morning</option>
                  <option value="Night">Night</option>
                </select>
              </div>
            </div>

            <div style={css.sectionTitle}>Ledger History</div>
            <div style={{ maxHeight: 150, overflowY: "auto", background: C.bg, borderRadius: 6, padding: 10 }}>
              {(ledger || []).filter(l => l.employee_id === viewing.id).length === 0 ? (
                <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>No history found.</div>
              ) : (
                ledger.filter(l => l.employee_id === viewing.id).map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11 }}>{l.date} - {l.transaction_type}</span>
                    <strong style={{ fontSize: 11, color: l.transaction_type === "Bonus" ? C.green : C.red }}>₹{l.amount}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- STAFF TABLE --- */}
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead>
            <tr>{["Name", "Post", "Shift", "Type", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {active.map(emp => (
              <tr key={emp.id}>
                <td style={{ ...css.td, cursor: "pointer" }} onClick={() => setViewing(emp)}>
                  <div style={{ color: C.accent, fontWeight: 700, textDecoration: "underline" }}>{emp.name}</div>
                </td>
                <td style={css.td}>{emp.post}</td>
                <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                <td style={css.td}>
                  <button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => markInactive(emp)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsView({ posts, setPosts, employees, setEmployees }) {
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
      setError(dbError.message);
    } else if (data) {
      setPosts(prev => [...prev, data]);
      setForm({ name: "", required_morning: 1, required_night: 1, contract_salary: 0 });
      setShowForm(false);
    }
    setLoading(false);
  };

  const deletePost = async (post) => {
    if (!window.confirm(`Remove post "${post.name}"? This will not delete employees but they will have no assigned role requirements.`)) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setPosts(prev => prev.filter(p => p.id !== post.id));
  };

  const updatePost = async (post, field, value) => {
    const newVal = field === "name" ? value : Number(value);
    
    // CASCADE UPDATE: If renaming the role, update all staff assigned to it
    if (field === "name" && value !== post.name) {
      const { error: empError } = await supabase
        .from("employees")
        .update({ post: value })
        .eq("post", post.name);
        
      if (empError) {
        alert("Failed to sync employee records. Update cancelled.");
        return;
      }
      // Sync local staff state
      setEmployees(prev => prev.map(e => e.post === post.name ? { ...e, post: value } : e));
    }

    const { error } = await supabase.from("posts").update({ [field]: newVal }).eq("id", post.id);
    if (!error) {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, [field]: newVal } : p));
    } else {
      alert("Error updating database.");
    }
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
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST NAME</div>
              <input style={{ ...css.input, width: "100%" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REQ. MORNING</div>
              <input type="number" style={{ ...css.input, width: "100%" }} value={form.required_morning} onChange={e => setForm(f => ({ ...f, required_morning: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REQ. NIGHT</div>
              <input type="number" style={{ ...css.input, width: "100%" }} value={form.required_night} onChange={e => setForm(f => ({ ...f, required_night: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>CONTRACT SALARY (₹)</div>
              <input type="number" style={{ ...css.input, width: "100%" }} value={form.contract_salary} onChange={e => setForm(f => ({ ...f, contract_salary: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addPost} disabled={loading}>Save Post</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Manage Posts & Requirements</div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead>
            <tr>
              {["Post / Role", "Req. Morning", "Req. Night", "Contract Salary (₹)", "Action"].map(h => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map(post => (
              <tr key={post.id}>
                <td style={css.td}>
                  <input 
                    type="text" 
                    defaultValue={post.name} 
                    onBlur={e => e.target.value !== post.name && updatePost(post, "name", e.target.value)}
                    style={{ ...css.input, fontWeight: 700, width: "100%", border: "1px solid transparent", background: "transparent" }}
                  />
                </td>
                <td style={css.td}>
                  <input 
                    type="number" 
                    defaultValue={post.required_morning} 
                    onBlur={e => updatePost(post, "required_morning", e.target.value)}
                    style={{ ...css.input, width: 70, textAlign: "center" }} 
                  />
                </td>
                <td style={css.td}>
                  <input 
                    type="number" 
                    defaultValue={post.required_night} 
                    onBlur={e => updatePost(post, "required_night", e.target.value)}
                    style={{ ...css.input, width: 70, textAlign: "center" }} 
                  />
                </td>
                <td style={css.td}>
                  <input 
                    type="number" 
                    defaultValue={post.contract_salary || 0} 
                    onBlur={e => updatePost(post, "contract_salary", e.target.value)}
                    style={{ ...css.input, width: 110, textAlign: "center" }} 
                  />
                </td>
                <td style={css.td}>
                  <button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => deletePost(post)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [posts, setPosts] = useState([]);
  const [ledger, setLedger] = useState([]); // <--- ADD THIS EXACT LINE HERE
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

      // <--- ADD THESE TWO EXACT LINES HERE --->
      const { data: ledgData } = await supabase.from("financial_ledger").select("*").order("date", { ascending: false });
      if (ledgData) setLedger(ledgData);

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
          {tab === "staff" && (
  <StaffView 
    employees={employees} 
    setEmployees={setEmployees} 
    posts={posts} 
    ledger={ledger} 
  />
)}
          {tab === "payroll" && <PayrollView employees={employees} attendance={attendance} posts={posts} ledger={ledger} setLedger={setLedger} user={user} />}
          {tab === "settings" && <SettingsView posts={posts} setPosts={setPosts} employees={employees} setEmployees={setEmployees} />}
        </>
      )}
    </div>
  );
}