import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Users,
  MessageCircle,
  BarChart3,
  ShieldCheck,
  Check,
  LayoutDashboard,
  Inbox as InboxIcon,
  Target,
  GitBranch,
  CheckSquare,
  Calendar,
  FileBarChart,
  Settings,
  Search,
  Send,
  Smile,
  Paperclip,
  Phone,
} from "lucide-react";
import { ApiError } from "../../utils/apiError.js";
import { useAuthStore } from "../../store/index.js";

const DEMO_LOGINS = [
  { label: "Owner", email: "owner@demo.test" },
  { label: "Admin", email: "admin@demo.test" },
  { label: "Lead", email: "lead@demo.test" },
  { label: "Agent", email: "agent@demo.test" },
];

const DEMO_PASSWORD = "password12345";

const FEATURES = [
  { icon: Users, label: "Team Collaboration" },
  { icon: MessageCircle, label: "Shared Inbox" },
  { icon: BarChart3, label: "Powerful Analytics" },
  { icon: ShieldCheck, label: "Secure & Reliable" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);

  const [workspace, setWorkspace] = useState("demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const isSubmitting = status === "loading";

  async function handleSubmit(event) {
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

  function fillDemoLogin(demoEmail) {
    setWorkspace("demo");
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:flex relative flex-col justify-center gap-8 p-14 bg-[#0b0f14] text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-[#0b0f14] font-bold">
            W
          </div>
          <span className="text-lg font-semibold">
            WhatsApp <span className="text-primary">CRM</span>
          </span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight">
            Manage conversations.
            <br />
            Close more <span className="text-primary">deals</span>.
            <br />
            Delight your <span className="text-primary">customers</span>.
          </h1>
          <p className="mt-4 text-white/60 max-w-sm">
            Turn your WhatsApp account into a shared, structured, and auditable
            workspace for your team.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
            >
              <Icon size={16} className="text-primary" />
              <span className="text-xs text-white/80">{label}</span>
            </div>
          ))}
        </div>

        <div className="relative mt-4 pb-10 pl-6" style={{ perspective: "1800px" }}>
          <div
            className="rounded-2xl border border-white/10 bg-[#0d1117] overflow-hidden"
            style={{
              transform: "rotateX(4deg) rotateY(-9deg) rotateZ(0.5deg)",
              transformStyle: "preserve-3d",
              boxShadow:
                "0 50px 90px -25px rgba(0,0,0,0.65), 0 20px 40px -15px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <span className="h-2 w-2 rounded-full bg-red-400/70" />
              <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
              <span className="h-2 w-2 rounded-full bg-green-400/70" />
            </div>

            <div className="flex h-[300px] text-white">
              <div className="w-32 shrink-0 border-r border-white/10 p-2.5 space-y-0.5">
                <div className="flex items-center gap-1.5 px-1.5 py-1 mb-2">
                  <div className="h-5 w-5 rounded-md bg-primary flex items-center justify-center text-[#0b0f14] font-bold text-[9px] shrink-0">
                    W
                  </div>
                  <span className="text-[10px] font-semibold truncate">WhatsApp CRM</span>
                </div>
                {[
                  { icon: LayoutDashboard, label: "Dashboard" },
                  { icon: InboxIcon, label: "Inbox", active: true, badge: 12 },
                  { icon: Users, label: "Customers" },
                  { icon: Target, label: "Leads" },
                  { icon: GitBranch, label: "Pipeline" },
                  { icon: CheckSquare, label: "Tasks" },
                  { icon: Calendar, label: "Calendar" },
                  { icon: FileBarChart, label: "Reports" },
                  { icon: Settings, label: "Settings" },
                ].map(({ icon: Icon, label, active, badge }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 ${
                      active ? "bg-primary/15 text-primary" : "text-white/50"
                    }`}
                  >
                    <Icon size={11} className="shrink-0" />
                    <span className="text-[9.5px] truncate flex-1">{label}</span>
                    {badge && (
                      <span className="text-[8px] rounded-full bg-primary text-[#0b0f14] font-bold px-1 leading-[13px] shrink-0">
                        {badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="w-40 shrink-0 border-r border-white/10 p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold">Inbox</span>
                </div>
                <div className="rounded-md bg-white/5 flex items-center gap-1.5 px-2 py-1.5 mb-2">
                  <Search size={10} className="text-white/30 shrink-0" />
                  <span className="text-[9px] text-white/30 truncate">Search conversations</span>
                </div>
                <div className="space-y-1">
                  {[
                    { name: "Adam Smith", msg: "Thank you! I will check…", time: "2m", unread: 2, active: true },
                    { name: "Michael Johnson", msg: "Can you please share…", time: "15m", unread: 1 },
                    { name: "Sarah Williams", msg: "That sounds good!", time: "1h" },
                    { name: "David Brown", msg: "Please call me back.", time: "2h" },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 ${c.active ? "bg-white/[0.06]" : ""}`}
                    >
                      <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-medium shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9.5px] font-medium truncate">{c.name}</p>
                        <p className="text-[8.5px] text-white/40 truncate">{c.msg}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[8px] text-white/30">{c.time}</span>
                        {c.unread && (
                          <span className="h-3.5 w-3.5 rounded-full bg-primary text-[#0b0f14] text-[7px] font-bold flex items-center justify-center">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
                  <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-medium shrink-0">
                    A
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium truncate">Adam Smith</p>
                    <p className="text-[8px] text-primary">Online</p>
                  </div>
                </div>
                <div className="flex-1 p-3 space-y-2 overflow-hidden">
                  <div className="max-w-[75%] rounded-lg rounded-tl-sm bg-white/[0.06] px-2.5 py-1.5">
                    <p className="text-[9px] text-white/80">Hi, I'm interested in your services.</p>
                    <p className="text-[7px] text-white/30 mt-0.5">10:30 AM</p>
                  </div>
                  <div className="max-w-[75%] ml-auto rounded-lg rounded-tr-sm bg-primary px-2.5 py-1.5">
                    <p className="text-[9px] text-[#0b0f14] font-medium">Hello Adam! 👋 How can we help you today?</p>
                    <p className="text-[7px] text-[#0b0f14]/60 mt-0.5">10:31 AM ✓✓</p>
                  </div>
                  <div className="max-w-[75%] rounded-lg rounded-tl-sm bg-white/[0.06] px-2.5 py-1.5">
                    <p className="text-[9px] text-white/80">I'd like to know more about your pricing.</p>
                    <p className="text-[7px] text-white/30 mt-0.5">10:32 AM</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
                  <Paperclip size={11} className="text-white/30 shrink-0" />
                  <span className="flex-1 text-[9px] text-white/25">Type a message...</span>
                  <Smile size={11} className="text-white/30 shrink-0" />
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Send size={10} className="text-[#0b0f14]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="absolute -bottom-2 -left-2 h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-2xl"
            style={{ transform: "rotate(-10deg)", boxShadow: "0 20px 35px -10px rgba(37,211,102,0.5)" }}
          >
            <Phone size={26} className="text-[#0b0f14]" />
            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center border-2 border-[#0b0f14]">
              1
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10 bg-[#f4f6f8]">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-black/5 p-8 sm:p-10">
          <div className="flex items-center justify-between mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
              W
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Welcome back! 👋</h2>
          <p className="text-sm text-gray-500 mt-1 mb-6">Sign in to your workspace to continue</p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5" htmlFor="workspace">
                Workspace
              </label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="workspace"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="acme"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 py-2.5 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span
                  onClick={() => setRememberMe((r) => !r)}
                  className={`h-4 w-4 rounded flex items-center justify-center border transition-colors ${
                    rememberMe ? "bg-primary border-primary" : "border-gray-300 bg-white"
                  }`}
                >
                  {rememberMe && <Check size={11} className="text-white" />}
                </span>
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <a href="#" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-white font-semibold py-2.5 text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or continue with</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            disabled
            title="Google sign-in is not available yet"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.48a5.55 5.55 0 0 1-2.4 3.64v3.02h3.88c2.27-2.09 3.56-5.17 3.56-8.84z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.27a12 12 0 0 0 0 10.78l4-3.12z" />
              <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.12C6.22 6.88 8.87 4.77 12 4.77z" />
            </svg>
            Sign in with Google
          </button>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2.5">Demo logins:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => fillDemoLogin(d.email)}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <p className="text-xs font-semibold text-gray-700">{d.label}</p>
                  <p className="text-[10px] text-gray-400 truncate">{d.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
