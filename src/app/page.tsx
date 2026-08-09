import { redirect } from "next/navigation";

/**
 * The app has no marketing home page — `/` is the dashboard.
 *
 * Signed-out visitors land on `/dashboard`, whose own session check bounces
 * them to `/login`, so this needs no auth logic of its own.
 */
export default function Home() {
  redirect("/dashboard");
}
