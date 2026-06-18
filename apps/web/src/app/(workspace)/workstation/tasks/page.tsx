import { redirect } from "next/navigation";

export default function WorkstationTasksRedirect() {
  redirect("/workstation?tab=tasks");
}
