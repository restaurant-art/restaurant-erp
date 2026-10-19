import React from "react";
import { UserPlus, FileBarChart, ClipboardList, CalendarClock, FileDown, SlidersHorizontal } from "lucide-react";
import "./finance-workspace-design.css";
import "./attendance-workspace-design.css";

const pages = {
  "Manual Check In/Out": [ClipboardList, "AUTHORIZED MANUAL ATTENDANCE", "Keep every shift accounted for.", "Record check-in or check-out when an employee cannot use the face kiosk."],
  "Add Face ID": [UserPlus, "EMPLOYEE ENROLLMENT", "Face ID, ready for your team.", "Select an employee, capture enrollment samples, and manage their saved Face ID."],
  "Attendance Report": [FileBarChart, "MONTHLY OVERVIEW", "Your team's attendance, at a glance.", "Review attendance days, late arrivals, work hours, and open shifts for each employee."],
  "Attendance Records": [ClipboardList, "DAILY PUNCH HISTORY", "Every shift. Every punch.", "Find employee attendance by date and status, with check-in, check-out, and worked time together."],
  "Leave Requests": [CalendarClock, "TIME OFF", "Plan leave with clarity.", "Submit leave requests, review dates and reasons, and follow each approval status."],
  "Leave Approvals": [ClipboardList, "LEAVE REVIEW", "Review requests. Plan your team.", "Approve or reject pending leave requests and review past decisions in one place."],
  "Payroll Summary": [FileDown, "PAYROLL & WORK HOURS", "Turn attendance into a clear summary.", "Review payable days, overtime, and salary calculations for the selected payroll month."],
  Settings: [SlidersHorizontal, "ATTENDANCE CONTROLS", "Set the rules for your workplace.", "Manage working hours, shift timing, and face-verification settings for this branch."],
};

export function AttendancePageIntro({ view, branch }) {
  const page = pages[view];
  if (!page) return null;
  const [Icon, eyebrow, title, description] = page;
  return <header className="finance-page-intro attendance-page-intro">
    <div className="finance-intro-main"><div className="finance-intro-icon"><Icon size={27} /></div><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div></div>
    <div className="finance-intro-label"><span>ATTENDANCE WORKSPACE</span><strong>{branch || "Current branch"}</strong></div>
  </header>;
}
