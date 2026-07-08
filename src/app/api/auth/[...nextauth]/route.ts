import { handlers } from "@/auth";

// Standard next-auth route handler — delegates all /api/auth/* traffic
// (session, csrf, signin, signout, callback/credentials, etc.) to next-auth
// itself. No custom logic belongs here.
export const { GET, POST } = handlers;
