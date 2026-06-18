import { redirect } from "next/navigation";

export default function WorkstationScheduleRedirect() {
  redirect("/workstation?tab=calendar");
}
