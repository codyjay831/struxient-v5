import { redirect } from "next/navigation";

export default function LegacyTasksRedirect() {
  redirect("/workstation/tasks");
}
