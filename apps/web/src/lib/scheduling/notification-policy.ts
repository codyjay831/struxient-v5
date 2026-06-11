import { JobScheduleEventKind, JobScheduleEventStatus } from "@prisma/client";

/** Notification intent is decoupled from schedule lifecycle (canon § notifications). */
export function shouldNotifyCustomerOnEventConfirm(_input: {
  kind: JobScheduleEventKind;
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
  customerVisibleOverride?: boolean;
}): boolean {
  if (_input.status === JobScheduleEventStatus.TENTATIVE) return false;
  if (_input.customerVisibleOverride !== undefined) return _input.customerVisibleOverride;
  if (!_input.notifyCustomerRequested) return false;
  return defaultCustomerVisibilityByKind(_input.kind);
}

export function shouldNotifyCustomerOnEventCancel(_input: {
  kind: JobScheduleEventKind;
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
  customerVisibleOverride?: boolean;
}): boolean {
  if (_input.customerVisibleOverride !== undefined) return _input.customerVisibleOverride;
  return _input.notifyCustomerRequested && defaultCustomerVisibilityByKind(_input.kind);
}

export function shouldNotifyCustomerOnEventReschedule(_input: {
  kind: JobScheduleEventKind;
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
  customerVisibleOverride?: boolean;
}): boolean {
  if (_input.status === JobScheduleEventStatus.TENTATIVE) return false;
  if (_input.customerVisibleOverride !== undefined) return _input.customerVisibleOverride;
  return _input.notifyCustomerRequested && defaultCustomerVisibilityByKind(_input.kind);
}

/** Tentative events never auto-notify customers by default. */
export function defaultNotifyCustomerForStatus(status: JobScheduleEventStatus): boolean {
  return status === JobScheduleEventStatus.CONFIRMED;
}

export function defaultCustomerVisibilityByKind(kind: JobScheduleEventKind): boolean {
  switch (kind) {
    case JobScheduleEventKind.CUSTOMER_APPOINTMENT:
    case JobScheduleEventKind.SITE_VISIT:
    case JobScheduleEventKind.INSPECTION:
    case JobScheduleEventKind.UTILITY_APPOINTMENT:
      return true;
    case JobScheduleEventKind.CREW_WORK:
    case JobScheduleEventKind.DELIVERY:
    case JobScheduleEventKind.OFFICE_WORK:
    case JobScheduleEventKind.OTHER:
      return false;
    default:
      return false;
  }
}
