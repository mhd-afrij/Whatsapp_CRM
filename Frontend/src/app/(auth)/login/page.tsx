"use client";

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, MessageCircleMore, MessagesSquare, ArrowRight, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api-error";
import { useAuthStore } from "@/stores/auth-store";
import { AuroraBackground } from "@/components/ui/aurora-background";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);

  const [workspace, setWorkspace] = useState("demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isSubmitting = status === "loading";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await login(workspace, email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <div className="relative flex min-h-screen bg-background text-text-primary">
      <AuroraBackground className="absolute inset-0 min-h-screen bg-background" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1440px] items-center justify-center px-4 py-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-0 lg:px-0">

        {/* Left — Branding */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="hidden flex-col items-center justify-center px-14 lg:flex"
        >
          <div className="relative flex h-[380px] w-[320px] items-center justify-center">
            <div className="absolute inset-0 rounded-[72px] border border-white/[0.06] bg-white/[0.03] backdrop-blur-md" />
            <div className="absolute left-6 top-10 h-28 w-28 rounded-full border border-white/[0.06] bg-white/[0.02]" />
            <div className="absolute right-6 bottom-10 h-24 w-24 rounded-full border border-white/[0.06] bg-white/[0.02]" />
            <div className="absolute inset-12 rounded-[48px] border border-white/[0.05] bg-white/[0.03]" />

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div className="absolute -inset-8 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-white/10 bg-surface-raised shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                  <MessageCircleMore className="h-14 w-14 text-primary" />
                </div>
                <div className="absolute -right-7 -bottom-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/10 bg-primary shadow-[0_16px_40px_rgba(37,211,102,0.25)]">
                  <MessagesSquare className="h-8 w-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 max-w-md text-center">
            <h2 className="text-3xl font-bold tracking-tight text-text-primary">
              Shared inbox, smoother team handoff
            </h2>
            <p className="mt-3 text-base leading-relaxed text-text-secondary">
              Keep chats organized, route conversations, and manage customers from a clean workspace built around WhatsApp.
            </p>
          </div>

          <div className="mt-8 flex items-center gap-6 text-sm text-text-muted">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              End-to-end encrypted
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              SOC 2 compliant
            </div>
          </div>
        </motion.div>

        {/* Right — Login Form */}
        <div className="flex w-full items-center justify-center lg:h-screen lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full max-w-[440px]"
          >
            {/* Logo */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="mb-10 flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-raised shadow-[0_8px_32px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.06]">
                <MessageCircleMore className="h-6 w-6 text-primary" />
              </div>
              <p className="text-[26px] font-extrabold tracking-tight text-text-primary">
                WhatsApp <span className="text-primary">CRM</span>
              </p>
            </motion.div>

            {/* Heading */}
            <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
              <h1 className="text-[32px] font-bold tracking-tight text-text-primary">Welcome back</h1>
              <p className="mt-2 text-[15px] text-text-secondary">Sign in to your workspace</p>
            </motion.div>

            {/* Form Card */}
            <motion.form
              custom={2}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="rounded-3xl border border-white/[0.06] bg-surface/80 p-7 shadow-[0_32px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
            >
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-5 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary" htmlFor="workspace">
                  Workspace
                </label>
                <input
                  id="workspace"
                  name="workspace"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-surface-raised px-4 text-[15px] text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="demo"
                  required
                />
              </div>

              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium text-text-secondary" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-surface-raised px-4 text-[15px] text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium text-text-secondary" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full rounded-xl border border-border bg-surface-raised px-4 pr-12 text-[15px] text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
                    placeholder="••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-text-muted transition hover:text-text-primary"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-text-muted select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border bg-surface-raised text-primary accent-primary focus:ring-primary/20"
                  />
                  Remember me
                </label>
                <a href="#" className="font-medium text-primary transition hover:text-primary-hover">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-success text-[15px] font-semibold text-white shadow-[0_16px_40px_rgba(37,211,102,0.25)] transition-all hover:shadow-[0_20px_50px_rgba(37,211,102,0.35)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </motion.form>

            <motion.p
              custom={3}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="mt-6 text-center text-sm text-text-muted"
            >
              Don&apos;t have an account?{" "}
              <a href="#" className="font-semibold text-primary transition hover:text-primary-hover">
                Get started
              </a>
            </motion.p>

            <motion.div
              custom={4}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="mt-5 flex items-center justify-center gap-3 text-xs text-text-muted"
            >
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-primary/60" />
                Demo workspace
              </div>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-primary/60" />
                password: password12345
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
