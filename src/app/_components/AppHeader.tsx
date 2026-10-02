import Link from "next/link";

import { signOut } from "@/auth";

// Green app bar shown at the top of the signed-in pages: the "To Do" title
// (links home), optional page-specific controls (e.g. the create-list form
// on /), and Sign out.
export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="shrink-0 bg-green-600 text-white shadow-md">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            <Link href="/" className="transition-opacity hover:opacity-90">
              To Do
            </Link>
          </h1>
          <SignOutButton className="sm:hidden" />
        </div>
        <div className="flex items-center gap-4">
          {children && <div className="w-full sm:w-96">{children}</div>}
          <SignOutButton className="hidden sm:block" />
        </div>
      </div>
    </header>
  );
}

function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form
      className={className}
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="-m-1 shrink-0 whitespace-nowrap p-1 text-sm text-green-50 underline transition-colors hover:text-white"
      >
        Sign out
      </button>
    </form>
  );
}
