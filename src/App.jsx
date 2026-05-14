import React, { useState, useEffect } from "react";
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
  header: { background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 6, height: 56, position: "sticky", top: 0, zIndex: 100 },
  logo: { fontSize: 13, fontWeight: 700, letterSpacing: 3, color: C.accent, textTransform: "uppercase" },
  badge: (color) => ({ background: color + "22", color: color, border: `1px solid ${color}55`, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }),
  nav: { display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.panel },
  navBtn: (active) => ({ background: active ? C.accentDim : "transparent", color: active ? C.accent : C.textDim, border: `1px solid ${active ? C.accent + "55" : "transparent"}`, borderRadius: 4, padding: "5px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }),
  page: { padding: "16px 12px 0" },
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
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12px 8px", overflowY: "auto" },
};

const statusColor = (s) => s === "Present" ? C.green : s === "Absent" ? C.red : C.accent;
const shiftColor = (s) => s === "Morning" ? C.accent : C.blue;
const staffTypeColor = (t) => t === "company" ? C.blue : C.green;
const getLocalDateStr = (d = new Date()) => { const dt = new Date(d); dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset()); return dt.toISOString().split("T")[0]; };
const todayStr = getLocalDateStr();
// NEW: Formats yyyy-mm-dd into dd-mm-yyyy for display
const fDate = (d) => (d && typeof d === "string" && d.includes("-")) ? d.split("-").reverse().join("-") : (d || "—");

function getCoverage(employees, attendance, posts) {
  if (!posts || posts.length === 0) return [];
  const alerts = [];
  ["Morning", "Night"].forEach(shift => {
    posts.forEach(post => {
      const required = shift === "Morning" ? post.required_morning : post.required_night;
      // FIXED: Count staff as available to fill the post unless explicitly marked Absent or Leave
      const present = employees.filter(e => e.shift === shift && e.post === post.name && attendance[e.id]?.status !== "Absent" && attendance[e.id]?.status !== "Leave").length;
      if (present < required) alerts.push({ shift, post: post.name, present, required, shortage: required - present });
    });
  });
  return alerts;
}

function calcFinances(employee, posts, rangeAttendance, ledger, start, end, postHistory, overtime) {
  // 1. Resolve Post History (Handles role promotions/shifts correctly)
  const empHistory = (postHistory || []).filter(h => h.employee_id === employee.id).sort((a, b) => (a.valid_from || "").localeCompare(b.valid_from || ""));
  const joiningDate = employee.joining_date || start;
  const effectiveStart = joiningDate > start ? joiningDate : start;
  const effectiveEnd = employee.left_date && employee.left_date < end ? employee.left_date : end;

  // FIXED: Stop calculating if the evaluation period is completely before the employee joined
  if (effectiveEnd < effectiveStart) {
    return { periods: [], proratedSalary: 0, attendanceDeduction: 0, otEarnings: 0, absentDays: 0, leaveDays: 0, totalOTHours: 0, totalBonuses: 0, foodAllowance: 0, totalAdvances: 0, totalPaid: 0, totalContractorDist: 0, totalLoans: 0, totalRepayments: 0, pendingLoan: 0, netPayable: 0, joiningDate, effectiveStart };
  }

  const periods = [];

  if (empHistory.length === 0) {
    const salary = employee.staff_type === "contract" ? (posts.find(p => p.name === employee.post)?.contract_salary || 0) : (employee.base_salary || 0);
    periods.push({ from: effectiveStart, to: effectiveEnd, post: employee.post, salary });
  } else {
    let cursor = effectiveStart;
    for (let i = 0; i < empHistory.length; i++) {
      const h = empHistory[i];
      
      if (h.valid_from && h.valid_from > cursor && h.valid_from <= effectiveEnd) {
             const [gy, gm, gd] = h.valid_from.split('-').map(Number);
             const gapEndObj = new Date(gy, gm - 1, gd - 1);
             const gapEnd = [gapEndObj.getFullYear(), String(gapEndObj.getMonth() + 1).padStart(2, "0"), String(gapEndObj.getDate()).padStart(2, "0")].join("-");
             if (gapEnd >= cursor) {
                const fallbackSalary = employee.staff_type === "contract" ? (posts.find(p => p.name === employee.post)?.contract_salary || 0) : (employee.base_salary || 0);
                periods.push({ from: cursor, to: gapEnd, post: employee.post, salary: fallbackSalary });
             }
          }

          const periodEnd = h.valid_to ? (h.valid_to < effectiveEnd ? h.valid_to : effectiveEnd) : effectiveEnd;
          const periodStart = h.valid_from > cursor ? h.valid_from : cursor;
          if (periodStart <= periodEnd && periodStart <= effectiveEnd) {
            periods.push({ from: periodStart, to: periodEnd, post: h.post, salary: h.salary });
            const [py, pm, pd] = periodEnd.split('-').map(Number);
            const nextDayObj = new Date(py, pm - 1, pd + 1);
            cursor = [nextDayObj.getFullYear(), String(nextDayObj.getMonth() + 1).padStart(2, "0"), String(nextDayObj.getDate()).padStart(2, "0")].join("-");
          }
    }
    if (cursor <= effectiveEnd) {
      const currentSalary = employee.staff_type === "contract" ? (posts.find(p => p.name === employee.post)?.contract_salary || 0) : (employee.base_salary || 0);
      periods.push({ from: cursor, to: effectiveEnd, post: employee.post, salary: currentSalary });
    }
  }

  let totalProratedSalary = 0, totalAttendanceDeduction = 0, totalOTEarnings = 0;
  let totalAbsentDays = 0, totalLeaveDays = 0, totalOTHours = 0;
  const periodBreakdown = [];

  // --- SANDWICH LEAVE LOGIC PREP ---
  const empAttMap = {};
  (rangeAttendance || []).filter(a => a.employee_id === employee.id).forEach(a => empAttMap[a.date] = a.status);
  
  const getEffStatus = (dateStr) => {
    if (empAttMap[dateStr] !== "Holiday") return empAttMap[dateStr];
    
    // It is a holiday, check bounds for Sandwich
    const [y, m, d] = dateStr.split('-').map(Number);
    let pDt = new Date(y, m - 1, d), nDt = new Date(y, m - 1, d);
    let pStat = "Holiday", nStat = "Holiday";
    
    // Look backwards past any consecutive holidays
    while (pStat === "Holiday") {
      pDt.setDate(pDt.getDate() - 1);
      pStat = empAttMap[[pDt.getFullYear(), String(pDt.getMonth() + 1).padStart(2, "0"), String(pDt.getDate()).padStart(2, "0")].join("-")] || "Present";
    }
    // Look forwards past any consecutive holidays
    while (nStat === "Holiday") {
      nDt.setDate(nDt.getDate() + 1);
      nStat = empAttMap[[nDt.getFullYear(), String(nDt.getMonth() + 1).padStart(2, "0"), String(nDt.getDate()).padStart(2, "0")].join("-")] || "Present";
    }
    
    return (pStat === "Absent" && nStat === "Absent") ? "Absent" : "Holiday";
  };

  for (const period of periods) {
    // Parse dates safely to avoid timezone shifting bugs
    const [sYear, sMonth, sDay] = period.from.split('-').map(Number);
    const [eYear, eMonth, eDay] = period.to.split('-').map(Number);
    let curr = new Date(sYear, sMonth - 1, sDay);
    const endDt = new Date(eYear, eMonth - 1, eDay);
    
    const daysInPeriod = Math.round((endDt - curr) / 86400000) + 1;
    
    // FIXED MATH 1: Base Salary accounts for the exact number of days in the month.
      // This guarantees a full 28-day Feb or 31-day March equals exactly 100% of the monthly salary.
      const periodAtt = rangeAttendance.filter(a => a.employee_id === employee.id && a.date >= period.from && a.date <= period.to);
      
      // Read the global Tracking Start Date to enforce attendance rules safely
      const now = new Date();
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const trackingStartedStr = localStorage.getItem("trackingStartDate") || defaultStart;

      let proratedSalary = 0;
      let tempCurr = new Date(curr);
      while (tempCurr <= endDt) {
        const dateStr = [tempCurr.getFullYear(), String(tempCurr.getMonth() + 1).padStart(2, "0"), String(tempCurr.getDate()).padStart(2, "0")].join("-");
        
        // Only credit base pay for historical days OR days where attendance was officially submitted
        if (dateStr < trackingStartedStr || periodAtt.some(a => a.date === dateStr)) {
          const daysInThisMonth = new Date(tempCurr.getFullYear(), tempCurr.getMonth() + 1, 0).getDate();
          proratedSalary += period.salary / daysInThisMonth;
        }
        tempCurr.setDate(tempCurr.getDate() + 1);
      }
      
      // FIXED MATH 2: Deductions use exact days in the month to perfectly cancel out base pay, OT uses annualized 365-day rate
      const daysInThisMonth = new Date(sYear, sMonth, 0).getDate();
      const dailyWorkingRate = period.salary / daysInThisMonth; 
      const hourlyRate = Math.round((((period.salary * 12) / 365) / 12) * 2) / 2;
      
      let absentDays = 0;
      let leaveDays = 0;
      periodAtt.forEach(a => {
        const eff = getEffStatus(a.date);
        if (eff === "Absent") absentDays++;
        else if (eff === "Leave") leaveDays++;
      });
      
    const periodOT = (overtime || []).filter(o => o.employee_id === employee.id && o.date >= period.from && o.date <= period.to);
    
    // Calculate the actual financial impact of attendance
    const attendanceDeduction = (absentDays + leaveDays) * dailyWorkingRate;
    
    // Dynamic OT Earnings: Pay by the specific post worked, fallback to their personal rate if post pay is 0
    let otHours = 0;
    let otEarnings = 0;
    
    periodOT.forEach(o => {
      otHours += Number(o.hours);
      let appliedHourlyRate = hourlyRate; // Fallback to their normal personal salary rate
      
      const otPost = posts.find(p => p.name === o.post);
      if (otPost) {
        // Find the salary set for this specific job
        const jobSalary = Number(otPost.contract_salary) || Number(otPost.base_salary) || 0;
        if (jobSalary > 0) {
          appliedHourlyRate = Math.round((((jobSalary * 12) / 365) / 12) * 2) / 2;
        }
      }
      
      otEarnings += Number(o.hours) * appliedHourlyRate;
    });
    
    totalProratedSalary += proratedSalary;
    totalAttendanceDeduction += attendanceDeduction;
    totalOTEarnings += otEarnings;
    totalAbsentDays += absentDays;
    totalLeaveDays += leaveDays;
    totalOTHours += otHours;
    
    periodBreakdown.push({ ...period, daysInPeriod, proratedSalary, absentDays, leaveDays, otHours, attendanceDeduction, otEarnings });
  }

  // Calculate Ledger impacts (Advances, Fines, Payouts, Bonuses)
  const staffLedger = (ledger || []).filter(l => l.employee_id === employee.id && l.date >= start && l.date <= end);
  const totalBonuses = staffLedger.filter(l => l.transaction_type === "Bonus").reduce((s, l) => s + Number(l.amount), 0);
  const totalAdvances = staffLedger.filter(l => l.transaction_type === "Advance" || l.transaction_type === "Fine").reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid = staffLedger.filter(l => l.transaction_type === "Payout").reduce((s, l) => s + Number(l.amount), 0);
  const totalContractorDist = staffLedger.filter(l => l.transaction_type === "Contractor Distribution").reduce((s, l) => s + Number(l.amount), 0);
  
  // NEW: Dedicated Loan System Tracker
  const totalLoans = staffLedger.filter(l => l.transaction_type === "Loan Given").reduce((s, l) => s + Number(l.amount), 0);
  const totalRepayments = staffLedger.filter(l => l.transaction_type === "Loan Repayment").reduce((s, l) => s + Number(l.amount), 0);
  const pendingLoan = totalLoans - totalRepayments;

  // FOOD ALLOWANCE (60% Minimum Attendance Rule)
  const totalDaysInRange = Math.max(1, Math.round((new Date(effectiveEnd) - new Date(effectiveStart)) / 86400000) + 1);
  let foodAllowance = 0;
  if (employee.has_food_allowance && employee.food_allowance_amount > 0) {
    const presentDays = totalDaysInRange - totalAbsentDays - totalLeaveDays;
    const attendancePercent = presentDays / totalDaysInRange;
    
    if (attendancePercent >= 0.60) {
      // Prorate for partial months (e.g. joined mid-month), otherwise give full amount
      foodAllowance = totalDaysInRange >= 28 ? employee.food_allowance_amount : Math.round((employee.food_allowance_amount / 30) * totalDaysInRange);
    }
  }

  // The Final Logical Output
  const netPayable = (totalProratedSalary + totalBonuses + totalOTEarnings + totalRepayments + foodAllowance) - (totalAttendanceDeduction + totalAdvances + totalPaid + totalLoans + totalContractorDist);

  return { periods: periodBreakdown, proratedSalary: totalProratedSalary, attendanceDeduction: totalAttendanceDeduction, otEarnings: totalOTEarnings, absentDays: totalAbsentDays, leaveDays: totalLeaveDays, totalOTHours, totalBonuses, foodAllowance, totalAdvances, totalPaid, totalContractorDist, totalLoans, totalRepayments, pendingLoan, netPayable, joiningDate: employee.joining_date || start, effectiveStart };
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

// ─── OVERTIME ─────────────────────────────────────────────────────────────────
function OvertimeView({ employees, posts, overtime, setOvertime, logAction, myRole }) {
  const [form, setForm] = useState({ empIds: [], startDate: todayStr, endDate: todayStr, start: "", end: "", post: "" });
  const [saving, setSaving] = useState(false);
  const active = employees.filter(e => e.status === "active");

  const handleAddOT = async () => {
    if (!form.empIds || form.empIds.length === 0 || !form.startDate || !form.endDate || !form.start || !form.end || !form.post) return alert("Please fill all fields and select at least one employee.");

    // Append :00 to time to guarantee strict browser parsing
    const dStart = new Date(`${form.startDate}T${form.start}:00`);
    const dEnd = new Date(`${form.endDate}T${form.end}:00`);

    if (isNaN(dStart) || isNaN(dEnd)) return alert("Error: Invalid date or time.");
    if (dEnd <= dStart) return alert("Error: The end date/time must be AFTER the start date/time.");

    const hours = (dEnd - dStart) / 3600000;
    if (hours > 12) return alert("Error: Overtime cannot exceed 12 hours.");

    const entriesToInsert = [];
    let overlapErrors = [];

    for (const id of form.empIds) {
      const emp = employees.find(e => String(e.id) === String(id));
      if (!emp) continue;

      if (emp.post === form.post) {
        const otPostData = posts.find(p => p.name === emp.post) || {};
        const mStart = otPostData.morning_start || "06:00:00";
        const nStart = otPostData.night_start || "18:00:00";
        const shiftStartStr = emp.shift === "Morning" ? mStart : nStart;

        const checkOverlap = (s1, e1, s2, e2) => Math.max(s1, s2) < Math.min(e1, e2);
        const isOverlap = [-1, 0, 1].some(offset => {
          const shiftStartDt = new Date(`${form.startDate}T${shiftStartStr}`);
          shiftStartDt.setDate(shiftStartDt.getDate() + offset);
          const shiftEndDt = new Date(shiftStartDt);
          shiftEndDt.setHours(shiftStartDt.getHours() + 12);
          return checkOverlap(dStart, dEnd, shiftStartDt, shiftEndDt);
        });

        if (isOverlap) {
          overlapErrors.push(emp.name);
          continue;
        }
      }
      
      entriesToInsert.push({
        employee_id: emp.id, 
        date: form.startDate, 
        end_date: form.endDate,
        start_time: form.start, 
        end_time: form.end, 
        hours: Number(hours.toFixed(2)), 
        post: form.post
      });
    }

    if (overlapErrors.length > 0) {
      return alert(`Overlap Error: The following employees are scheduled for a regular shift during this time:\n${overlapErrors.join(", ")}`);
    }

    if (entriesToInsert.length === 0) return;

    setSaving(true);
    
    // Use .select() without .single() for bulk insert
    const { data, error } = await supabase.from("overtime_entries").insert(entriesToInsert).select();

    setSaving(false);

    if (error) return alert("Database Error: " + error.message);
    
    setOvertime(prev => [...data, ...prev]);
    setForm({ ...form, start: "", end: "", empIds: [] });
    if (logAction) logAction("Overtime Logged", `Added ${Number(hours).toFixed(1)}h for ${entriesToInsert.length} employee(s) on ${form.startDate}`);
  };

  const deleteOT = async (id) => {
    if (!window.confirm("Delete this Overtime entry?")) return;
    await supabase.from("overtime_entries").delete().eq("id", id);
    setOvertime(prev => prev.filter(o => o.id !== id));
  await supabase.from("overtime_entries").delete().eq("id", id);
    setOvertime(prev => prev.filter(o => o.id !== id));
    if (logAction) logAction("Overtime Deleted", `Removed an OT entry`);
  };

  return (
    <div style={css.page}>
      <div style={css.sectionTitle}>Log Overtime</div>
      <div style={{ ...css.card, marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "flex-end" }}>
        <div style={{ gridColumn: "1 / -1", width: "100%", boxSizing: "border-box" }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>ADD EMPLOYEES</div>
          
          <select 
            style={{ ...css.input, width: "100%", padding: "10px", backgroundColor: C.bg }}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id && !form.empIds.includes(id)) {
                setForm(prev => ({ ...prev, empIds: [...prev.empIds, id] }));
              }
            }}
          >
            <option value="">-- Tap to select and add an employee --</option>
            {active.filter(e => !form.empIds.includes(e.id)).map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.code || e.id})</option>
            ))}
          </select>

          {form.empIds.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 10, color: C.textDim, fontWeight: "bold" }}>SELECTED EMPLOYEES ({form.empIds.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {form.empIds.map(id => {
                  const emp = active.find(a => String(a.id) === String(id));
                  if (!emp) return null;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accent, padding: "6px 12px", borderRadius: "20px", fontSize: 13, fontWeight: 600 }}>
                      <span>{emp.name} <span style={{ opacity: 0.7, fontSize: 11 }}>({emp.code || emp.id})</span></span>
                      <span 
                        onClick={() => setForm(prev => ({ ...prev, empIds: prev.empIds.filter(eid => eid !== id) }))}
                        style={{ marginLeft: 4, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                      >
                        ×
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>WORKED AS (POST)</div>
          <select style={{...css.input, width: 160}} value={form.post} onChange={e => setForm({...form, post: e.target.value})}>
            <option value="">-- Select --</option>
            {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>START DATE</div><input type="date" style={css.input} value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} /></div>
        <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>START TIME</div>
          <select style={css.input} value={form.start} onChange={e => setForm({...form, start: e.target.value})}>
            <option value="">-- Time --</option>
            {Array.from({length: 48}).map((_, i) => { const h24 = Math.floor(i/2); const m = i%2===0?'00':'30'; const ampm = h24>=12?'PM':'AM'; const h12 = h24===0?12:(h24>12?h24-12:h24); const val = `${String(h24).padStart(2,'0')}:${m}`; const label = `${String(h12).padStart(2,'0')}:${m} ${ampm}`; return <option key={val} value={val}>{label}</option>; })}
          </select>
        </div>
        <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>END DATE</div><input type="date" style={css.input} value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} /></div>
        <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>END TIME</div>
          <select style={css.input} value={form.end} onChange={e => setForm({...form, end: e.target.value})}>
            <option value="">-- Time --</option>
            {Array.from({length: 48}).map((_, i) => { const h24 = Math.floor(i/2); const m = i%2===0?'00':'30'; const ampm = h24>=12?'PM':'AM'; const h12 = h24===0?12:(h24>12?h24-12:h24); const val = `${String(h24).padStart(2,'0')}:${m}`; const label = `${String(h12).padStart(2,'0')}:${m} ${ampm}`; return <option key={val} value={val}>{label}</option>; })}
          </select>
        </div>
        <button style={{ ...css.btn(C.green), width: "100%", padding: "10px" }} onClick={handleAddOT} disabled={saving}>+ Save OT</button>
      </div>

      <div style={css.sectionTitle}>Recent OT Entries</div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr>{["Start Date", "End Date", "Employee", "Post", "From", "To", "Hours", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {overtime.length === 0 && <tr><td colSpan={7} style={{...css.td, textAlign: "center"}}>No OT entries found.</td></tr>}
            {overtime.slice(0, 50).map(o => {
              const emp = employees.find(e => e.id === o.employee_id);
              return (
                <tr key={o.id}>
                  <td style={css.td}>{fDate(o.date)}</td>
                  <td style={css.td}>{fDate(o.end_date || o.date)}</td>
                  <td style={css.td}><strong>{emp?.name || "Unknown"}</strong></td>
                  <td style={css.td}>{o.post}</td>
                  <td style={css.td}>{o.start_time}</td>
                  <td style={css.td}>{o.end_time}</td>
                  <td style={{...css.td, color: C.green, fontWeight: "bold"}}>{Number(o.hours).toFixed(1)}h</td>
                  <td style={css.td}>{myRole === "director" && <button style={{...css.btn(C.red), padding: "4px 8px"}} onClick={() => deleteOT(o.id)}>✕</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashboardView({ employees, attendance, posts, trackingStartDate }) {
  const [missingDates, setMissingDates] = useState([]);

  useEffect(() => {
    const checkMissingAttendance = async () => {
      const { data } = await supabase.from("attendance").select("date, employee_id").gte("date", trackingStartDate).lte("date", todayStr);
      
      const empShiftMap = {};
      employees.forEach(e => empShiftMap[e.id] = e.shift);

      const dateShifts = {};
      (data || []).forEach(d => {
        const shift = empShiftMap[d.employee_id];
        if (shift) {
          if (!dateShifts[d.date]) dateShifts[d.date] = new Set();
          dateShifts[d.date].add(shift);
        }
      });

      const missing = [];
      let currStr = trackingStartDate;
      while (currStr <= todayStr) {
        const shifts = dateShifts[currStr];
        // Flag as missing if NO data, or if either Morning or Night is missing
        if (!shifts || !shifts.has("Morning") || !shifts.has("Night")) {
          missing.push(currStr);
        }
        const [y, m, d] = currStr.split("-").map(Number);
        const nextDt = new Date(y, m - 1, d + 1);
        currStr = [nextDt.getFullYear(), String(nextDt.getMonth() + 1).padStart(2, "0"), String(nextDt.getDate()).padStart(2, "0")].join("-");
      }
      setMissingDates(missing.sort().reverse());
    };
    checkMissingAttendance();
  }, [trackingStartDate, employees]);
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
        {missingDates.length > 0 && (
          <div style={{ ...css.alert, background: C.orange + "15", border: `1px solid ${C.orange}44`, marginTop: 8, alignItems: "flex-start" }}>
            <span style={{ color: C.orange, fontSize: 16 }}>⚠</span>
            <span style={{ color: C.orange }}>
              <strong>Pending Attendance:</strong> {missingDates.map(fDate).join(", ")}
            </span>
          </div>
        )}
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
                    // FIXED: Progress bar reflects expected roster availability rather than strictly 'Present'
                    const pres = sEmp.filter(e => e.post === post.name && attendance[e.id]?.status !== "Absent" && attendance[e.id]?.status !== "Leave").length;
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
function AttendanceView({ employees, logAction, myRole }) {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dayAttendance, setDayAttendance] = useState({});
  const [activeShift, setActiveShift] = useState("Morning");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const active = employees.filter(e => e.status === "active");
  let filtered = active.filter(e => e.shift === activeShift);
  if (search.trim()) filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const loadDay = async () => {
      setLoading(true);
      const { data: attData } = await supabase.from("attendance").select("*").eq("date", selectedDate);
      
      const attMap = {};
      let shiftHasData = false;
          let shiftIsHoliday = false;
          
          if (attData) {
            attData.forEach(a => { 
              attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours }; 
              const emp = active.find(e => e.id === a.employee_id);
              if (emp && emp.shift === activeShift) {
                shiftHasData = true;
                if (a.status === "Holiday") shiftIsHoliday = true;
              }
            });
          }
          
          setIsSubmitted(shiftHasData);
          setIsHoliday(shiftHasData && shiftIsHoliday);
      setDayAttendance(attMap);
      setLoading(false);
    };
    loadDay();
  }, [selectedDate, activeShift, employees]);

  const toggle = (id, field, value) => setDayAttendance(prev => ({ ...prev, [id]: { ...(prev[id] || { status: "Present", ot_hours: 0 }), [field]: value } }));

  const markAllPresent = () => {
    const newMap = { ...dayAttendance };
    filtered.forEach(emp => { newMap[emp.id] = { ...(newMap[emp.id] || {}), status: "Present", ot_hours: newMap[emp.id]?.ot_hours || 0 }; });
    setDayAttendance(newMap);
  };

  const handleSubmit = async () => {
    if (selectedDate > todayStr) return alert("Cannot submit for future dates!");
    setSaving(true);
    const insertData = filtered.map(emp => { const rec = dayAttendance[emp.id] || { status: "Present", ot_hours: 0 }; return { employee_id: emp.id, date: selectedDate, status: rec.status, ot_hours: rec.ot_hours || 0 }; });
    
    const empIds = filtered.map(e => e.id);
    if (empIds.length > 0) {
      await supabase.from("attendance").delete().eq("date", selectedDate).in("employee_id", empIds);
      await supabase.from("attendance").insert(insertData);
    }
    
    setIsSubmitted(true); setIsHoliday(false); setSaving(false);
  setIsSubmitted(true); setIsHoliday(false); setSaving(false);
    if (logAction) logAction("Attendance Submitted", `Marked ${activeShift} shift for ${selectedDate}`);
  };

  const handleHolidaySubmit = async () => {
    setSaving(true);
    const insertData = filtered.map(emp => ({ employee_id: emp.id, date: selectedDate, status: "Holiday", ot_hours: 0 }));
    
    const empIds = filtered.map(e => e.id);
    if (empIds.length > 0) {
      await supabase.from("attendance").delete().eq("date", selectedDate).in("employee_id", empIds);
      await supabase.from("attendance").insert(insertData);
    }
    
    setIsSubmitted(true); setIsHoliday(true);
    const newMap = { ...dayAttendance };
    filtered.forEach(e => { newMap[e.id] = { status: "Holiday", ot_hours: 0 }; });
    setDayAttendance(newMap);
    setSaving(false);
    setDayAttendance(newMap);
    setSaving(false);
    if (logAction) logAction("Holiday Declared", `Marked ${selectedDate} as Holiday for ${activeShift} shift`);
  };

  const handleUnsubmit = async () => { 
    setSaving(true);
    const empIds = filtered.map(e => e.id);
    if (empIds.length > 0) {
      await supabase.from("attendance").delete().eq("date", selectedDate).in("employee_id", empIds);
    }
    setIsSubmitted(false); setIsHoliday(false); 
    setSaving(false);
    setIsSubmitted(false); setIsHoliday(false); 
    setSaving(false);
    if (logAction) logAction("Attendance Unlocked", `Unlocked ${selectedDate} for ${activeShift} shift`);
  };

  const presentCount = filtered.filter(e => ["Present", "Holiday"].includes(dayAttendance[e.id]?.status || "Present")).length;
  const absentCount = filtered.filter(e => dayAttendance[e.id]?.status === "Absent").length;
  const leaveCount = filtered.filter(e => dayAttendance[e.id]?.status === "Leave").length;

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>ATTENDANCE LOG</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input type="date" max={todayStr} value={selectedDate} onChange={e => { if (e.target.value <= todayStr) setSelectedDate(e.target.value); }} style={{ ...css.input, fontSize: 16, fontWeight: 700, padding: "8px 12px", border: `2px solid ${C.accent}44` }} />
            {isHoliday ? <span style={css.badge(C.orange)}>⛱ HOLIDAY</span> : isSubmitted ? <span style={css.badge(C.green)}>✓ SUBMITTED</span> : <span style={css.badge(C.textDim)}>DRAFT</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Morning", "Night"].map(s => <button key={s} style={css.navBtn(activeShift === s)} onClick={() => setActiveShift(s)}>{s} Shift</button>)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={css.badge(C.green)}>✓ {presentCount} Present</span>
        <span style={css.badge(C.red)}>✗ {absentCount} Absent</span>
        <span style={css.badge(C.accent)}>⏸ {leaveCount} Leave</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input placeholder="🔍 Search employee..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...css.input, flex: 1, minWidth: 180 }} />
        {!isHoliday && (!isSubmitted || myRole === "director") && <button style={css.btn(C.green)} onClick={markAllPresent}>✓ Mark All Present</button>}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>Loading {selectedDate}...</div> : (
        <>
          <div style={{ overflowX: "auto", opacity: isSubmitted ? 0.8 : 1 }}>
            <table style={css.table}>
              <thead><tr>{["Name", "Post", "Type", "Shift", "Status", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No employees found.</td></tr>}
                {filtered.map(emp => {
                  const rec = dayAttendance[emp.id] || { status: "Present", ot_hours: 0 };
                  return (
                    <tr key={emp.id} style={{ background: isHoliday ? C.orange + "15" : rec.status === "Absent" ? C.red + "08" : rec.status === "Leave" ? C.accent + "08" : "transparent", borderLeft: isHoliday ? `3px solid ${C.orange}` : "none", transition: "all 0.2s" }}>
                      <td style={css.td}><strong>{emp.name}</strong></td>
                      <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{emp.post}</span></td>
                      <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                      <td style={css.td}><span style={css.badge(shiftColor(emp.shift))}>{emp.shift}</span></td>
                      <td style={css.td}><span style={css.badge(rec.status === "Holiday" ? C.orange : statusColor(rec.status))}>{rec.status === "Holiday" ? "⛱ HOLIDAY" : rec.status}</span></td>
                      <td style={css.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {["Present", "Absent", "Leave"].map(s => (
  <button key={s} disabled={isHoliday || (isSubmitted && myRole !== "director")} style={{ ...css.btn(statusColor(s)), opacity: rec.status === s ? 1 : 0.25, padding: "6px 8px", fontSize: 11, minWidth: 60 }} onClick={() => toggle(emp.id, "status", s)}>{s[0]}</button>
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
            <span style={{ fontSize: 12, color: C.textDim }}>{isHoliday ? "Holiday — all staff marked present." : isSubmitted ? "Submitted. Click Unlock to make changes." : "Draft — submit when attendance is finalised."}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isSubmitted && myRole === "director" && <button style={css.btn(C.red)} onClick={handleUnsubmit}>🔓 Unlock Day</button>}
              {(!isSubmitted || myRole === "director") && <button style={css.btn(C.orange)} onClick={handleHolidaySubmit} disabled={saving}>⛱ Mark Holiday</button>}
              {(!isSubmitted || myRole === "director") && <button style={css.btn(C.green)} onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : isSubmitted ? "Update Day" : "✓ Submit Day"}</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── STAFF ────────────────────────────────────────────────────────────────────
function StaffView({ employees, setEmployees, posts, ledger, setLedger, postHistory, setPostHistory, overtime, logAction, myRole }) {
  const deleteTransaction = async (txId) => {
    if (!window.confirm("Delete this transaction? This will instantly adjust their Net Payable.")) return;
    await supabase.from("financial_ledger").delete().eq("id", txId);
    setLedger(prev => prev.filter(l => l.id !== txId));
  };
  const editTransaction = async (tx) => {
    const newAmount = window.prompt(`Edit amount for this ${tx.transaction_type} (Currently ₹${tx.amount}):`, tx.amount);
    if (!newAmount || isNaN(newAmount) || Number(newAmount) <= 0 || Number(newAmount) === tx.amount) return;
    
    await supabase.from("financial_ledger").update({ amount: Number(newAmount) }).eq("id", tx.id);
    setLedger(prev => prev.map(l => l.id === tx.id ? { ...l, amount: Number(newAmount) } : l));
  };
  const generatePayslip = (emp, finData) => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        const monthName = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
        
        doc.setFontSize(22);
        doc.setTextColor(30, 111, 219);
        doc.text("PUNATHIL ROLLER FLOUR MILLS", 105, 20, { align: "center" });
        
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Salary Slip", 105, 28, { align: "center" });
        doc.setFontSize(10);
        doc.text(`For the month of: ${monthName}`, 105, 34, { align: "center" });
        
        doc.line(14, 40, 196, 40);

        // Employee Details
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Employee Details", 14, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Name: ${emp.name}`, 14, 58);
        doc.text(`Post: ${emp.post}`, 14, 64);
        doc.text(`Type: ${emp.staff_type === "company" ? "Company Staff" : "Contract Staff"}`, 14, 70);
        doc.text(`Aadhar: ${emp.aadhar || "N/A"}`, 120, 58);
        doc.text(`Joining Date: ${fDate(emp.joining_date)}`, 120, 64);

        // Financial Breakdown Table
        autoTable(doc, {
          startY: 80,
          head: [["Earnings", "Amount (Rs)", "Deductions", "Amount (Rs)"]],
          body: [
            ["Base Salary (Prorated)", Math.round(finData.proratedSalary).toLocaleString("en-IN"), "Absences & Leave", Math.round(finData.attendanceDeduction).toLocaleString("en-IN")],
            [`Overtime (${finData.totalOTHours} hrs)`, Math.round(finData.otEarnings).toLocaleString("en-IN"), "Advances & Fines", finData.totalAdvances.toLocaleString("en-IN")],
            ["Bonus / Allowances", finData.totalBonuses.toLocaleString("en-IN"), "Previous Payouts", finData.totalPaid.toLocaleString("en-IN")],
            ["Food Allowance", finData.foodAllowance.toLocaleString("en-IN"), "Loans Given", finData.totalLoans.toLocaleString("en-IN")],
            ["Loan Repayments", finData.totalRepayments.toLocaleString("en-IN"), "", ""],
          ],
          theme: "grid",
          headStyles: { fillColor: [244, 246, 249], textColor: [0, 0, 0], fontStyle: "bold" },
          styles: { fontSize: 10, cellPadding: 5 },
          columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } }
        });

        const finalY = doc.lastAutoTable.finalY || 80;
        
        // Final Totals
        doc.setFillColor(240, 245, 255);
        doc.rect(14, finalY + 10, 182, 12, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("NET PAYABLE:", 20, finalY + 18);
        doc.text(`Rs. ${Math.round(finData.netPayable).toLocaleString("en-IN")}`, 180, finalY + 18, { align: "right" });

        // Signature Lines
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Employer Signature", 30, finalY + 60);
        doc.line(20, finalY + 55, 65, finalY + 55);
        
        doc.text("Employee Signature", 140, finalY + 60);
        doc.line(130, finalY + 55, 185, finalY + 55);

        doc.save(`Payslip_${emp.name.replace(/ /g, "_")}_${monthName.replace(/ /g, "_")}.pdf`);
      });
    });
  };
  const generateFullReport = (emp, startDate, endDate) => {
    try {
      // Calculate Prior Balance (Carried Forward)
      const [y, m, d] = startDate.split("-").map(Number);
      const beforeDt = new Date(y, m - 1, d - 1);
      const beforeStartStr = [beforeDt.getFullYear(), String(beforeDt.getMonth() + 1).padStart(2, "0"), String(beforeDt.getDate()).padStart(2, "0")].join("-");
      
      // 1. Opening Balance (Lifetime up to day before Start Date)
      const priorFin = calcFinances(emp, posts, viewingAtt, ledger, emp.joining_date || "2020-01-01", beforeStartStr, postHistory, overtime);
      const openingBalance = Math.round(priorFin.netPayable);

      // 2. Period Earnings & Deductions
      const finPeriod = calcFinances(emp, posts, viewingAtt, ledger, startDate, endDate, postHistory, overtime);
      const periodEarned = finPeriod.proratedSalary - finPeriod.attendanceDeduction + finPeriod.otEarnings + finPeriod.totalBonuses + (finPeriod.foodAllowance || 0);

      const staffLedgerPeriod = (ledger || []).filter(l => l.employee_id === emp.id && l.date >= startDate && l.date <= endDate);
      const periodAdvances = staffLedgerPeriod.filter(l => l.transaction_type === "Advance").reduce((s, l) => s + Number(l.amount), 0);
      const periodFines = staffLedgerPeriod.filter(l => l.transaction_type === "Fine").reduce((s, l) => s + Number(l.amount), 0);

      // 3. Closing Balance (Lifetime up to End Date)
      const closingFin = calcFinances(emp, posts, viewingAtt, ledger, emp.joining_date || "2020-01-01", endDate, postHistory, overtime);
      const closingBalance = Math.round(closingFin.netPayable);

      // --- EXTENDED HR METRICS CALCULATIONS ---
      const joinDateObj = new Date(emp.joining_date || "2020-01-01");
      const endDateObj = new Date(endDate);
      const startDateObj = new Date(startDate);
      
      const lifetimeDays = Math.max(1, Math.round((endDateObj - joinDateObj) / 86400000) + 1);
      const lifetimeMonths = (lifetimeDays / 30.44).toFixed(1);
      const lifetimePresent = Math.max(0, lifetimeDays - closingFin.absentDays - closingFin.leaveDays);
      const lifetimeAttPct = ((lifetimePresent / lifetimeDays) * 100).toFixed(1);

      const periodDays = Math.max(1, Math.round((endDateObj - startDateObj) / 86400000) + 1);
      const periodPresent = Math.max(0, periodDays - finPeriod.absentDays - finPeriod.leaveDays);
      const periodAttPct = ((periodPresent / periodDays) * 100).toFixed(1);

      import("jspdf").then(({ jsPDF }) => {
        import("jspdf-autotable").then(({ default: autoTable }) => {
          try {
            const doc = new jsPDF();
            
            doc.setFontSize(20);
            doc.setTextColor(30, 111, 219);
            doc.text("PUNATHIL ROLLER FLOUR MILLS", 14, 20);
            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text(`Comprehensive Statement: ${emp.name}`, 14, 28);
            doc.setFontSize(10);
            doc.text(`Period: ${startDate} to ${endDate} | Aadhar: ${emp.aadhar || "N/A"}`, 14, 34);

            autoTable(doc, {
              startY: 40,
              head: [["Metric / Account", "Details", "Amount / Stat"]],
              body: [
                ["--- EMPLOYMENT METRICS ---", "", ""],
                ["Total Tenure (Up to End Date)", `Joined ${emp.joining_date || "2020-01-01"}`, `${lifetimeMonths} months`],
                ["Lifetime Attendance %", `${lifetimePresent} present / ${lifetimeDays} total days`, `${lifetimeAttPct}%`],
                ["Period Attendance %", `${periodPresent} present / ${periodDays} period days`, `${periodAttPct}%`],
                ["Period Absences", "Leaves & unpaid absences during period", `${finPeriod.absentDays + finPeriod.leaveDays} days`],
                ["Period Overtime Logged", "Total OT hours during period", `${finPeriod.totalOTHours} hrs`],
                ["--- FINANCIAL LEDGER ---", "", ""],
                ["OPENING BALANCE (Brought Forward)", `Net balance as of ${beforeStartStr}`, `Rs. ${openingBalance.toLocaleString("en-IN")}`],
                ["(+) Base Salary (Prorated)", `Days Worked: ${periodPresent}`, `Rs. ${Math.round(finPeriod.proratedSalary).toLocaleString("en-IN")}`],
                ["(+) Overtime Earnings", `OT Hours: ${finPeriod.totalOTHours}`, `Rs. ${Math.round(finPeriod.otEarnings).toLocaleString("en-IN")}`],
                ["(+) Performance Bonus", `Period Bonuses`, `Rs. ${Math.round(finPeriod.totalBonuses).toLocaleString("en-IN")}`],
                ["(+) Food Allowance", `Attendance: ${periodAttPct}%`, `Rs. ${Math.round(finPeriod.foodAllowance || 0).toLocaleString("en-IN")}`],
                ["(+) Loan Repayments", `Recovery from staff`, `Rs. ${Math.round(finPeriod.totalRepayments).toLocaleString("en-IN")}`],
                ["(-) Attendance Deductions", `Absences: ${finPeriod.absentDays + finPeriod.leaveDays}d`, `Rs. ${Math.round(finPeriod.attendanceDeduction).toLocaleString("en-IN")}`],
                ["(-) Personal Advances", `Cash advances taken`, `Rs. ${periodAdvances.toLocaleString("en-IN")}`],
                ["(-) Disciplinary Fines", `Penalties issued`, `Rs. ${periodFines.toLocaleString("en-IN")}`],
                ["(-) New Loans Issued", `Company loans given`, `Rs. ${Math.round(finPeriod.totalLoans).toLocaleString("en-IN")}`],
                ["(-) Salary Payouts", `Bank/Cash transfers`, `Rs. ${finPeriod.totalPaid.toLocaleString("en-IN")}`],
                ["CLOSING NET BALANCE", `Final Payable as of ${endDate}`, `Rs. ${closingBalance.toLocaleString("en-IN")}`],
                ["ACTIVE LOAN DEBT", `Total Unpaid Principal`, `Rs. ${closingFin.pendingLoan.toLocaleString("en-IN")}`]
              ],
              theme: "grid",
              headStyles: { fillColor: [244, 246, 249], textColor: [0, 0, 0] },
              styles: { fontSize: 10, fontStyle: "bold" }
            });

            let finalY = doc.lastAutoTable.finalY + 10;

            const empOT = (overtime || []).filter(o => o.employee_id === emp.id && o.date >= startDate && o.date <= endDate).sort((a, b) => new Date(a.date) - new Date(b.date));
            if (empOT.length > 0) {
              const fallbackHourly = Math.round((((Number(emp.base_salary) * 12) / 365) / 12) * 2) / 2;
              autoTable(doc, {
                startY: finalY,
                head: [["Date", "Overtime Post", "Time", "Hours", "Amount Earned"]],
                body: empOT.map(o => {
                  let hrRate = fallbackHourly;
                  const p = (posts || []).find(x => x.name === o.post);
                  if (p) {
                    const pSal = Number(p.contract_salary) || Number(p.base_salary) || 0;
                    if (pSal > 0) hrRate = Math.round((((pSal * 12) / 365) / 12) * 2) / 2;
                  }
                  const earned = Math.round(Number(o.hours) * hrRate);
                  return [o.date, o.post, `${o.start_time} - ${o.end_time}`, `${o.hours}h`, `Rs. ${earned.toLocaleString("en-IN")}`];
                }),
                theme: "grid",
                headStyles: { fillColor: [22, 163, 74] },
                styles: { fontSize: 9 }
              });
              finalY = doc.lastAutoTable.finalY + 10;
            }

            const empLedger = (ledger || []).filter(l => l.employee_id === emp.id && l.date >= startDate && l.date <= endDate).sort((a, b) => new Date(a.date) - new Date(b.date));
            if (empLedger.length > 0) {
              autoTable(doc, {
                startY: finalY,
                head: [["Date", "Transaction Type", "Amount", "Remarks"]],
                body: empLedger.map(l => [l.date, l.transaction_type, `Rs. ${l.amount.toLocaleString("en-IN")}`, l.notes || ""]),
                theme: "grid",
                headStyles: { fillColor: [234, 88, 12] },
                styles: { fontSize: 9 }
              });
            }

            doc.save(`Statement_${emp.name.replace(/ /g, "_")}_${startDate}_to_${endDate}.pdf`);
          } catch (pdfErr) { alert("PDF Error: " + pdfErr.message); }
        }).catch(err => alert("AutoTable Error: " + err.message));
      }).catch(err => alert("jsPDF Error: " + err.message));

    } catch (mainErr) { alert("Logic Error: " + mainErr.message); }
  };
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPost, setFilterPost] = useState("All");
  const [viewing, setViewing] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ emp_code: "", name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company", joining_date: todayStr, has_food_allowance: false, food_allowance_amount: "" });
  const [viewingAtt, setViewingAtt] = useState([]);
  const [datePromptOpts, setDatePromptOpts] = useState(null);
  const askForDate = (msg) => new Promise(resolve => setDatePromptOpts({ msg, date: todayStr, resolve }));
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDates, setReportDates] = useState({ start: "", end: "" });

  // Fetch this specific person's historical attendance when their profile opens
  useEffect(() => {
    if (viewing) supabase.from("attendance").select("*").eq("employee_id", viewing.id).then(({ data }) => setViewingAtt(data || []));
    else setViewingAtt([]);
  }, [viewing]);

  // Run the lifetime calculation engine for the popup
  const fin = viewing ? calcFinances(viewing, posts, viewingAtt, ledger, viewing.joining_date || "2020-01-01", todayStr, postHistory, overtime) : null;

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");
  let filtered = filterPost === "All" ? active : active.filter(e => e.post === filterPost);
  if (search.trim()) filtered = filtered.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || (e.aadhar || "").includes(search) || (e.emp_code || "").toLowerCase().includes(search.toLowerCase()));

  const getContractSalary = (postName) => posts.find(p => p.name === postName)?.contract_salary || 0;
  const handlePostChange = (postName) => setForm(f => ({ ...f, post: postName, base_salary: f.staff_type === "contract" ? getContractSalary(postName) : f.base_salary }));
  const handleTypeChange = (type) => setForm(f => ({ ...f, staff_type: type, base_salary: type === "contract" ? getContractSalary(f.post) : "" }));

  const addEmp = async () => {
    if (!form.emp_code.trim()) return alert("Employee Code is required.");
    if (!form.name.trim()) return alert("Name is required.");
    if (!form.aadhar.trim() || form.aadhar.length !== 12) return alert("Valid 12-digit Aadhar is required.");
    if (!form.post) return alert("Please select a post.");
    if (form.staff_type === "company" && !form.base_salary) return alert("Salary is required for company staff.");
    if (!form.joining_date) return alert("Joining date is required.");
    setLoading(true);
    const salary = form.staff_type === "contract" ? getContractSalary(form.post) : +form.base_salary;
    const { data, error } = await supabase.from("employees").insert({
      emp_code: form.emp_code, name: form.name, aadhar: form.aadhar, post: form.post, shift: form.shift,
      base_salary: salary, staff_type: form.staff_type, status: "active", joining_date: form.joining_date,
      has_food_allowance: form.has_food_allowance, food_allowance_amount: Number(form.food_allowance_amount) || 0
    }).select().single();
    if (!error && data) {
      setEmployees(prev => [...prev, data]);
      setForm({ emp_code: "", name: "", aadhar: "", post: "", shift: "Morning", base_salary: "", staff_type: "company", joining_date: todayStr, has_food_allowance: false, food_allowance_amount: "" });
      setShowForm(false);
      
      if (typeof logAction === "function") {
        logAction("Added Employee", `Registered ${form.name} as ${form.post}`);
      }
    } else alert("Error: " + (error?.message || "Unknown"));
    setLoading(false);
  };
  const updateCompanySalary = async () => {
    if (viewing.staff_type === "contract") return alert("Contract salaries are managed via the Posts settings.");
    const newAmount = window.prompt(`Enter new monthly salary for ${viewing.name}:`, viewing.base_salary);
    if (!newAmount || isNaN(newAmount) || Number(newAmount) === Number(viewing.base_salary)) return;
    
    const effectiveDate = await askForDate(`Select effective date for new salary (₹${newAmount}):`);
    if (!effectiveDate) return;

    const newSalary = Number(newAmount);
    const [y, m, d] = effectiveDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d - 1);
    const validToDate = [dateObj.getFullYear(), String(dateObj.getMonth() + 1).padStart(2, "0"), String(dateObj.getDate()).padStart(2, "0")].join("-");

    const hasHistory = postHistory.some(h => h.employee_id === viewing.id && !h.valid_to);
    if (!hasHistory) {
      const { data: backfill } = await supabase.from("post_history").insert({ employee_id: viewing.id, post: viewing.post, staff_type: viewing.staff_type, salary: viewing.base_salary, valid_from: viewing.joining_date || "2024-01-01", valid_to: validToDate }).select().single();
      if (backfill) setPostHistory(prev => [...prev, backfill]);
    } else {
      await supabase.from("post_history").update({ valid_to: validToDate }).eq("employee_id", viewing.id).is("valid_to", null);
      setPostHistory(prev => prev.map(h => (h.employee_id === viewing.id && !h.valid_to) ? { ...h, valid_to: validToDate } : h));
    }

    const { data: histData } = await supabase.from("post_history").insert({ employee_id: viewing.id, post: viewing.post, staff_type: viewing.staff_type, salary: newSalary, valid_from: effectiveDate, valid_to: null }).select().single();
    if (histData) setPostHistory(prev => [...prev, histData]);

    const updateData = { base_salary: newSalary };
    await supabase.from("employees").update(updateData).eq("id", viewing.id);
    setEmployees(prev => prev.map(e => e.id === viewing.id ? { ...e, ...updateData } : e));
    setViewing(prev => ({ ...prev, ...updateData }));
  setViewing(prev => ({ ...prev, ...updateData }));
    if (logAction) logAction("Salary Changed", `Updated ${viewing.name}'s salary to ₹${newSalary}`);
  };

  const updateFoodAllowance = async () => {
    const isEnabled = window.confirm(`Is ${viewing.name} eligible for a Food Allowance?\nClick OK for Yes, Cancel to Disable it.`);
    let amount = 0;
    if (isEnabled) {
      const input = window.prompt(`Enter new MONTHLY food allowance for ${viewing.name}:\n(Takes effect for the entire current month)`, viewing.food_allowance_amount || "");
      if (input === null || isNaN(input) || Number(input) < 0) return;
      amount = Number(input);
    }
    
    const updateData = { has_food_allowance: isEnabled, food_allowance_amount: amount };
    await supabase.from("employees").update(updateData).eq("id", viewing.id);
    setEmployees(prev => prev.map(e => e.id === viewing.id ? { ...e, ...updateData } : e));
    setViewing(prev => ({ ...prev, ...updateData }));
  setViewing(prev => ({ ...prev, ...updateData }));
    if (logAction) logAction("Allowance Changed", `${isEnabled ? "Enabled" : "Disabled"} food allowance for ${viewing.name}`);
  };

  const updateEmployeePost = async (emp, newPost) => {
    const effectiveDate = await askForDate(`Select effective date for role change to ${newPost}:`);
    if (!effectiveDate) return;

    const newSalary = emp.staff_type === "contract" ? getContractSalary(newPost) : emp.base_salary;
    const [y, m, d] = effectiveDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d - 1);
    const validToDate = [dateObj.getFullYear(), String(dateObj.getMonth() + 1).padStart(2, "0"), String(dateObj.getDate()).padStart(2, "0")].join("-");

    // Check if the employee already has a history tracking record
    const hasHistory = postHistory.some(h => h.employee_id === emp.id && !h.valid_to);
    
    if (!hasHistory) {
      // BACKFILL: Log the old salary & post for the period before the shift so they get paid!
      const { data: backfill } = await supabase.from("post_history").insert({ employee_id: emp.id, post: emp.post, staff_type: emp.staff_type, salary: emp.base_salary, valid_from: emp.joining_date || "2024-01-01", valid_to: validToDate }).select().single();
      if (backfill) setPostHistory(prev => [...prev, backfill]);
    } else {
      // Safely close out the existing open history record in the database AND local view
      await supabase.from("post_history").update({ valid_to: validToDate }).eq("employee_id", emp.id).is("valid_to", null);
      setPostHistory(prev => prev.map(h => (h.employee_id === emp.id && !h.valid_to) ? { ...h, valid_to: validToDate } : h));
    }

    const { data: histData } = await supabase.from("post_history").insert({ employee_id: emp.id, post: newPost, staff_type: emp.staff_type, salary: newSalary, valid_from: effectiveDate, valid_to: null }).select().single();
    
    if (histData) setPostHistory(prev => [...prev, histData]);
    const updateData = { post: newPost, base_salary: newSalary };
    await supabase.from("employees").update(updateData).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, ...updateData } : e));
    setViewing(prev => ({ ...prev, ...updateData, post: newPost }));
  setViewing(prev => ({ ...prev, ...updateData, post: newPost }));
    if (logAction) logAction("Post Changed", `Moved ${emp.name} to ${newPost}`);
  };

  const updateEmployeeShift = async (id, newShift) => {
    await supabase.from("employees").update({ shift: newShift }).eq("id", id);
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, shift: newShift } : e));
    setViewing(prev => ({ ...prev, shift: newShift }));
  };

  // Mark inactive WITHOUT window.confirm — uses inline confirmation instead
  const markInactive = async () => {
    const emp = viewing;
    
    // Prompt for exact leaving date using the custom calendar
    const leftDate = await askForDate(`Select the exact date ${emp.name} left the mill:`);
    if (!leftDate) return; // User cancelled

    const { error } = await supabase.from("employees").update({ status: "inactive", left_date: leftDate }).eq("id", emp.id);
    if (error) { alert("Failed to update: " + error.message); return; }
    
    await supabase.from("post_history").update({ valid_to: leftDate }).eq("employee_id", emp.id).is("valid_to", null);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "inactive", left_date: leftDate } : e));
    setViewing(null);
    setConfirmLeave(false);
  setConfirmLeave(false);
    if (logAction) logAction("Employee Left", `Marked ${emp.name} as left on ${leftDate}`);
  };

  const reactivate = async (emp) => {
    const rejoinDate = await askForDate(`Select rejoining date for ${emp.name}:`);
    if (!rejoinDate) return;

    const dateObj = new Date(rejoinDate);
    dateObj.setDate(dateObj.getDate() - 1);
    const gapEndDate = dateObj.toISOString().split("T")[0];

    // If they had a left_date, log the unpaid gap so the payroll engine ignores those days
    if (emp.left_date) {
      const leftDateObj = new Date(emp.left_date);
      leftDateObj.setDate(leftDateObj.getDate() + 1);
      const gapStartDate = leftDateObj.toISOString().split("T")[0];
      
      if (gapStartDate <= gapEndDate) {
         await supabase.from("post_history").insert({
           employee_id: emp.id, post: "Unpaid Gap", staff_type: emp.staff_type, salary: 0, valid_from: gapStartDate, valid_to: gapEndDate
         });
      }
    }

    // Start a fresh active history record from the new rejoin date
    const { data: histData } = await supabase.from("post_history").insert({
      employee_id: emp.id, post: emp.post, staff_type: emp.staff_type, salary: emp.base_salary, valid_from: rejoinDate, valid_to: null
    }).select().single();

    if (histData) setPostHistory(prev => [...prev, histData]);

    // FIX: Clear the settlement flag so they aren't still marked as "Settled" in their new active tenure
    await supabase.from("employees").update({ status: "active", left_date: null, settlement_done: false }).eq("id", emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: "active", left_date: null, settlement_done: false } : e));
  };

  const deleteEmployee = async () => {
    if (!window.confirm(`⚠️ DANGER: Permanently delete ${viewing.name} and ALL their historical data (attendance, payroll, ledger)? This CANNOT be undone.`)) return;
    
    // Erase all linked data so the payroll engine doesn't crash on ghost records
    await supabase.from("attendance").delete().eq("employee_id", viewing.id);
    await supabase.from("financial_ledger").delete().eq("employee_id", viewing.id);
    await supabase.from("post_history").delete().eq("employee_id", viewing.id);
    await supabase.from("overtime_entries").delete().eq("employee_id", viewing.id);
    await supabase.from("employees").delete().eq("id", viewing.id);

    setEmployees(prev => prev.filter(e => e.id !== viewing.id));
    setViewing(null);
  setViewing(null);
    if (logAction) logAction("Employee Deleted", `Permanently deleted employee: ${viewing.name}`);
  };

  const deleteInactive = async (emp) => {
    if (!window.confirm(`⚠️ DANGER: Permanently delete ${emp.name} and ALL their historical data? This CANNOT be undone.`)) return;
    
    // Wipe them completely from the database
    await supabase.from("attendance").delete().eq("employee_id", emp.id);
    await supabase.from("financial_ledger").delete().eq("employee_id", emp.id);
    await supabase.from("post_history").delete().eq("employee_id", emp.id);
    await supabase.from("overtime_entries").delete().eq("employee_id", emp.id);
    await supabase.from("employees").delete().eq("id", emp.id);

    setEmployees(prev => prev.filter(e => e.id !== emp.id));
  };

  const empHistory = viewing ? (postHistory || []).filter(h => h.employee_id === viewing.id).sort((a, b) => (b.valid_from || "").localeCompare(a.valid_from || "")) : [];

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
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>EMP CODE *</div><input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.emp_code} onChange={e => setForm(f => ({ ...f, emp_code: e.target.value.toUpperCase() }))} placeholder="e.g. EMP-001" /></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FULL NAME *</div><input style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>AADHAR NO. * (12 digits)</div><input maxLength={12} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.aadhar} onChange={e => setForm(f => ({ ...f, aadhar: e.target.value.replace(/\D/g, "").slice(0, 12) }))} placeholder="123456789012" /></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>JOINING DATE *</div><input type="date" max={todayStr} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} /></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>STAFF TYPE *</div><select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.staff_type} onChange={e => handleTypeChange(e.target.value)}><option value="company">Company Staff</option><option value="contract">Contract Staff</option></select></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>POST / ROLE *</div><select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.post} onChange={e => handlePostChange(e.target.value)}><option value="">Select post...</option>{posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
            <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SHIFT *</div><select style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}><option>Morning</option><option>Night</option></select></div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>BASE SALARY (₹) *</div>
              <input type="number" readOnly={form.staff_type === "contract"} style={{ ...css.input, width: "100%", boxSizing: "border-box", background: form.staff_type === "contract" ? C.border : C.bg }} value={form.base_salary} onChange={e => form.staff_type === "company" && setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder={form.staff_type === "contract" ? "Auto from post" : "e.g. 20000"} />
              {form.staff_type === "contract" && form.post && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>₹{getContractSalary(form.post).toLocaleString("en-IN")} from post rate</div>}
            </div>
            
            <div style={{ gridColumn: "1 / -1", padding: 10, background: C.border + "44", borderRadius: 6, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" id="food_allowance" checked={form.has_food_allowance} onChange={e => setForm(f => ({ ...f, has_food_allowance: e.target.checked }))} style={{ transform: "scale(1.2)" }} />
                <label htmlFor="food_allowance" style={{ fontSize: 11, fontWeight: 700, color: C.textDim }}>ENABLE FOOD ALLOWANCE?</label>
              </div>
              {form.has_food_allowance && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 10, color: C.textDim }}>MONTHLY AMOUNT:</div>
                  <input type="number" style={{ ...css.input, width: 120 }} value={form.food_allowance_amount} onChange={e => setForm(f => ({ ...f, food_allowance_amount: e.target.value }))} placeholder="₹" />
                </div>
              )}
            </div>

          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addEmp} disabled={loading}>{loading ? "Saving..." : "Save Employee"}</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="🔍 Search by name or Aadhar..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...css.input, flex: 1, minWidth: 200 }} />
        <select style={css.input} value={filterPost} onChange={e => setFilterPost(e.target.value)}>
          <option value="All">All Posts</option>
          {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      {/* Staff profile modal */}
      {viewing && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 520, width: "100%", border: `2px solid ${C.accent}`, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>Staff Profile</div>
              <button onClick={() => { setViewing(null); setConfirmLeave(false); }} style={{ background: C.red, color: "white", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>CLOSE ✕</button>
            </div>
            <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{viewing.name}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
                <span style={css.badge(staffTypeColor(viewing.staff_type))}>{viewing.staff_type}</span>
                <span style={css.badge(shiftColor(viewing.shift))}>{viewing.shift}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, background: C.bg, padding: 14, borderRadius: 8 }}>
              <div><div style={{ fontSize: 10, color: C.textDim }}>EMP CODE</div><strong>{viewing.emp_code || "—"}</strong></div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>AADHAR</div><strong>{viewing.aadhar || "—"}</strong></div>
              <div>
                <div style={{ fontSize: 10, color: C.textDim }}>CURRENT SALARY</div>
                <strong style={{ color: C.green }}>₹{Number(viewing.base_salary).toLocaleString("en-IN")}</strong>
                {viewing.staff_type === "company" && <button style={{ background: "transparent", border: "none", color: C.blue, cursor: "pointer", fontSize: 12, marginLeft: 6, textDecoration: "underline" }} onClick={updateCompanySalary}>Edit</button>}
              </div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>JOINED</div><strong>{fDate(viewing.joining_date)}</strong></div>
              <div><div style={{ fontSize: 10, color: C.textDim }}>CURRENT POST</div><strong>{viewing.post}</strong></div>
            </div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 700 }}>CHANGE POST / SHIFT</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ ...css.input, flex: 1 }} value={viewing.post} onChange={e => updateEmployeePost(viewing, e.target.value)}>
                    {posts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                  <select style={{ ...css.input, flex: 1 }} value={viewing.shift} onChange={e => updateEmployeeShift(viewing.id, e.target.value)}>
                    <option>Morning</option><option>Night</option>
                  </select>
                </div>
                {viewing.staff_type === "contract" && <div style={{ fontSize: 10, color: C.orange, marginTop: 4 }}>⚠ Changing post updates salary to that post's contract rate from today onwards only.</div>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 700 }}>MONTHLY FOOD ALLOWANCE (ALL STAFF)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ ...css.input, flex: 1, display: "flex", alignItems: "center", background: C.bg, color: C.textDim }}>
                    {viewing.has_food_allowance ? `Enabled: ₹${Number(viewing.food_allowance_amount || 0).toLocaleString("en-IN")} / mo` : "Disabled"}
                  </div>
                  <button style={{ ...css.btn(C.orange), flex: 1 }} onClick={updateFoodAllowance}>✎ Edit Allowance</button>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>ℹ Paid out only if month's attendance is ≥ 60%.</div>
              </div>

              {viewing.staff_type === "company" && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 700 }}>CHANGE BASE SALARY (COMPANY STAFF)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ ...css.input, flex: 1, display: "flex", alignItems: "center", background: C.bg, color: C.textDim }}>Current: ₹{Number(viewing.base_salary).toLocaleString("en-IN")}</div>
                    <button style={{ ...css.btn(C.blue), flex: 1 }} onClick={updateCompanySalary}>✎ Edit Salary & Date</button>
                  </div>
                </div>
              )}
            {empHistory.length > 0 && (
              <>
                <div style={css.sectionTitle}>Post Change History</div>
                <div style={{ background: C.bg, borderRadius: 6, padding: 10, marginBottom: 16 }}>
                  {empHistory.map(h => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                      <span>{h.post}</span>
                      <span style={{ color: C.textDim }}>{fDate(h.valid_from)} → {h.valid_to ? fDate(h.valid_to) : "present"}</span>
                      <strong style={{ color: C.accent }}>₹{Number(h.salary).toLocaleString("en-IN")}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            {fin && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ ...css.sectionTitle, marginBottom: 0 }}>Lifetime Ledger Summary</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={{ ...css.btn(C.blue), padding: "4px 12px", fontSize: 10 }} onClick={() => generatePayslip(viewing, fin)}>📥 Monthly Payslip</button>
                    <button style={{ ...css.btn(C.green), padding: "4px 12px", fontSize: 10 }} onClick={() => {
                      const todayStr = [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, "0"), String(new Date().getDate()).padStart(2, "0")].join("-");
                      setReportDates({ start: viewing.joining_date || "2020-01-01", end: todayStr });
                      setShowReportModal(true);
                    }}>📊 Account Statement</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16, background: C.bg, padding: 14, borderRadius: 8, textAlign: "center" }}>
                  <div><div style={{ fontSize: 10, color: C.textDim }}>OT EARNINGS</div><strong style={{ color: C.green }}>+₹{Math.round(fin.otEarnings).toLocaleString("en-IN")}</strong></div>
                  <div><div style={{ fontSize: 10, color: C.textDim }}>FOOD ALLOW.</div><strong style={{ color: C.green }}>+₹{fin.foodAllowance.toLocaleString("en-IN")}</strong></div>
                  <div><div style={{ fontSize: 10, color: C.textDim }}>ADVANCES/FINES</div><strong style={{ color: C.red }}>-₹{fin.totalAdvances.toLocaleString("en-IN")}</strong></div>
                  <div><div style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>NET PAYABLE</div><strong style={{ color: fin.netPayable < 0 ? C.red : C.orange, fontSize: 16 }}>₹{Math.round(fin.netPayable).toLocaleString("en-IN")}</strong></div>
                </div>

                {fin.pendingLoan !== 0 && (
                  <div style={{ background: C.orange + "15", border: `1px solid ${C.orange}44`, borderRadius: 6, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.orange, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>ACTIVE LOAN TRACKER</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>Total Borrowed: ₹{fin.totalLoans.toLocaleString("en-IN")} &nbsp;·&nbsp; Total Repaid: ₹{fin.totalRepayments.toLocaleString("en-IN")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>PENDING BALANCE</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.orange }}>₹{fin.pendingLoan.toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={css.sectionTitle}>Recent Transactions</div>
            <div style={{ maxHeight: 120, overflowY: "auto", background: C.bg, borderRadius: 6, padding: 10, marginBottom: 16 }}>
              {(ledger || []).filter(l => l.employee_id === viewing.id).slice(0, 10).length === 0
                ? <div style={{ fontSize: 11, color: C.textDim, textAlign: "center" }}>No transactions found.</div>
                : (ledger || []).filter(l => l.employee_id === viewing.id).slice(0, 10).map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11 }}>{fDate(l.date)} · {l.transaction_type}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <strong style={{ fontSize: 11, color: l.transaction_type === "Bonus" || l.transaction_type === "Payout" ? C.green : C.red }}>₹{l.amount}</strong>
                      {myRole === "director" && <button style={{ background: "transparent", border: "none", color: C.blue, cursor: "pointer", fontSize: 14, padding: "0 4px" }} title="Edit Amount" onClick={() => editTransaction(l)}>✎</button>}
                      {myRole === "director" && <button style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: 12, padding: "0 4px" }} title="Delete Transaction" onClick={() => deleteTransaction(l.id)}>✕</button>}
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Inline confirm instead of window.confirm */}
            {!confirmLeave ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...css.btn(C.orange), flex: 1 }} onClick={() => setConfirmLeave(true)}>
                  ⏸ Mark as Left / Inactive
                </button>
                {myRole === "director" && (
                  <button style={{ ...css.btn(C.red), flex: 1 }} onClick={deleteEmployee}>
                    🗑 Delete Permanently
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background: C.red + "15", border: `1px solid ${C.red}44`, borderRadius: 6, padding: 14 }}>
                <div style={{ fontSize: 13, color: C.red, marginBottom: 12, fontWeight: 700 }}>
                  Are you sure you want to mark {viewing.name} as left?<br />
                  <span style={{ fontSize: 11, fontWeight: 400 }}>Their final dues will appear in Payroll → Final Settlement.</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...css.btn(C.red), flex: 1 }} onClick={markInactive}>Yes, Mark as Left</button>
                  <button style={{ ...css.btn(C.textDim), flex: 1 }} onClick={() => setConfirmLeave(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={css.sectionTitle}>Active Staff ({filtered.length})</div>
      <div style={{ marginBottom: 24 }}>
        {filtered.length === 0 && <div style={{ ...css.card, textAlign: "center", padding: 30, color: C.textDim }}>No employees found.</div>}
        
        {/* GROUP BY POST */}
        {Array.from(new Set(filtered.map(e => e.post))).sort().map(postName => {
          const postStaff = filtered.filter(e => e.post === postName);
          
          // Cross-reference with Settings to get required numbers
          const postDef = posts.find(p => p.name === postName);
          const totalReq = postDef ? (postDef.required_morning + postDef.required_night) : 0;
          
          return (
            <div key={postName} style={{ marginBottom: 20, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{ background: C.accent, color: "white", padding: "10px 14px", fontWeight: 700, fontSize: 14 }}>
                {postName} ({postStaff.length}/{totalReq})
              </div>
              
              {/* SUB-GROUP BY SHIFT */}
              {["Morning", "Night"].map(shiftName => {
                const shiftStaff = postStaff.filter(e => e.shift === shiftName);
                if (shiftStaff.length === 0) return null;
                
                // Get requirement for this specific shift
                const shiftReq = shiftName === "Morning" ? (postDef?.required_morning || 0) : (postDef?.required_night || 0);
                
                return (
                  <div key={shiftName} style={{ borderTop: `1px solid ${C.border}`, background: C.panel }}>
                    <div style={{ background: C.bg, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: shiftName === "Morning" ? C.accent : C.blue, borderBottom: `1px solid ${C.border}` }}>
                      {shiftName.toUpperCase()} SHIFT ({shiftStaff.length}/{shiftReq})
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={css.table}>
                        <thead><tr>{["Code", "Name", "Type", "Joined", "Salary", ""].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {shiftStaff.map(emp => (
                            <tr key={emp.id} style={{ cursor: "pointer" }} onClick={() => { setViewing(emp); setConfirmLeave(false); }}>
                              <td style={{ ...css.td, fontSize: 12 }}><strong>{emp.emp_code || "—"}</strong></td>
                              <td style={css.td}><span style={{ color: C.accent, fontWeight: 700, textDecoration: "underline" }}>{emp.name}</span></td>
                              <td style={css.td}><span style={css.badge(staffTypeColor(emp.staff_type))}>{emp.staff_type}</span></td>
                              <td style={css.td}><span style={{ fontSize: 11, color: C.textDim }}>{fDate(emp.joining_date)}</span></td>
                              <td style={css.td}><span style={{ color: C.green }}>₹{Number(emp.base_salary).toLocaleString("en-IN")}</span></td>
                              <td style={css.td}><span style={{ fontSize: 11, color: C.accent }}>View →</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
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
                    <td style={css.td}><span style={{ fontSize: 11, color: C.red }}>{fDate(emp.left_date)}</span></td>
                    <td style={css.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...css.btn(C.green), padding: "4px 10px", fontSize: 10 }} onClick={() => reactivate(emp)}>Reactivate</button>
                        {myRole === "director" && <button style={{ ...css.btn(C.red), padding: "4px 10px", fontSize: 10 }} onClick={() => deleteInactive(emp)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* --- CUSTOM CALENDAR PROMPT --- */}
      {datePromptOpts && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 350, width: "100%", textAlign: "center", border: `2px solid ${C.accent}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{datePromptOpts.msg}</div>
            <input 
              type="date" 
              style={{ ...css.input, width: "100%", marginBottom: 20, fontSize: 16, padding: 10, textAlign: "center", fontWeight: "bold" }} 
              value={datePromptOpts.date} 
              onChange={e => setDatePromptOpts({ ...datePromptOpts, date: e.target.value })} 
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...css.btn(C.green), flex: 1 }} onClick={() => { datePromptOpts.resolve(datePromptOpts.date); setDatePromptOpts(null); }}>Confirm Date</button>
              <button style={{ ...css.btn(C.red), flex: 1 }} onClick={() => { datePromptOpts.resolve(null); setDatePromptOpts(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* --- REPORT CALENDAR MODAL --- */}
      {showReportModal && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 320, width: "100%", border: `2px solid ${C.green}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: C.accent }}>Select Report Period</div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 10, color: C.textDim, fontWeight: 700, marginBottom: 4 }}>START DATE</label>
              <input type="date" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={reportDates.start} onChange={e => setReportDates(p => ({ ...p, start: e.target.value }))} />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 10, color: C.textDim, fontWeight: 700, marginBottom: 4 }}>END DATE</label>
              <input type="date" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={reportDates.end} onChange={e => setReportDates(p => ({ ...p, end: e.target.value }))} />
            </div>
            
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...css.btn(C.green), flex: 1 }} onClick={() => {
                setShowReportModal(false);
                generateFullReport(viewing, reportDates.start, reportDates.end);
              }}>⬇ Download PDF</button>
              <button style={{ ...css.btn(C.red), flex: 1, background: "transparent" }} onClick={() => setShowReportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
function PayrollView({ employees, posts, ledger, setLedger, postHistory, setTab, overtime, logAction, myRole }) {
  const now = new Date();
  const monthStart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), "01"].join("-");
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(todayStr);
  const [rangeAttendance, setRangeAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState("company");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: "Advance", amount: "", notes: "", date: todayStr, empId: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  const active = employees.filter(e => e.status === "active");
  const inactive = employees.filter(e => e.status === "inactive");
  const companyStaff = active.filter(e => e.staff_type === "company");
  const contractStaff = active.filter(e => e.staff_type === "contract");

  useEffect(() => {
    const fetch = async () => {
      // Fetches full history so the "Actual Payable" can accurately calculate past absences/OT
      const { data } = await supabase.from("attendance").select("*");
      if (data) setRangeAttendance(data);
    };
    fetch();
  }, []);

  const handleTransaction = async () => {
    if (!form.empId || !form.amount || Number(form.amount) <= 0) return alert("Select staff/contractor and enter a valid amount.");
    setSaving(true);
    
    const isContractor = form.empId === "CONTRACTOR";
    const payoutAmt = Number(form.amount);
    
    const { data, error } = await supabase.from("financial_ledger").insert({ 
      employee_id: isContractor ? null : form.empId, 
      date: form.date, 
      transaction_type: isContractor ? "Contractor Payout" : form.type, 
      amount: payoutAmt, 
      notes: form.notes 
    }).select().single();

    let newEntries = data ? [data] : [];

    // Auto-clear inactive contract staff dues immediately
    if (isContractor && !error) {
      let remainingPayout = payoutAmt;
      const leftContractStaff = inactive.filter(e => e.staff_type === "contract" && !e.settlement_done);
      const autoClearEntries = [];
      
      for (const emp of leftContractStaff) {
        if (remainingPayout <= 0) break;
        const fin = calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || "2020-01-01", todayStr, postHistory, overtime);
        if (fin.netPayable > 0) {
          const clearAmt = Math.floor(Math.min(fin.netPayable, remainingPayout));
          autoClearEntries.push({ employee_id: emp.id, date: form.date, transaction_type: "Contractor Distribution", amount: clearAmt, notes: "Auto-cleared from contractor payout" });
          remainingPayout -= clearAmt;
        }
      }

      if (autoClearEntries.length > 0) {
        const { data: clearedData } = await supabase.from("financial_ledger").insert(autoClearEntries).select();
        if (clearedData) newEntries = [...clearedData, ...newEntries];
      }
    }
    
    setSaving(false);
    if (error) { alert("Database Error: " + error.message); } 
    else { 
      setLedger(prev => [...newEntries, ...prev]); 
      setShowModal(false); 
      setForm({ type: "Advance", amount: "", notes: "", date: todayStr, empId: "" }); 
      
      // TRAP: Check if the function actually reached this page
      if (typeof logAction === "function") {
        const targetName = isContractor ? "Contractor" : (employees.find(e => e.id === form.empId)?.name || "Unknown");
        const actualType = isContractor ? "Contractor Payout" : form.type;
        logAction(`Registered ${actualType}`, `₹${payoutAmt} for ${targetName}`);
      } else {
        alert("⚠️ Developer Warning: The logAction function is not connected to the PayrollView component! Check your App tab renders.");
      }
    }
  };

  const exportPDF = (rows, label) => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(16);
        doc.text("PRFM HR Portal — " + label, 14, 18);
        doc.setFontSize(10);
        doc.text(`Period: ${fDate(start)} to ${fDate(end)}`, 14, 26);
        doc.text(`Generated: ${fDate(todayStr)}`, 14, 32);
        autoTable(doc, {
          startY: 38,
          head: [["Name", "Post", "Joined", "Base (Prorated)", "Absent", "Leave", "OT Hrs", "OT Earn", "Bonus", "Food Allow", "Adv/Fine", "Paid", "Net Payable"]],
          body: rows.map(({ emp, fin }) => [emp.name, emp.post, fDate(fin.joiningDate), "Rs." + Math.round(fin.proratedSalary).toLocaleString("en-IN"), fin.absentDays + "d", fin.leaveDays + "d", fin.totalOTHours + "h", "Rs." + Math.round(fin.otEarnings).toLocaleString("en-IN"), "Rs." + fin.totalBonuses.toLocaleString("en-IN"), "Rs." + fin.foodAllowance.toLocaleString("en-IN"), "Rs." + fin.totalAdvances.toLocaleString("en-IN"), "Rs." + fin.totalPaid.toLocaleString("en-IN"), "Rs." + Math.round(fin.netPayable).toLocaleString("en-IN")]),
          theme: "grid",
          headStyles: { fillColor: [30, 111, 219], fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          foot: [["", "", "TOTAL", "", "", "", "", "", "", "", "", "Rs." + Math.round(rows.reduce((s, r) => s + r.fin.netPayable, 0)).toLocaleString("en-IN")]],
          footStyles: { fillColor: [240, 245, 255], textColor: [30, 111, 219], fontStyle: "bold" },
        });
        doc.save(`PRFM_${label.replace(/ /g, "_")}_${start}_to_${end}.pdf`);
      });
    });
  };

  const PayrollTable = ({ staffList, label, color, isContract }) => {
    let filteredList = staffList;
    if (search.trim()) filteredList = filteredList.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
    
    // Calculate both Period Net and Lifetime Actual Net
    const rows = filteredList.map(emp => ({ 
      emp, 
      fin: calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime),
      finLifetime: calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || "2020-01-01", end, postHistory, overtime)
    }));
    
    const totalNet = rows.reduce((s, r) => s + r.fin.netPayable, 0);
    const totalActual = rows.reduce((s, r) => s + r.finLifetime.netPayable, 0);

    const lifetimeContractorPaid = isContract ? ledger.filter(l => l.transaction_type === "Contractor Payout" && l.date <= end).reduce((s, l) => s + Number(l.amount), 0) : 0;
    const lifetimeContractorDistributed = isContract ? ledger.filter(l => l.transaction_type === "Contractor Distribution" && l.date <= end).reduce((s, l) => s + Number(l.amount), 0) : 0;
    const availableToDistribute = lifetimeContractorPaid - lifetimeContractorDistributed;

    const handleDistribute = async () => {
      if (availableToDistribute <= 0) return alert("No undistributed contractor funds available.");
      if (!window.confirm(`Distribute ₹${availableToDistribute.toLocaleString("en-IN")} proportionally among active contract staff?`)) return;
      
      let activeContract = staffList.map(emp => ({ emp, fin: calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || "2020-01-01", todayStr, postHistory, overtime) })).filter(r => r.fin.netPayable > 0);
      if (activeContract.length === 0) return alert("No active contract staff have pending dues.");

      let remainingPool = availableToDistribute;
      const distMap = {}; 

      // Sweeper Loop: Distributes exact ratios, checks limits, and re-distributes leftovers instantly
      while (remainingPool > 0 && activeContract.length > 0) {
        const totalOwed = activeContract.reduce((sum, r) => sum + r.fin.netPayable, 0);
        if (totalOwed <= 0) break;

        const poolForRound = Math.min(remainingPool, totalOwed);
        let roundRemaining = poolForRound;
        let distributedThisRound = 0; // Failsafe tracker

        for (let i = 0; i < activeContract.length; i++) {
          if (roundRemaining <= 0) break;
          const r = activeContract[i];
          
          let share = Math.floor(poolForRound * (r.fin.netPayable / totalOwed));
          if (i === activeContract.length - 1) share = roundRemaining; 
          
          const amountToGive = Math.floor(Math.min(share, r.fin.netPayable, roundRemaining));
          
          if (amountToGive > 0) {
            distMap[r.emp.id] = (distMap[r.emp.id] || 0) + amountToGive;
            r.fin.netPayable -= amountToGive;
            roundRemaining -= amountToGive;
            remainingPool -= amountToGive;
            distributedThisRound += amountToGive;
          }
        }
        
        // Failsafe: If decimals cause 0 money to move, kill the loop so the browser doesn't freeze
        if (distributedThisRound === 0) break; 

        // Filter out anyone fully paid off (ignoring sub-rupee decimals)
        activeContract = activeContract.filter(r => r.fin.netPayable >= 1);
      }

      const newEntries = Object.entries(distMap).map(([empId, amount]) => ({
        employee_id: empId, date: todayStr, transaction_type: "Contractor Distribution", amount, notes: "Distributed proportionally"
      }));

      if (newEntries.length > 0) {
        const { data } = await supabase.from("financial_ledger").insert(newEntries).select();
        if (data) setLedger(prev => [...data, ...prev]);
        alert("Funds perfectly distributed!");
      }
    };

    return (
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={css.sectionTitle}>{label} ({filteredList.length})</div>
          <button style={css.btn(C.textDim)} onClick={() => exportPDF(rows, label)}>📥 Export PDF</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr style={{ background: C.bg }}>{["Name / Post", "Prorated Base", "Absent", "Leave", "OT", "Bonus", "Food", "Adv/Fine", isContract ? "Paid by Contr." : "Paid", "Period Net", "Actual Payable", ""].map(h => <th key={h} style={{ ...css.th, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No staff.</td></tr>}
              {rows.map(({ emp, fin, finLifetime }) => (
                <React.Fragment key={emp.id}>
                  <tr style={{ background: expandedRow === emp.id ? color + "08" : "transparent" }}>
                    <td style={css.td}><strong>[{emp.emp_code || "—"}] {emp.name}</strong><br /><small style={{ color: C.textDim }}>{emp.post}</small>{fin.periods.length > 1 && <div style={{ ...css.badge(C.orange), display: "inline-block", marginTop: 4, fontSize: 9 }}>SPLIT</div>}</td>
                    <td style={css.td}>₹{Math.round(fin.proratedSalary).toLocaleString("en-IN")}<br /><small style={{ color: C.textDim }}>joined {fDate(fin.joiningDate)}</small></td>
                    <td style={{ ...css.td, color: fin.absentDays > 0 ? C.red : C.textDim }}>{fin.absentDays}d<br /><small>-₹{Math.round(fin.attendanceDeduction).toLocaleString()}</small></td>
                    <td style={{ ...css.td, color: fin.leaveDays > 0 ? C.accent : C.textDim }}>{fin.leaveDays}d</td>
                    <td style={{ ...css.td, color: C.green }}>{fin.totalOTHours}h<br /><small>+₹{Math.round(fin.otEarnings).toLocaleString()}</small></td>
                    <td style={{ ...css.td, color: C.green }}>+₹{fin.totalBonuses.toLocaleString()}</td>
                    <td style={{ ...css.td, color: C.green }}>+₹{fin.foodAllowance.toLocaleString()}</td>
                    <td style={{ ...css.td, color: C.red }}>-₹{fin.totalAdvances.toLocaleString()}</td>
                    <td style={{ ...css.td, color: C.textDim }}>₹{isContract ? Math.round(fin.totalContractorDist).toLocaleString("en-IN") : fin.totalPaid.toLocaleString("en-IN")}</td>
                    <td style={{ ...css.td, background: color + "11" }}><strong style={{ color: fin.netPayable < 0 ? C.red : color, fontSize: 14 }}>₹{Math.round(fin.netPayable).toLocaleString("en-IN")}</strong></td>
                    <td style={{ ...css.td, background: C.orange + "15", borderLeft: `2px solid ${C.orange}44` }}><strong style={{ color: finLifetime.netPayable < 0 ? C.red : C.orange, fontSize: 15 }}>₹{Math.round(finLifetime.netPayable).toLocaleString("en-IN")}</strong></td>
                    <td style={css.td}>{fin.periods.length > 1 && <button style={{ ...css.btn(C.accent), padding: "3px 8px", fontSize: 10 }} onClick={() => setExpandedRow(expandedRow === emp.id ? null : emp.id)}>{expandedRow === emp.id ? "▲" : "▼"}</button>}</td>
                  </tr>
                  {expandedRow === emp.id && fin.periods.map((p, i) => (
                    <tr key={i} style={{ background: C.accent + "08" }}>
                      <td style={{ ...css.td, paddingLeft: 30 }} colSpan={2}><small style={{ color: C.accent }}>📌 {p.post} · {fDate(p.from)} → {fDate(p.to)}</small><br /><small style={{ color: C.textDim }}>₹{p.salary.toLocaleString()}/month · {p.daysInPeriod} days</small></td>
                      <td style={{ ...css.td, color: C.red }}><small>{p.absentDays}d · -₹{Math.round(p.attendanceDeduction).toLocaleString()}</small></td>
                      <td style={{ ...css.td, color: C.accent }}><small>{p.leaveDays}d</small></td>
                      <td style={{ ...css.td, color: C.green }}><small>{p.otHours}h · +₹{Math.round(p.otEarnings).toLocaleString()}</small></td>
                      <td colSpan={5} style={css.td}><small style={{ color: C.textDim }}>Period subtotal: ₹{Math.round(p.proratedSalary - p.attendanceDeduction + p.otEarnings).toLocaleString()}</small></td>
                      <td style={css.td}></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}><td colSpan={8} style={{ ...css.td, textAlign: "right", fontWeight: 700 }}>TOTAL STAFF PAYABLE</td><td style={css.td}><strong style={{ color, fontSize: 16 }}>₹{Math.round(totalNet).toLocaleString("en-IN")}</strong></td><td style={{...css.td, borderLeft: `2px solid ${C.orange}44`}}><strong style={{ color: C.orange, fontSize: 16 }}>₹{Math.round(totalActual).toLocaleString("en-IN")}</strong></td><td style={css.td}></td></tr>
              {isContract && (
                <>
                  <tr><td colSpan={8} style={{ ...css.td, textAlign: "right", color: C.red, fontSize: 12 }}>(-) UNASSIGNED CONTRACTOR FUNDS</td><td style={{ ...css.td, color: C.red }}>—</td><td style={{...css.td, color: C.red, borderLeft: `2px solid ${C.orange}44`}}>-₹{Math.round(availableToDistribute).toLocaleString("en-IN")}</td><td style={css.td}></td></tr>
                  <tr style={{ background: C.orange + "15" }}><td colSpan={8} style={{ ...css.td, textAlign: "right", fontWeight: 700, color: C.orange }}>NET BALANCE OWED TO CONTRACTOR</td><td style={css.td}><strong style={{ color: C.orange, fontSize: 18 }}>—</strong></td><td style={{...css.td, borderLeft: `2px solid ${C.orange}44`}}><strong style={{ color: C.orange, fontSize: 18 }}>₹{Math.round(totalActual - availableToDistribute).toLocaleString("en-IN")}</strong></td><td style={css.td}></td></tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
        {isContract && ledger.filter(l => l.transaction_type === "Contractor Payout").length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ ...css.sectionTitle, marginBottom: 0 }}>Recent Lump Sum Payouts Log</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.textDim }}>Undistributed: <strong style={{ color: C.orange }}>₹{Math.round(availableToDistribute).toLocaleString("en-IN")}</strong></span>
                <button style={{ ...css.btn(C.orange), padding: "4px 12px", fontSize: 10 }} onClick={handleDistribute}>➗ Distribute to Staff</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
              {ledger.filter(l => l.transaction_type === "Contractor Payout").slice(0, 8).map(l => (
                <div key={l.id} style={{ ...css.badge(C.orange), display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  {fDate(l.date)}: ₹{l.amount.toLocaleString("en-IN")}
                  {myRole === "director" && <button style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", marginLeft: 4 }} onClick={async () => { if(!window.confirm("Delete this contractor payout?")) return; await supabase.from("financial_ledger").delete().eq("id", l.id); setLedger(prev => prev.filter(x => x.id !== l.id)); }}>✕</button>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const SettlementView = () => {
    const unsettled = inactive.filter(e => !e.settlement_done);
    const rows = unsettled.map(emp => ({ emp, fin: calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || start, emp.left_date || end, postHistory, overtime) }));

    const markSettled = async (emp) => {
      await supabase.from("employees").update({ settlement_done: true }).eq("id", emp.id);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, settlement_done: true } : e));
    };

    const markAllSettled = async () => {
      for (const { emp } of rows) {
        await supabase.from("employees").update({ settlement_done: true }).eq("id", emp.id);
      }
      setEmployees(prev => prev.map(e => unsettled.find(u => u.id === e.id) ? { ...e, settlement_done: true } : e));
    };

    if (rows.length === 0) return <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim }}>✓ No pending settlements. All former staff are cleared.</div>;

    return (
      <div>
        <div style={{ marginBottom: 12, padding: "10px 14px", background: C.orange + "15", border: `1px solid ${C.orange}44`, borderRadius: 6, fontSize: 12, color: C.orange, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span>⚠ Former employees with pending dues. Record their final payout using "+ Register Transaction".</span>
          <button style={css.btn(C.green)} onClick={markAllSettled}>✓ Mark All Settled</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr>{["Name", "Last Post", "Left On", "Net Owed", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ emp, fin }) => (
                <tr key={emp.id}>
                  <td style={css.td}><strong>{emp.name}</strong></td>
                  <td style={css.td}>{emp.post}</td>
                  <td style={{ ...css.td, color: C.red }}>{fDate(emp.left_date)}</td>
                  <td style={css.td}>
                    <strong style={{ color: fin.netPayable < 0 ? C.red : C.green, fontSize: 15 }}>₹{Math.round(Math.abs(fin.netPayable)).toLocaleString("en-IN")}</strong>
                    <br /><small style={{ color: C.textDim }}>{fin.netPayable < 0 ? "Overpaid — recover" : "Owed to staff"}</small>
                  </td>
                  <td style={css.td}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {emp.staff_type === "company" && (
                        <button style={css.btn(C.blue)} onClick={() => { setForm(f => ({ ...f, empId: emp.id, type: "Payout", amount: Math.round(Math.abs(fin.netPayable)) })); setShowModal(true); }}>Record Payout</button>
                      )}
                      <button style={css.btn(C.green)} onClick={() => markSettled(emp)}>✓ Settled</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div><div style={css.sectionTitle}>Financial Overview</div><div style={{ fontSize: 22, fontWeight: 700 }}>Payroll & Ledger</div></div>
        <button style={css.btn(C.blue)} onClick={() => setShowModal(true)}>+ Register Transaction</button>
      </div>
      <div style={{ ...css.card, marginBottom: 20, background: "#f8fafc" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM</div><input type="date" style={{ ...css.input, width: "100%" }} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO</div><input type="date" style={{ ...css.input, width: "100%" }} value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>SEARCH</div><input placeholder="Name..." style={{ ...css.input, width: "100%" }} value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {[["company", "🏢 Company Staff", C.blue], ["contract", "📋 Contract Staff", C.green], ["settlement", "⚖ Final Settlement", C.orange]].map(([id, label, color]) => (
          <button key={id} style={{ ...css.navBtn(activeTab === id), color: activeTab === id ? color : C.textDim, borderColor: activeTab === id ? color + "55" : "transparent", background: activeTab === id ? color + "15" : "transparent" }} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>
      {activeTab === "company" && <PayrollTable staffList={companyStaff} label="Company Staff Payroll" color={C.blue} isContract={false} />}
      {activeTab === "contract" && <PayrollTable staffList={contractStaff} label="Contract Staff Payroll" color={C.green} isContract={true} />}
      {activeTab === "settlement" && <SettlementView />}

      {showModal && (
        <div style={css.modal}>
          <div style={{ ...css.card, maxWidth: 440, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Register Transaction</div>
              <button onClick={() => setShowModal(false)} style={{ background: C.red, color: "white", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>STAFF MEMBER / PAYEE</div>
                <select style={{ ...css.input, width: "100%" }} value={form.empId} onChange={e => setForm({ ...form, empId: e.target.value })}>
                  <option value="">-- Select Person --</option>
                  <option value="CONTRACTOR">🏢 Contractor (Lump Sum Payout)</option>
                  <optgroup label="Active Staff">{active.map(e => <option key={e.id} value={e.id}>[{e.emp_code || "—"}] {e.name}</option>)}</optgroup>
                  <optgroup label="Former Staff">{inactive.map(e => <option key={e.id} value={e.id}>[{e.emp_code || "—"}] {e.name} (left)</option>)}</optgroup>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TYPE</div>
                  <select disabled={form.empId === "CONTRACTOR"} style={{ ...css.input, width: "100%", opacity: form.empId === "CONTRACTOR" ? 0.5 : 1 }} value={form.empId === "CONTRACTOR" ? "Contractor Payout" : form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {form.empId === "CONTRACTOR" ? (
                      <option value="Contractor Payout">Contractor Payout</option>
                    ) : (
                      <>
                        <option value="Advance">Advance</option><option value="Bonus">Bonus</option><option value="Fine">Fine</option><option value="Payout">Salary Payout</option>
                        <option value="Loan Given">Loan Given</option><option value="Loan Repayment">Loan Repayment</option>
                      </>
                    )}
                  </select>
                </div>
                <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>DATE</div><input type="date" style={{ ...css.input, width: "100%" }} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>AMOUNT (₹)</div><input type="number" style={{ ...css.input, width: "100%", fontSize: 18, fontWeight: 700 }} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>REMARKS</div><input placeholder="Optional note..." style={{ ...css.input, width: "100%" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
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
function SettingsView({ posts, setPosts, employees, setEmployees, trackingStartDate, setTrackingStartDate, logAction }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", required_morning: 1, required_night: 1, contract_salary: 0, morning_start: "06:00", night_start: "18:00" });
  const [loading, setLoading] = useState(false);
  
  // NEW: Password Change State
  const [newPassword, setNewPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passMsg, setPassMsg] = useState("");

  const updatePassword = async () => {
    if (newPassword.length < 6) return setPassMsg("Minimum 6 characters required.");
    setPassLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPassMsg("Error: " + error.message);
    else { setPassMsg("✅ Password updated successfully!"); setNewPassword(""); }
    setPassLoading(false);
    if (logAction && !error) logAction("Password Changed", "User updated their personal password");
  };

  const addPost = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.from("posts").insert({ name: form.name, required_morning: +form.required_morning, required_night: +form.required_night, contract_salary: +form.contract_salary, morning_start: form.morning_start, night_start: form.night_start }).select().single();
    if (!error && data) { setPosts(prev => [...prev, data]); setForm({ name: "", required_morning: 1, required_night: 1, contract_salary: 0, morning_start: "06:00", night_start: "18:00" }); setShowForm(false); }
    setLoading(false);
  if (!error && data) { 
      setPosts(prev => [...prev, data]); 
      setForm({ name: "", required_morning: 1, required_night: 1, contract_salary: 0, morning_start: "06:00", night_start: "18:00" }); 
      setShowForm(false); 
      if (logAction) logAction("Post Created", `Added new role: ${form.name}`);
    }
    setLoading(false);
  };

  const deletePost = async (post) => {
    await supabase.from("posts").delete().eq("id", post.id);
    setPosts(prev => prev.filter(p => p.id !== post.id));
  await supabase.from("posts").delete().eq("id", post.id);
    setPosts(prev => prev.filter(p => p.id !== post.id));
    if (logAction) logAction("Post Deleted", `Removed role: ${post.name}`);
  };

  const updatePost = async (post, field, value) => {
    const newVal = field === "name" ? value : +value;
    if (field === "name" && value !== post.name) {
      await supabase.from("employees").update({ post: value }).eq("post", post.name);
      setEmployees(prev => prev.map(e => e.post === post.name ? { ...e, post: value } : e));
    }

    if (field === "contract_salary" && newVal !== post.contract_salary) {
      const todayLocal = [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, "0"), String(new Date().getDate()).padStart(2, "0")].join("-");
      const dateStr = window.prompt(`Changing salary for all active ${post.name} contract staff.\nEnter effective date STRICTLY as YYYY-MM-DD:`, todayLocal);
      if (!dateStr) return; 

      // STRICT FORMAT GUARDRAIL
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return alert("❌ ERROR: Invalid Date Format!\n\nYou must enter the date strictly as YYYY-MM-DD (e.g., 2026-05-08). Changes aborted to prevent database timeline errors.");
      }

      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d - 1);
      const validToDate = [dateObj.getFullYear(), String(dateObj.getMonth() + 1).padStart(2, "0"), String(dateObj.getDate()).padStart(2, "0")].join("-");

      const affectedEmps = employees.filter(e => e.post === post.name && e.staff_type === "contract" && e.status === "active");
      if (affectedEmps.length > 0) {
        const empIds = affectedEmps.map(e => e.id);
        
        // 1. Fetch to see who already has a history tracking record
        const { data: existingHistories } = await supabase.from("post_history").select("employee_id").in("employee_id", empIds).is("valid_to", null);
        const empsWithHistory = (existingHistories || []).map(h => h.employee_id);

        // 2. BACKFILL: Lock in the old salary for anyone missing a history record, so the past isn't altered!
        const backfills = affectedEmps.filter(emp => !empsWithHistory.includes(emp.id))
          .map(emp => ({ employee_id: emp.id, post: emp.post, staff_type: emp.staff_type, salary: post.contract_salary, valid_from: emp.joining_date || "2024-01-01", valid_to: validToDate }));
        if (backfills.length > 0) await supabase.from("post_history").insert(backfills);

        // 3. Close open histories and add new ones
        await supabase.from("post_history").update({ valid_to: validToDate }).in("employee_id", empIds).is("valid_to", null);
        const newHistoryEntries = affectedEmps.map(emp => ({ employee_id: emp.id, post: emp.post, staff_type: emp.staff_type, salary: newVal, valid_from: dateStr, valid_to: null }));
        await supabase.from("post_history").insert(newHistoryEntries);
        
        await supabase.from("employees").update({ base_salary: newVal }).in("id", empIds);
        setEmployees(prev => prev.map(e => empIds.includes(e.id) ? { ...e, base_salary: newVal } : e));
        
        alert(`Updated salaries for ${affectedEmps.length} contract staff. Please refresh the page to see changes perfectly reflected in Payroll.`);
      }
    }

    await supabase.from("posts").update({ [field]: newVal }).eq("id", post.id);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, [field]: newVal } : p));
  };

  return (
    <div style={css.page}>
      
      {/* NEW: Account Security Card */}
      <div style={{ ...css.card, marginBottom: 20, borderLeft: `3px solid ${C.accent}` }}>
        <div style={css.sectionTitle}>Account Security</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>CHANGE YOUR PASSWORD</div>
            <input type="password" placeholder="New Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ ...css.input, width: 250 }} />
          </div>
          <button style={css.btn(C.blue)} onClick={updatePassword} disabled={passLoading || !newPassword}>
            {passLoading ? "Updating..." : "Update Password"}
          </button>
        </div>
        {passMsg && <div style={{ fontSize: 11, marginTop: 8, color: passMsg.includes("Error") ? C.red : C.green, fontWeight: 700 }}>{passMsg}</div>}
      </div>

      <div style={{ ...css.card, marginBottom: 20 }}>
        <div style={css.sectionTitle}>General Settings</div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>ATTENDANCE TRACKING START DATE</div>
          <input type="date" style={{ ...css.input, maxWidth: 200 }} value={trackingStartDate} onChange={e => { setTrackingStartDate(e.target.value); localStorage.setItem("trackingStartDate", e.target.value); }} />
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>Dashboard will flag missing attendance from this date onwards.</div>
        </div>
      </div>
      {showForm && (
        <div style={{ ...css.card, marginBottom: 20, borderColor: C.green + "44" }}>
          <div style={css.sectionTitle}>New Post / Role</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            {[["POST NAME", "name", "text", "e.g. Machine Operator"], ["REQ. MORNING", "required_morning", "number", ""], ["REQ. NIGHT", "required_night", "number", ""], ["CONTRACT SALARY (₹)", "contract_salary", "number", "e.g. 18000"], ["MORNING SHIFT START", "morning_start", "time", ""], ["NIGHT SHIFT START", "night_start", "time", ""]].map(([label, field, type, ph]) => (
              <div key={field}><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>{label}</div><input type={type} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} value={form[field]} placeholder={ph} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} /></div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={css.btn(C.green)} onClick={addPost} disabled={loading}>{loading ? "Saving..." : "Save Post"}</button>
            <button style={css.btn(C.red)} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
  <div style={css.sectionTitle}>Manage Posts & Requirements</div>
  <button style={css.btn(C.green)} onClick={() => setShowForm(v => !v)}>+ Add Post</button>
</div>
      {posts.length === 0 && <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim }}>No posts added yet.</div>}
      {posts.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr>{["Post Name", "Req. Morning", "Req. Night", "Contract Salary", "Morn Start", "Night Start", "Action"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id}>
                  <td style={css.td}><input type="text" defaultValue={post.name} onBlur={e => e.target.value !== post.name && updatePost(post, "name", e.target.value)} style={{ ...css.input, fontWeight: 700, border: "1px solid transparent", background: "transparent", width: "100%" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.required_morning} onBlur={e => updatePost(post, "required_morning", e.target.value)} style={{ ...css.input, width: 70, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.required_night} onBlur={e => updatePost(post, "required_night", e.target.value)} style={{ ...css.input, width: 70, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="number" defaultValue={post.contract_salary || 0} onBlur={e => updatePost(post, "contract_salary", e.target.value)} style={{ ...css.input, width: 110, textAlign: "center" }} /></td>
                  <td style={css.td}><input type="time" defaultValue={post.morning_start || "06:00"} onBlur={e => updatePost(post, "morning_start", e.target.value)} style={{ ...css.input, width: 100 }} /></td>
                  <td style={css.td}><input type="time" defaultValue={post.night_start || "18:00"} onBlur={e => updatePost(post, "night_start", e.target.value)} style={{ ...css.input, width: 100 }} /></td>
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
// ─── REPORTS & DATA EXTRACTION ────────────────────────────────────────────────
function ReportsView({ employees, posts, ledger, postHistory, overtime }) {
  const now = new Date();
  const monthStart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), "01"].join("-");
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(todayStr);
  const [rangeAttendance, setRangeAttendance] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAtt = async () => {
      setLoading(true);
      const { data } = await supabase.from("attendance").select("*").gte("date", start).lte("date", end);
      if (data) setRangeAttendance(data);
      setLoading(false);
    };
    fetchAtt();
  }, [start, end]);

  const downloadCSV = () => {
    const active = employees.filter(e => e.status === "active");
    const rows = active.map(emp => {
      const fin = calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime);
      return [
        `"${emp.name}"`, `"${emp.post}"`, emp.staff_type,
        Math.round(fin.proratedSalary), fin.absentDays, fin.leaveDays,
        fin.totalOTHours, Math.round(fin.otEarnings), fin.totalBonuses,
        fin.totalAdvances, fin.totalPaid, Math.round(fin.netPayable)
      ].join(",");
    });

    const header = "Name,Post,Type,Prorated Base (Rs),Absent Days,Leave Days,OT Hours,OT Earnings (Rs),Bonuses (Rs),Advances/Fines (Rs),Paid (Rs),Net Payable (Rs)\n";
    const csvContent = "data:text/csv;charset=utf-8," + header + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PRFM_Payroll_Data_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
// --- Operations Data ---
  const tomorrowDt = new Date();
  tomorrowDt.setDate(tomorrowDt.getDate() + 1);
  const tomorrowStr = tomorrowDt.toISOString().split("T")[0];
  
  const activeStaff = employees.filter(e => e.status === "active");
  const morningStaff = activeStaff.filter(e => e.shift === "Morning");
  const nightStaff = activeStaff.filter(e => e.shift === "Night");

  const otWatchlist = activeStaff.map(emp => {
    const fin = calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime);
    return { name: emp.name, post: emp.post, hours: fin.totalOTHours };
  }).filter(e => e.hours > 0).sort((a, b) => b.hours - a.hours).slice(0, 5);
const printRoster = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("PRFM Daily Shift Roster", 14, 20);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Date: ${fDate(tomorrowStr)}`, 14, 28);
        doc.text(`Generated: ${fDate(todayStr)}`, 14, 34);

        // Morning Shift Table
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(`Morning Shift (${morningStaff.length} Staff)`, 14, 45);
        autoTable(doc, {
          startY: 50,
          head: [["Name", "Post", "Staff Type"]],
          body: morningStaff.map(e => [e.name, e.post, e.staff_type === "company" ? "Company" : "Contract"]),
          theme: "grid",
          headStyles: { fillColor: [30, 111, 219] },
          styles: { fontSize: 10 }
        });

        // Night Shift Table
        const finalY = doc.lastAutoTable.finalY || 50;
        doc.setFontSize(14);
        doc.text(`Night Shift (${nightStaff.length} Staff)`, 14, finalY + 15);
        autoTable(doc, {
          startY: finalY + 20,
          head: [["Name", "Post", "Staff Type"]],
          body: nightStaff.map(e => [e.name, e.post, e.staff_type === "company" ? "Company" : "Contract"]),
          theme: "grid",
          headStyles: { fillColor: [22, 163, 74] }, // Green header for night shift to distinguish
          styles: { fontSize: 10 }
        });

        doc.save(`PRFM_Shift_Roster_${tomorrowStr}.pdf`);
      });
    });
  };
  const downloadOTReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.setTextColor(234, 88, 12); // Orange theme
        doc.text("Overtime Analysis Report", 14, 20);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${fDate(start)} to ${fDate(end)}`, 14, 28);
        doc.text(`Generated: ${fDate(todayStr)}`, 14, 34);

        // Fetch and rank everyone who did OT in this specific period
        const allOT = employees.map(emp => {
          const fin = calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime);
          return { name: emp.name, post: emp.post, type: emp.staff_type, hours: fin.totalOTHours, earnings: Math.round(fin.otEarnings) };
        }).filter(e => e.hours > 0).sort((a, b) => b.hours - a.hours);

        autoTable(doc, {
          startY: 40,
          head: [["Rank", "Name", "Post", "Type", "Total OT Hours", "OT Earnings (Rs)"]],
          body: allOT.map((e, i) => [i + 1, e.name, e.post, e.type === "company" ? "Company" : "Contract", e.hours + "h", e.earnings.toLocaleString("en-IN")]),
          theme: "grid",
          headStyles: { fillColor: [234, 88, 12] },
          styles: { fontSize: 10 }
        });

        doc.save(`PRFM_Overtime_Report_${start}_to_${end}.pdf`);
      });
    });
  };

  const downloadLoanReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(220, 38, 38);
        doc.text("Outstanding Loan & Advance Recovery", 14, 20);
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`As of: ${fDate(todayStr)}`, 14, 28);
        
        const active = employees.filter(e => e.status === "active");
        const rows = active.map(emp => {
          const fin = calcFinances(emp, posts, rangeAttendance, ledger, emp.joining_date || "2020-01-01", todayStr, postHistory, overtime);
          return { name: emp.name, post: emp.post, type: emp.staff_type, loan: fin.pendingLoan };
        }).filter(e => e.loan > 0).sort((a, b) => b.loan - a.loan);
        
        autoTable(doc, {
          startY: 35, head: [["Name", "Post", "Staff Type", "Pending Loan Balance"]],
          body: rows.map(r => [r.name, r.post, r.type === "company" ? "Company" : "Contract", "Rs. " + r.loan.toLocaleString("en-IN")]),
          theme: "grid", headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 10 }
        });
        doc.save(`PRFM_Loan_Recovery_${todayStr}.pdf`);
      });
    });
  };

  const downloadCostingReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(30, 111, 219);
        doc.text("Role-Wise Costing Breakdown", 14, 20);
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`Period: ${fDate(start)} to ${fDate(end)}`, 14, 28);
        
        const costing = posts.map(p => {
           const staff = employees.filter(e => e.post === p.name && e.status === "active");
           let totalCost = 0;
           staff.forEach(emp => {
               const fin = calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime);
               // Gross labor cost before personal deductions
               totalCost += (fin.proratedSalary + fin.otEarnings + fin.totalBonuses + (fin.foodAllowance || 0) - fin.attendanceDeduction); 
           });
           return { post: p.name, count: staff.length, cost: Math.round(totalCost) };
        }).sort((a, b) => b.cost - a.cost);
        
        autoTable(doc, {
          startY: 35, head: [["Role / Post", "Active Staff", "Total Labor Cost"]],
          body: costing.map(c => [c.post, c.count, "Rs. " + c.cost.toLocaleString("en-IN")]),
          foot: [["TOTAL", costing.reduce((sum, c) => sum + c.count, 0), "Rs. " + costing.reduce((sum, c) => sum + c.cost, 0).toLocaleString("en-IN")]],
          theme: "grid", headStyles: { fillColor: [30, 111, 219] }, footStyles: { fillColor: [240, 245, 255], textColor: [30, 111, 219], fontStyle: "bold" }, styles: { fontSize: 10 }
        });
        doc.save(`PRFM_Costing_${start}_to_${end}.pdf`);
      });
    });
  };

  const downloadContractorReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(30, 111, 219);
        doc.text("Contractor Reconciliation Statement", 14, 20);
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`Period: Lifetime up to ${fDate(end)}`, 14, 28);
        
        const payouts = ledger.filter(l => l.transaction_type === "Contractor Payout" && l.date <= end);
        const distributions = ledger.filter(l => l.transaction_type === "Contractor Distribution" && l.date <= end);
        const totalPaid = payouts.reduce((s, l) => s + Number(l.amount), 0);
        const totalDist = distributions.reduce((s, l) => s + Number(l.amount), 0);
        
        autoTable(doc, {
          startY: 35, head: [["Metric", "Amount"]],
          body: [
             ["Total Lump Sum Paid to Contractor", "Rs. " + totalPaid.toLocaleString("en-IN")],
             ["Total Distributed to Contract Staff", "Rs. " + totalDist.toLocaleString("en-IN")],
             ["Unassigned Pool Remaining", "Rs. " + (totalPaid - totalDist).toLocaleString("en-IN")]
          ], theme: "grid", headStyles: { fillColor: [30, 111, 219] }, styles: { fontSize: 12, cellPadding: 8 }
        });
        doc.save(`PRFM_Contractor_Reconciliation_${end}.pdf`);
      });
    });
  };

  const downloadAbsenteeismReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(234, 88, 12);
        doc.text("Chronic Absenteeism Warning Report", 14, 20);
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`Period: ${fDate(start)} to ${fDate(end)} (Below 75% Attendance)`, 14, 28);
        
        const sDt = new Date(start); const eDt = new Date(end);
        const days = Math.max(1, Math.round((eDt - sDt) / 86400000) + 1);
        const active = employees.filter(e => e.status === "active");
        
        const rows = active.map(emp => {
           const fin = calcFinances(emp, posts, rangeAttendance, ledger, start, end, postHistory, overtime);
           const present = Math.max(0, days - fin.absentDays - fin.leaveDays);
           const pct = (present / days) * 100;
           return { name: emp.name, post: emp.post, pct, absent: fin.absentDays };
        }).filter(r => r.pct < 75).sort((a, b) => a.pct - b.pct);
        
        autoTable(doc, {
          startY: 35, head: [["Name", "Post", "Absent Days", "Attendance %"]],
          body: rows.length ? rows.map(r => [r.name, r.post, r.absent + "d", r.pct.toFixed(1) + "%"]) : [["All staff have good attendance", "-", "-", "-"]],
          theme: "grid", headStyles: { fillColor: [234, 88, 12] }, styles: { fontSize: 10 }
        });
        doc.save(`PRFM_Absenteeism_${start}_to_${end}.pdf`);
      });
    });
  };

  const downloadAttritionReport = () => {
    import("jspdf").then(({ jsPDF }) => {
      import("jspdf-autotable").then(({ default: autoTable }) => {
        const doc = new jsPDF();
        doc.setFontSize(18); doc.setTextColor(15, 23, 42);
        doc.text("Monthly Attrition & New Hires", 14, 20);
        doc.setFontSize(11); doc.setTextColor(100);
        doc.text(`Period: ${fDate(start)} to ${fDate(end)}`, 14, 28);
        
        const joined = employees.filter(e => e.joining_date >= start && e.joining_date <= end);
        const left = employees.filter(e => e.left_date && e.left_date >= start && e.left_date <= end);
        
        doc.setTextColor(22, 163, 74); doc.setFontSize(14); doc.text(`New Hires: ${joined.length}`, 14, 40);
        autoTable(doc, {
          startY: 45, head: [["Name", "Post", "Joined Date"]],
          body: joined.length ? joined.map(j => [j.name, j.post, fDate(j.joining_date)]) : [["No new hires", "-", "-"]],
          theme: "grid", headStyles: { fillColor: [22, 163, 74] }, styles: { fontSize: 10 }
        });
        
        let finalY = doc.lastAutoTable.finalY + 15;
        doc.setTextColor(220, 38, 38); doc.setFontSize(14); doc.text(`Staff Left: ${left.length}`, 14, finalY);
        autoTable(doc, {
          startY: finalY + 5, head: [["Name", "Last Post", "Left Date"]],
          body: left.length ? left.map(l => [l.name, l.post, fDate(l.left_date)]) : [["No staff left", "-", "-"]],
          theme: "grid", headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 10 }
        });
        doc.save(`PRFM_Attrition_${start}_to_${end}.pdf`);
      });
    });
  };

  return (
    <div style={css.page}>
      <div style={{ marginBottom: 20 }}>
        <div style={css.sectionTitle}>Data Extraction</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Reports & Exports</div>
      </div>

      {/* --- CARD 1: CSV EXPORT --- */}
      <div style={{ ...css.card, marginBottom: 20, borderLeft: `3px solid ${C.green}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>1. Monthly Payroll Summary (CSV)</div>
        <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>Export raw financial data into a spreadsheet for accountants to easily import into Excel, Tally, or QuickBooks.</div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, alignItems: "flex-end" }}>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>FROM</div><input type="date" style={css.input} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>TO</div><input type="date" style={css.input} value={end} onChange={e => setEnd(e.target.value)} /></div>
          <button style={css.btn(C.green)} onClick={downloadCSV} disabled={loading}>{loading ? "Fetching Data..." : "📥 Download CSV Spreadsheet"}</button>
        </div>
      </div>

      {/* --- CARD 2: OPERATIONS ROSTER --- */}
      <div style={{ ...css.card, borderLeft: `3px solid ${C.blue}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>2. Operations & Shift Roster</div>
        <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>Live overview for supervisors to manage upcoming shifts and monitor employee overtime fatigue.</div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          
          <div style={{ background: C.bg, padding: 16, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 10, letterSpacing: 1 }}>TOMORROW'S ROSTER ({fDate(tomorrowStr)})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
  <div style={{ borderRight: `1px solid ${C.border}`, paddingRight: 10 }}>
                <div style={{ color: C.accent, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Morning Shift</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{morningStaff.length}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>Expected Staff</div>
              </div>
              <div style={{ flex: 1, paddingLeft: 10 }}>
                <div style={{ color: C.blue, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Night Shift</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{nightStaff.length}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>Expected Staff</div>
              </div>
            </div>
            <button style={{ ...css.btn(C.blue), width: "100%", marginTop: 14 }} onClick={printRoster}>🖨 Download Roster PDF</button>
          </div>

          <div style={{ background: C.orange + "11", padding: 16, borderRadius: 8, border: `1px solid ${C.orange}33`, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 10, letterSpacing: 1 }}>OVERTIME WATCHLIST (TOP 5)</div>
            <div style={{ flex: 1 }}>
              {otWatchlist.length === 0 ? <div style={{ fontSize: 12, color: C.textDim }}>No overtime logged in this period.</div> : (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <tbody>
                    {otWatchlist.map((w, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.orange}22` }}>
                        <td style={{ padding: "6px 0", fontWeight: 700 }}>{w.name}</td>
                        <td style={{ padding: "6px 0", color: C.textDim, fontSize: 10 }}>{w.post}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", color: C.orange, fontWeight: 700 }}>{w.hours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <button style={{ ...css.btn(C.orange), width: "100%", marginTop: 14 }} onClick={downloadOTReport} disabled={loading}>📥 Download Full OT Report</button>
          </div>

        </div>
      </div>

      {/* --- CARD 3: FINANCIAL & CASH FLOW --- */}
      <div style={{ ...css.card, marginBottom: 20, borderLeft: `3px solid ${C.accent}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>3. Financial & Cash Flow Reports</div>
        <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>Deep insights into labor costs, contractor reconciliations, and active employee debts.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={{ ...css.btn(C.red), flex: "1 1 200px" }} onClick={downloadLoanReport} disabled={loading}>📥 Loan & Advance Recovery</button>
          <button style={{ ...css.btn(C.blue), flex: "1 1 200px" }} onClick={downloadCostingReport} disabled={loading}>📥 Role-Wise Costing</button>
          <button style={{ ...css.btn(C.accent), flex: "1 1 200px" }} onClick={downloadContractorReport} disabled={loading}>📥 Contractor Reconciliation</button>
        </div>
      </div>

      {/* --- CARD 4: HR & DISCIPLINE --- */}
      <div style={{ ...css.card, borderLeft: `3px solid ${C.orange}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>4. HR & Discipline Reports</div>
        <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>Track workforce stability, identify chronic absenteeism, and monitor monthly turnover.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={{ ...css.btn(C.orange), flex: "1 1 200px" }} onClick={downloadAbsenteeismReport} disabled={loading}>📥 Chronic Absenteeism ({"<"} 75%)</button>
          <button style={{ ...css.btn(C.textDim), flex: "1 1 200px", color: C.text, borderColor: C.border }} onClick={downloadAttritionReport} disabled={loading}>📥 Monthly Attrition & New Hires</button>
        </div>
      </div>

    </div>
  );
}
// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
function LogsView({ logs, setLogs }) {
  const undoAction = async (log) => {
    if (!window.confirm(`Delete this log entry?\n\n(Note: To truly undo "${log.action}", you must also manually revert the actual data in the relevant tab).`)) return;
    await supabase.from("audit_logs").delete().eq("id", log.id);
    setLogs(prev => prev.filter(l => l.id !== log.id));
  };

  return (
    <div style={css.page}>
      <div style={css.sectionTitle}>System Audit Logs</div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr>{["Date", "Time", "User", "Action", "Details", "Undo"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={6} style={{ ...css.td, textAlign: "center", padding: 30, color: C.textDim }}>No actions recorded yet.</td></tr>}
            {logs.map(l => {
              const d = new Date(l.created_at);
              return (
                <tr key={l.id}>
                  <td style={css.td}>{d.toLocaleDateString("en-IN")}</td>
                  <td style={css.td}>{d.toLocaleTimeString("en-IN")}</td>
                  <td style={css.td}>{l.user_email}</td>
                  <td style={{ ...css.td, fontWeight: "bold", color: C.accent }}>{l.action}</td>
                  <td style={css.td}>{l.details}</td>
                  <td style={css.td}><button style={{ ...css.btn(C.red), padding: "4px 8px", fontSize: 10 }} onClick={() => undoAction(l)}>Undo / Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ─── APP ROOT ─────────────────────────────────────────────────────────────────
// ─── USER MANAGEMENT (DIRECTOR ONLY) ──────────────────────────────────────────
function UserManagementView({ users, setUsers, employees }) {
  const updateRole = async (userId, newRole) => {
    await supabase.from("app_users").update({ role: newRole }).eq("id", userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const linkEmployee = async (userId, empId) => {
    const val = empId === "" ? null : empId;
    await supabase.from("app_users").update({ employee_id: val }).eq("id", userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, employee_id: val } : u));
  };

  const deleteUser = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to remove access for ${email}?`)) return;
    const { error } = await supabase.from("app_users").delete().eq("id", userId);
    if (error) {
      alert("Error removing user: " + error.message);
    } else {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  return (
    <div style={css.page}>
      <div style={css.sectionTitle}>User Access Management</div>
      <div style={{ overflowX: "auto" }}>
        <table style={css.table}>
          <thead><tr><th style={css.th}>Email</th><th style={css.th}>Role</th><th style={css.th}>Linked Employee (For Viewers)</th><th style={css.th}>Action</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ background: u.role === "pending" ? C.orange + "15" : "transparent" }}>
                <td style={css.td}><strong>{u.email}</strong></td>
                <td style={css.td}>
                  <select style={css.input} value={u.role} onChange={e => updateRole(u.id, e.target.value)}>
                    <option value="pending">Pending (Locked Out)</option>
                    <option value="viewer">Viewer (Staff Only)</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Manager</option>
                    <option value="director">Director</option>
                  </select>
                </td>
                <td style={css.td}>
                  <select disabled={u.role !== "viewer"} style={{ ...css.input, opacity: u.role !== "viewer" ? 0.3 : 1, width: "100%" }} value={u.employee_id || ""} onChange={e => linkEmployee(u.id, e.target.value)}>
                    <option value="">-- Link to Staff Profile --</option>
                    {employees.filter(e => e.status === "active").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </td>
                <td style={css.td}>
                  <button style={{ ...css.btn(C.red), padding: "4px 8px", fontSize: 10 }} onClick={() => deleteUser(u.id, u.email)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ─── VIEWER DASHBOARD (EMPLOYEE SELF-SERVICE) ───────────────────────────────
function ViewerDashboardView({ userEmail, appUsers, employees, posts, ledger, postHistory, overtime }) {
  // Let the user pick their own dates
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [end, setEnd] = useState(() => new Date().toISOString().split("T")[0]);
  
  const me = appUsers.find(u => u.email === userEmail);
  const myEmp = employees.find(e => e.id === me?.employee_id);

  // Fetch full lifetime attendance for this employee to correctly calculate Opening Balance
  const [rangeAttendance, setRangeAttendance] = useState([]);
  useEffect(() => {
    const fetchAtt = async () => {
      if (!myEmp) return;
      const { data } = await supabase.from("attendance").select("*").eq("employee_id", myEmp.id);
      if (data) setRangeAttendance(data);
    };
    fetchAtt();
  }, [myEmp?.id]);

  if (!myEmp) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...css.card, textAlign: "center", padding: 40, color: C.textDim, maxWidth: 400 }}>
          <h3 style={{ marginTop: 0, color: C.accent }}>Account Not Linked</h3>
          <p>Your account has been approved, but the Director has not linked it to your staff profile yet.</p>
        </div>
      </div>
    );
  }

  // Filter data and calculate finances securely using the global function
  let fin = { absentDays: 0, leaveDays: 0, totalOTHours: 0, otEarnings: 0, totalAdvances: 0, attendanceDeduction: 0, totalPaid: 0, netPayable: 0, pendingLoan: 0, proratedSalary: 0, totalBonuses: 0, foodAllowance: 0 };
  try { fin = calcFinances(myEmp, posts, rangeAttendance, ledger, start, end, postHistory, overtime); } catch (err) {}

  const myLedger = ledger.filter(l => String(l.employee_id) === String(myEmp.id) && l.date >= start && l.date <= end).sort((a,b) => new Date(b.date) - new Date(a.date));
  const myOT = overtime.filter(o => String(o.employee_id) === String(myEmp.id) && o.date >= start && o.date <= end);
  const totalOTHours = myOT.reduce((sum, o) => sum + Number(o.hours), 0);

  const downloadMyStatement = () => {
    try {
      // Calculate Prior Balance (Carried Forward)
      const [y, m, d] = start.split("-").map(Number);
      const beforeDt = new Date(y, m - 1, d - 1);
      const beforeStartStr = [beforeDt.getFullYear(), String(beforeDt.getMonth() + 1).padStart(2, "0"), String(beforeDt.getDate()).padStart(2, "0")].join("-");
      
      const priorFin = calcFinances(myEmp, posts, rangeAttendance, ledger, myEmp.joining_date || "2020-01-01", beforeStartStr, postHistory, overtime);
      const openingBalance = Math.round(priorFin.netPayable);

      const closingFin = calcFinances(myEmp, posts, rangeAttendance, ledger, myEmp.joining_date || "2020-01-01", end, postHistory, overtime);
      const closingBalance = Math.round(closingFin.netPayable);

      const periodDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
      const periodPresent = Math.max(0, periodDays - fin.absentDays - fin.leaveDays);
      const periodAttPct = ((periodPresent / periodDays) * 100).toFixed(1);

      import("jspdf").then(({ jsPDF }) => {
        import("jspdf-autotable").then(({ default: autoTable }) => {
          const doc = new jsPDF();
          doc.setFontSize(20); doc.setTextColor(30, 111, 219);
          doc.text("PUNATHIL ROLLER FLOUR MILLS", 14, 20);
          doc.setFontSize(14); doc.setTextColor(0);
          doc.text(`Comprehensive Statement: ${myEmp.name}`, 14, 28);
          doc.setFontSize(10);
          doc.text(`Period: ${start} to ${end} | Aadhar: ${myEmp.aadhar || "N/A"}`, 14, 34);

          autoTable(doc, {
            startY: 40,
            head: [["Metric / Account", "Details", "Amount / Stat"]],
            body: [
              ["--- EMPLOYMENT METRICS ---", "", ""],
              ["Period Attendance %", `${periodPresent} present / ${periodDays} period days`, `${periodAttPct}%`],
              ["Period Absences", "Total leaves & absences", `${fin.absentDays + fin.leaveDays} days`],
              ["Period Overtime Logged", "Total overtime hours", `${fin.totalOTHours} hrs`],
              ["--- FINANCIAL LEDGER ---", "", ""],
              ["OPENING BALANCE (Brought Forward)", `Balance as of ${beforeStartStr}`, `Rs. ${openingBalance.toLocaleString("en-IN")}`],
              ["(+) Base Salary (Prorated)", `Worked: ${periodPresent} days`, `Rs. ${Math.round(fin.proratedSalary).toLocaleString("en-IN")}`],
              ["(+) Overtime Earnings", `OT Hours: ${fin.totalOTHours}`, `Rs. ${Math.round(fin.otEarnings).toLocaleString("en-IN")}`],
              ["(+) Bonus", `Period incentives`, `Rs. ${Math.round(fin.totalBonuses).toLocaleString("en-IN")}`],
              ["(+) Food Allowance", `Attendance incentive`, `Rs. ${Math.round(fin.foodAllowance || 0).toLocaleString("en-IN")}`],
              ["(+) Loan Repayments", `Repaid to company`, `Rs. ${Math.round(fin.totalRepayments).toLocaleString("en-IN")}`],
              ["(-) Attendance Deductions", `Absences: ${fin.absentDays + fin.leaveDays}d`, `Rs. ${Math.round(fin.attendanceDeduction).toLocaleString("en-IN")}`],
              ["(-) Personal Advances", `Cash advances taken`, `Rs. ${fin.totalAdvances.toLocaleString("en-IN")}`],
              ["(-) New Loans Given", `Company loans issued`, `Rs. ${Math.round(fin.totalLoans).toLocaleString("en-IN")}`],
              ["(-) Salary Payouts", `Transfers & payouts`, `Rs. ${fin.totalPaid.toLocaleString("en-IN")}`],
              ["CLOSING NET BALANCE", `Final Payable as of ${end}`, `Rs. ${closingBalance.toLocaleString("en-IN")}`],
              ["ACTIVE LOAN DEBT", `Total Unpaid Principal`, `Rs. ${closingFin.pendingLoan.toLocaleString("en-IN")}`]
            ],
            theme: "grid", headStyles: { fillColor: [244, 246, 249], textColor: [0, 0, 0] }, styles: { fontSize: 10, fontStyle: "bold" }
          });

          let finalY = doc.lastAutoTable.finalY + 10;

          if (myOT.length > 0) {
            const fallbackHourly = Math.round((((Number(myEmp.base_salary) * 12) / 365) / 12) * 2) / 2;
            autoTable(doc, {
              startY: finalY,
              head: [["Date", "Overtime Post", "Time", "Hours", "Amount Earned"]],
              body: myOT.map(o => {
                let hrRate = fallbackHourly;
                const p = (posts || []).find(x => x.name === o.post);
                if (p) {
                  const pSal = Number(p.contract_salary) || Number(p.base_salary) || 0;
                  if (pSal > 0) hrRate = Math.round((((pSal * 12) / 365) / 12) * 2) / 2;
                }
                const earned = Math.round(Number(o.hours) * hrRate);
                return [o.date, o.post, `${o.start_time} - ${o.end_time}`, `${o.hours}h`, `Rs. ${earned.toLocaleString("en-IN")}`];
              }),
              theme: "grid", headStyles: { fillColor: [22, 163, 74] }, styles: { fontSize: 9 }
            });
            finalY = doc.lastAutoTable.finalY + 10;
          }

          if (myLedger.length > 0) {
            autoTable(doc, {
              startY: finalY,
              head: [["Date", "Transaction Type", "Amount", "Remarks"]],
              body: myLedger.map(l => [l.date, l.transaction_type, `Rs. ${l.amount.toLocaleString("en-IN")}`, l.note || l.notes || "-"]),
              theme: "grid", headStyles: { fillColor: [234, 88, 12] }, styles: { fontSize: 9 }
            });
          }

          doc.save(`Statement_${myEmp.name.replace(/ /g, "_")}_${start}_to_${end}.pdf`);
        });
      });
    } catch (err) { alert("PDF Logic Error: " + err.message); }
  };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div style={{ ...css.card, flex: 1, minWidth: 280, borderLeft: `3px solid ${C.accent}`, margin: 0 }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>WELCOME,</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.accent, marginTop: 4, textTransform: "uppercase" }}>{myEmp.name}</div>
          <div style={{ color: C.textDim, marginTop: 4 }}>{myEmp.post} • {myEmp.shift} Shift</div>
        </div>
        
        <div style={{ ...css.card, display: "flex", gap: 10, alignItems: "flex-end", margin: 0 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontWeight: 700 }}>START DATE</div>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={css.input} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontWeight: 700 }}>END DATE</div>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={css.input} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 16, background: C.panel, borderRadius: 6, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>PERIOD NET PAYABLE</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.green, marginTop: 4 }}>₹{Math.round(fin.netPayable).toLocaleString("en-IN")}</div>
        </div>
        <div style={{ padding: 16, background: C.panel, borderRadius: 6, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>OVERTIME HOURS (PERIOD)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.accent, marginTop: 4 }}>{totalOTHours} hrs</div>
        </div>
        <div style={{ padding: 16, background: C.panel, borderRadius: 6, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700 }}>PENDING LOAN BALANCE</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: fin.pendingLoan > 0 ? C.red : C.text, marginTop: 4 }}>₹{Math.round(fin.pendingLoan).toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div style={{ ...css.card, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={css.sectionTitle}>Period Ledger & Transactions</div>
          <button style={css.btn(C.blue)} onClick={downloadMyStatement}>📥 Download PDF Statement</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={css.table}>
            <thead><tr>{["Date", "Type", "Amount", "Note"].map(h => <th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {myLedger.length === 0 && <tr><td colSpan={4} style={{ ...css.td, textAlign: "center", color: C.textDim, padding: 20 }}>No transactions in this period.</td></tr>}
              {myLedger.map(l => (
                <tr key={l.id}>
                  <td style={{ ...css.td, fontSize: 12 }}>{l.date}</td>
                  <td style={{ ...css.td, fontSize: 12 }}>{l.transaction_type}</td>
                  <td style={{ ...css.td, color: ["Advance", "Fine"].includes(l.transaction_type) ? C.red : C.green, fontWeight: 700 }}>₹{Number(l.amount).toLocaleString("en-IN")}</td>
                  <td style={{ ...css.td, fontSize: 11, color: C.textDim }}>{l.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [ledger, setLedger] = useState([]);
  const [postHistory, setPostHistory] = useState([]);
  const [overtime, setOvertime] = useState([]);
  const [loading, setLoading] = useState(true);
  const nowDt = new Date();
  const defaultStart = [nowDt.getFullYear(), String(nowDt.getMonth() + 1).padStart(2, "0"), "01"].join("-");
  const [trackingStartDate, setTrackingStartDate] = useState(localStorage.getItem("trackingStartDate") || defaultStart);
  const [logs, setLogs] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [myRole, setMyRole] = useState(null);

  // Use this function anywhere to record an action
  const logAction = async (action, details) => {
    const email = user?.email || "System";
    const { data, error } = await supabase.from("audit_logs").insert({ user_email: email, action, details }).select().single();
    
    // TRAP: If Supabase rejects it (missing table, permissions, etc), tell us!
    if (error) alert("❌ Database Log Error: " + error.message);
    if (data) setLogs(prev => [data, ...prev]);
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);
      if (typeof logAction === "function") logAction("User Login", `User accessed the dashboard`);
      const { data: emps } = await supabase.from("employees").select("*").order("name");
      if (emps) setEmployees(emps);
      const { data: postsData } = await supabase.from("posts").select("*").order("name");
      if (postsData) setPosts(postsData);
      const { data: att } = await supabase.from("attendance").select("*").eq("date", todayStr);
      if (att) { const attMap = {}; att.forEach(a => { attMap[a.employee_id] = { status: a.status, ot_hours: a.ot_hours, dbId: a.id }; }); setAttendance(attMap); }
      const { data: ledgData } = await supabase.from("financial_ledger").select("*").order("date", { ascending: false });
      if (ledgData) setLedger(ledgData);
      const { data: histData } = await supabase.from("post_history").select("*").order("valid_from");
      if (histData) setPostHistory(histData);
      const { data: otData } = await supabase.from("overtime_entries").select("*").order("date", { ascending: false });
      if (otData) setOvertime(otData);
      const { data: logData } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
      if (logData) setLogs(logData);
      
      const { data: usersData } = await supabase.from("app_users").select("*").order("created_at", { ascending: false });
      if (usersData) {
        setAppUsers(usersData);
        const me = usersData.find(u => u.email === user.email);
        setMyRole(me ? me.role : "pending");
      } else setMyRole("pending");
      
      setLoading(false);
    };
    loadData();
  }, [user]);

  const handleSignOut = async () => { 
    if (logAction) await logAction("Logged Out", `User signed out of the portal`);
    await supabase.auth.signOut(); 
    setUser(null); 
  };

  if (!user) return <Login onLogin={setUser} />;

  const alerts = getCoverage(employees.filter(e => e.status === "active"), attendance, posts);
  const pendingSettlements = employees.filter(e => e.status === "inactive" && !e.settlement_done).length;

 // Dynamic tabs based on role
  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    ...(myRole !== "viewer" ? [{ id: "attendance", label: "Attendance" }, { id: "overtime", label: "Overtime" }] : []),
    ...(myRole === "director" || myRole === "manager" ? [{ id: "staff", label: "Staff" }] : []),
    ...(myRole === "director" || myRole === "manager" ? [{ id: "payroll", label: "Payroll" }, { id: "reports", label: "📊 Reports" }] : []),
    ...(myRole === "director" ? [{ id: "settings", label: "⚙ Settings" }, { id: "logs", label: "📋 Logs" }, { id: "users", label: "🔐 Users" }] : []),
  ];

  if (myRole === "pending") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ ...css.card, textAlign: "center", padding: 40 }}>
          <h2 style={{ color: C.orange, marginTop: 0 }}>Account Under Review</h2>
          <p style={{ color: C.textDim, marginTop: 10 }}>Your account has been created but is waiting for Director approval.</p>
          <button onClick={handleSignOut} style={{ ...css.btn(C.red), marginTop: 20 }}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <div style={css.page}>
      <style>{`
        /* Force Light Theme */
        :root { color-scheme: light !important; }
        body { background-color: #f4f6f9 !important; color: #0f172a !important; margin: 0; }
        
        @media (max-width: 768px) {
          /* 1. Header & Alerts: Stack cleanly and allow scrolling away on mobile */
          header { position: static !important; flex-direction: column !important; gap: 12px !important; align-items: center !important; text-align: center; height: auto !important; padding: 16px 10px !important; }
          header > div:last-child { display: flex !important; flex-wrap: wrap !important; justify-content: center !important; gap: 8px !important; }
          
          /* 2. Payroll/Ledger: Search Box vs Register Button (Adds safe spacing and stacks them) */
          div[style*="justify-content: space-between"] { flex-direction: column !important; align-items: stretch !important; gap: 16px !important; text-align: left !important; }
          
          /* 3. General Date Entry Fix */
          div[style*="display: flex"][style*="gap: 10"] { flex-wrap: wrap !important; gap: 12px !important; }
          div[style*="display: flex"] > div[style*="flex: 1"] { min-width: 100% !important; }
          input[type="date"] { width: 100% !important; box-sizing: border-box !important; }
          
          /* 4. Overtime, Payroll & Reports: Forces ALL date grids to convert to stacked flex columns */
          div[style*="align-items: flex-end"] { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          div[style*="align-items: flex-end"] > div { width: 100% !important; }
          div[style*="align-items: flex-end"] input, div[style*="align-items: flex-end"] select, div[style*="align-items: flex-end"] button { width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
          
          /* 5. Watchlist & Grids: Perfect single-column alignment */
          div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          
          /* 6. Ensure tables remain safe to swipe */
          table { display: block !important; overflow-x: auto !important; white-space: nowrap !important; width: 100% !important; }
          
          /* Make all inputs, selects, and buttons safe */
          input, select, button { max-width: 100% !important; box-sizing: border-box !important; }

          /* 4. Fix Squished Date Boxes */
          div[style*="align-items: flex-end"] { grid-template-columns: 1fr !important; }
          input[type="date"], input[type="time"] { min-height: 38px !important; }
        }
      `}</style>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: C.textDim, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
          
          {/* Locked to prevent viewers from seeing internal HR alerts */}
          {myRole !== "viewer" && alerts.length > 0 && <span style={{ ...css.badge(C.red), cursor: "pointer" }} onClick={() => setTab("dashboard")}>⚠ {alerts.length} Alert{alerts.length > 1 ? "s" : ""}</span>}
          {myRole !== "viewer" && pendingSettlements > 0 && <span style={{ ...css.badge(C.orange), cursor: "pointer" }} onClick={() => setTab("payroll")}>⚖ {pendingSettlements} Pending</span>}
          
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
          {tab === "dashboard" && myRole === "viewer" && (
          <ViewerDashboardView userEmail={user.email} appUsers={appUsers} employees={employees} posts={posts} ledger={ledger} postHistory={postHistory} overtime={overtime} />
        )}
        {tab === "dashboard" && myRole !== "viewer" && <DashboardView employees={employees} attendance={attendance} posts={posts} trackingStartDate={trackingStartDate} />}
          {tab === "attendance" && myRole !== "viewer" && <AttendanceView employees={employees} logAction={logAction} myRole={myRole} />}
          {tab === "overtime" && myRole !== "viewer" && <OvertimeView employees={employees} posts={posts} overtime={overtime} setOvertime={setOvertime} logAction={logAction} myRole={myRole} />}
          {tab === "staff" && (myRole === "director" || myRole === "manager") && <StaffView employees={employees} setEmployees={setEmployees} posts={posts} ledger={ledger} setLedger={setLedger} postHistory={postHistory} setPostHistory={setPostHistory} overtime={overtime} logAction={logAction} myRole={myRole} />}
          {tab === "payroll" && myRole !== "viewer" && <PayrollView employees={employees} posts={posts} ledger={ledger} setLedger={setLedger} postHistory={postHistory} overtime={overtime} logAction={logAction} myRole={myRole} />}
          {tab === "reports" && (myRole === "director" || myRole === "manager") && <ReportsView employees={employees} posts={posts} ledger={ledger} postHistory={postHistory} overtime={overtime} logAction={logAction} />}
          {tab === "settings" && myRole === "director" && <SettingsView posts={posts} setPosts={setPosts} employees={employees} setEmployees={setEmployees} trackingStartDate={trackingStartDate} setTrackingStartDate={setTrackingStartDate} logAction={logAction} />}
          {tab === "logs" && myRole === "director" && <LogsView logs={logs} setLogs={setLogs} />} {/* <-- NEW RENDER LINE */}
          {tab === "users" && myRole === "director" && <UserManagementView users={appUsers} setUsers={setAppUsers} employees={employees} />}
        </>
      )}
    </div>
  );
}