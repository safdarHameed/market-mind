import { redirect } from "next/navigation";

// Watchlist now lives as a tab on the home screen.
export default function WatchlistPage() {
  redirect("/discover?tab=watching");
}
