import { redirect } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { destroyUserSession } from "~/services/auth/session.server";
import { logActivity, getUser } from "~/services/auth/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const user = await getUser(request);
  
  if (user) {
    // Log logout activity
    await logActivity(
      user.id,
      "user.logout",
      "user",
      user.id,
      {},
      request
    );
  }
  
  // Destroy session
  const headers = await destroyUserSession(request);
  
  return redirect("/", { headers });
}

export async function loader() {
  return redirect("/");
}