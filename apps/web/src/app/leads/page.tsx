import { redirect } from "next/navigation";

export default function LeadsPage() {
  // Legacy route while users/bookmarks catch up to the Pulse Request domain.
  redirect("/requests");
}
