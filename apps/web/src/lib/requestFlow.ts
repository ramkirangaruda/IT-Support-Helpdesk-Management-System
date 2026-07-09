// Plain-English "where is this and what happens next" text for device requests and purchase
// requests. Both are multi-party approval chains (requester → manager → IT / finance) and the
// status enum alone doesn't tell anyone who's holding the ball or what they're supposed to do —
// this is the single source of that wording so every screen (and every action's confirmation)
// says the same thing.

// ── Device requests ─────────────────────────────────────────────────────────────

/** First-person framing ("your manager") — for the requester's own view of their request. */
export function deviceRequestNextStepForRequester(status: string, comment?: string | null): string {
  switch (status) {
    case 'SUBMITTED':
      return 'Submitted — about to be routed to your manager.';
    case 'PENDING_MANAGER_APPROVAL':
      return 'With your manager — they need to approve or reject it.';
    case 'APPROVED':
    case 'PENDING_FULFILMENT':
      return 'Approved. With IT now — they’ll allocate a device from stock, or order one if none is available.';
    case 'ALLOCATED':
      return 'Done — your device has been allocated. Check My Devices.';
    case 'REJECTED':
      return comment ? `Rejected by your manager: "${comment}"` : 'Rejected by your manager.';
    case 'RETURN_REQUESTED':
      return 'Return requested — with IT to process.';
    case 'RETURNED':
      return 'Returned — this device is back in the shared pool.';
    case 'CANCELLED':
      return 'Cancelled.';
    default:
      return '';
  }
}

/** Third-person framing — for admins/managers looking at someone else's request in a queue. */
export function deviceRequestNextStepForViewer(status: string, managerName?: string | null): string {
  switch (status) {
    case 'SUBMITTED':
      return 'About to be routed for manager approval.';
    case 'PENDING_MANAGER_APPROVAL':
      return managerName ? `Waiting on ${managerName}'s approval.` : 'Waiting on manager approval.';
    case 'APPROVED':
    case 'PENDING_FULFILMENT':
      return 'Approved — waiting on IT to allocate a device or raise a purchase.';
    case 'ALLOCATED':
      return 'Fulfilled — device allocated to the requester.';
    case 'REJECTED':
      return 'Rejected — closed, no further action.';
    case 'RETURN_REQUESTED':
      return 'Waiting on IT to process the return.';
    case 'RETURNED':
      return 'Returned — closed, device back in stock.';
    case 'CANCELLED':
      return 'Cancelled — closed, no further action.';
    default:
      return '';
  }
}

/** What to say right after an action was just taken on a device request. */
export function deviceRequestActionConfirmation(action: 'approved' | 'rejected', requesterName: string): string {
  return action === 'approved'
    ? `Approved. This now goes to IT to fulfil — they'll allocate a device to ${requesterName}, or raise a purchase if none is in stock.`
    : `Rejected. ${requesterName} has been notified — nothing further happens on this request.`;
}

// ── Purchase requests ────────────────────────────────────────────────────────────

export function purchaseRequestNextStep(status: string): string {
  switch (status) {
    case 'RAISED':
      return 'Draft — needs real cost and budget filled in, then submitted (Review & Submit) before anyone can approve it.';
    case 'PENDING_MANAGER_APPROVAL':
      return 'Waiting on manager approval.';
    case 'MANAGER_APPROVED':
    case 'PENDING_FINANCE_APPROVAL':
      return 'Manager-approved — waiting on finance approval.';
    case 'FINANCE_APPROVED':
      return 'Finance-approved — with IT to raise a purchase order with a vendor.';
    case 'PO_RAISED':
      return 'PO raised — waiting for the item to arrive, then IT marks it received.';
    case 'RECEIVED':
      return 'Received — added to the device register.';
    case 'REJECTED':
      return 'Rejected — closed, no further action.';
    case 'ON_HOLD':
      return 'On hold — needs a SYS_ADMIN to reactivate it before it can move again.';
    default:
      return '';
  }
}

/** What to say right after an action was just taken on a purchase request. */
export function purchaseRequestActionConfirmation(
  decision: 'APPROVED' | 'REJECTED' | 'ON_HOLD',
  resultingStatus: string,
): string {
  if (decision === 'REJECTED') return 'Rejected. The requester has been notified — this request is closed.';
  if (decision === 'ON_HOLD')  return 'Placed on hold. A SYS_ADMIN will need to reactivate it before it can move forward.';
  return `Approved. ${purchaseRequestNextStep(resultingStatus)}`;
}
