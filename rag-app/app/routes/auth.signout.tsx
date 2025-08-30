import type { ActionFunctionArgs } from "@remix-run/node";
import { signOut } from "~/services/auth/production-auth.server";

export async function action({ request }: ActionFunctionArgs) {
  return signOut(request);
}

export async function loader({ request }: ActionFunctionArgs) {
  return signOut(request);
}