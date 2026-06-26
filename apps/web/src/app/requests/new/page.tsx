import { redirect } from "next/navigation";

export default function NewRequestPage() {
  // Preserve bookmarks and old links while routing users into the new queue
  // modal experience.
  redirect("/requests?new=1");
}
