import React, { useState } from "react";

export function AttendanceLeaveList({ requests, onReview }) {
  const [status, setStatus] = useState("Pending");
  const reviewing = typeof onReview === "function";
  const visible = reviewing && status !== "All" ? requests.filter((request) => request.status === status) : requests;
  return <>
    {reviewing && <div className="leave-approval-filters" aria-label="Leave status filters">
      {["Pending", "Approved", "Rejected", "All"].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>
        {value}<span>{value === "All" ? requests.length : requests.filter((request) => request.status === value).length}</span>
      </button>)}
    </div>}
    <div className="leave-table-scroll">
      <table>
        <thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Reason</th><th>Status</th>{reviewing && <th>Action</th>}</tr></thead>
        <tbody>{visible.map((request) => <tr key={request.id}>
          <td><strong>{request.employeeName}</strong><br /><small>{request.employeeCode}</small></td>
          <td>{request.type}</td><td>{request.from}<br /><small>to {request.to}</small></td>
          <td className="leave-reason-cell">{request.reason}</td>
          <td><span className={request.status === "Approved" ? "active-chip" : request.status === "Rejected" ? "danger-chip" : "attendance-open-chip"}>{request.status}</span></td>
          {reviewing && <td>{request.status === "Pending" ? <div className="leave-review-actions">
            <button type="button" aria-label={`Approve leave for ${request.employeeName}`} onClick={() => onReview(request.id, "Approved")}>Approve</button>
            <button type="button" className="danger-action" aria-label={`Reject leave for ${request.employeeName}`} onClick={() => onReview(request.id, "Rejected")}>Reject</button>
          </div> : <span className="permission-note">Reviewed</span>}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <div className="empty-table-state">{reviewing && status !== "All" ? `No ${status.toLowerCase()} leave requests for this branch.` : "No leave requests for this branch yet."}</div>}
  </>;
}
