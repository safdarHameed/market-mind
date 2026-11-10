import { redirect } from "next/navigation";

// Saved now lives as a tab on the home screen.
export default function SavedPage() {
  redirect("/discover?tab=saved");
}
