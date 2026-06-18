import { redirect } from "next/navigation";

export default function WorkstationJobsRedirect() {
  redirect("/workstation?tab=jobs");
}
