import { redirect } from "next/navigation";

export default async function SalesRedirectPage() {
  redirect("/leads");
}
