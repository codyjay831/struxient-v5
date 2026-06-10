import { JobScheduleEventStatus } from "@prisma/client";

/** Notification intent is decoupled from schedule lifecycle (canon § notifications). */
export function shouldNotifyCustomerOnEventConfirm(_input: {
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
}): boolean {
  return _input.notifyCustomerRequested;
}

export function shouldNotifyCustomerOnEventCancel(_input: {
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
}): boolean {
  return _input.notifyCustomerRequested;
}

export function shouldNotifyCustomerOnEventReschedule(_input: {
  status: JobScheduleEventStatus;
  notifyCustomerRequested: boolean;
}): boolean {
  return _input.notifyCustomerRequested;
}

/** Tentative events never auto-notify customers by default. */
export function defaultNotifyCustomerForStatus(status: JobScheduleEventStatus): boolean {
  return status === JobScheduleEventStatus.CONFIRMED;
}
