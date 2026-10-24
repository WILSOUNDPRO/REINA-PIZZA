import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { authConfigured, getAdmin } from "@/server/admin/auth";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { PizzaMark } from "@/components/PizzaMark";

export const metadata: Metadata = { title: "Connexion administrateur", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  if (await getAdmin()) redirect("/admin");
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-5 px-4">
      <div className="flex items-center gap-3"><PizzaMark className="h-12 w-12" /><h1 className="text-3xl font-extrabold">Administration</h1></div>
      {!authConfigured() && <p role="alert" className="rounded-xl bg-tomato p-3 text-sm font-bold text-white">Supabase Auth n'est pas configuré (SUPABASE_URL, SUPABASE_ANON_KEY). Connexion impossible.</p>}
      {sp.err && <p role="alert" className="rounded-xl bg-tomato p-3 font-bold text-white">{sp.err}</p>}
      <form action={loginAction} className="card space-y-4 p-5">
        <div><label htmlFor="email" className="mb-1 block text-sm font-bold">E-mail</label><input id="email" name="email" type="email" required autoComplete="username" className="field" /></div>
        <div><label htmlFor="password" className="mb-1 block text-sm font-bold">Mot de passe</label><input id="password" name="password" type="password" required autoComplete="current-password" className="field" /></div>
        <SubmitButton className="btn btn-primary btn-lg">Se connecter</SubmitButton>
      </form>
    </main>
  );
}
