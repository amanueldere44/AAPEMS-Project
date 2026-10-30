
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  ShieldCheck,
  UsersRound,
  UserRoundCheck,
  X,
  Archive,
  FileCheck2,
  Globe,
  Facebook,
  Instagram,
  Linkedin,
  Send,
  ExternalLink,
  Workflow,
  FileText,
  LockKeyhole,
  ArrowUpRight,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';

const highlights = [
  {
    icon: ClipboardCheck,
    title: 'Structured evaluation workflows',
    description:
      'Coordinate evaluation cycles, forms, assignments, and reviews in one organized process.',
  },
  {
    icon: BarChart3,
    title: 'Centralized performance reporting',
    description:
      'Follow progress and access authorized reports from a shared workspace.',
  },
  {
    icon: UsersRound,
    title: 'Role-based university access',
    description:
      'Provide staff with the pages and activities permitted by their assigned roles.',
  },
];

const evaluationSteps = [
  {
    number: '01',
    icon: ClipboardCheck,
    title: 'Prepare the cycle',
    description:
      'Set up the evaluation period and publish the approved form for the relevant evaluation type.',
  },
  {
    number: '02',
    icon: UsersRound,
    title: 'Assign participants',
    description:
      'Connect evaluators and staff members to the appropriate evaluation activities.',
  },
  {
    number: '03',
    icon: CheckCircle2,
    title: 'Complete and review',
    description:
      'Track assigned work as evaluations are completed and submitted for review.',
  },
  {
    number: '04',
    icon: BarChart3,
    title: 'Review outcomes',
    description:
      'Use authorized results and reports to support accountable follow-up.',
  },
];

const officialLinks = [
  {
    label: 'Ambo University website',
    href: 'https://ambou.edu.et/',
    icon: Globe,
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/AmboUniversityofficial',
    icon: Facebook,
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/p/Cu4fFKgKYnm/',
    icon: Instagram,
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/ambo-university',
    icon: Linkedin,
  },
  {
    label: 'Telegram',
    href: 'https://t.me/ambouniversityofficial',
    icon: Send,
  },
];

const accessRoles = [
  {
    title: 'Administrator',
    role: 'admin',
    description:
      'Manage user accounts, roles, evaluation setup, and authorized system administration.',
    icon: ShieldCheck,
  },
  {
    title: 'Students',
    role: 'student',
    description: 'Access student evaluation activities and assigned tasks.',
    icon: BookOpen,
  },
  {
    title: 'Department Head',
    role: 'department_head',
    description: 'Manage department evaluation and review activities.',
    icon: UserRoundCheck,
  },
  {
    title: 'Peer Instructors',
    role: 'teacher',
    description: 'Complete peer evaluation assignments.',
    icon: UsersRound,
  },
  {
    title: 'Instructor (Self-Evaluator)',
    role: 'teacher',
    description: 'Complete self-evaluation and view permitted results.',
    icon: GraduationCap,
  },
  {
    title: 'Ad-hoc Evaluation Committee / Officially Delegated Body',
    role: 'committee',
    description: 'Coordinate committee-based evaluation and review.',
    icon: ClipboardCheck,
  },
  {
    title: 'College / School / Institute Administration',
    role: 'management',
    description: 'Support academic unit evaluation administration.',
    icon: Building2,
  },
  {
    title: 'College / School Dean / Vice Dean',
    role: 'dean',
    description: 'Review leadership evaluations and unit performance.',
    icon: Landmark,
  },
  {
    title:
      'Academic Affairs Vice President / Academic Affairs Vice Director',
    role: 'academic_vp',
    description: 'Oversee academic evaluation workflows and reports.',
    icon: BriefcaseBusiness,
  },
  {
    title:
      "Academic Affairs Vice President's Office / Campus Academic Vice Director",
    role: 'academic_vp',
    description: 'Coordinate academic affairs evaluation activities.',
    icon: FileCheck2,
  },
  {
    title: 'University / Department Archives',
    role: 'archives',
    description: 'Access authorized evaluation records and archives.',
    icon: Archive,
  },
  {
    title: 'Concerned Offices and Directorates',
    role: 'concerned_office',
    description: 'Receive and follow up performance improvement referrals.',
    icon: ShieldCheck,
  },
];

export default function LandingPage() {
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('home');
  const navigate = useNavigate();

  function chooseRole(role) {
    setRolePickerOpen(false);
    navigate('/login', {
      state: {
        selectedRole: role.title,
        expectedRole: role.role,
      },
    });
  }

  function openRolePicker() {
    setRolePickerOpen(true);
  }

  return (
    <main className="asems-landing min-h-screen bg-slate-50 text-slate-900">
      <div className="asems-public-shell sticky top-0 z-50 border-b border-[#6b6258] bg-[#1b1e27] text-white shadow-lg">
        <header className="asems-public-header flex min-h-[104px] items-center justify-between gap-4 border-b border-white/[0.025] px-5 py-4 sm:px-8 lg:px-12">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3"
            aria-label="ASEMS home"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-white">
              <img
                src="/mylogo.png"
                alt="Ambo University Logo"
                className="h-14 w-14 rounded-full object-cover"
              />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-extrabold tracking-[0.28em] text-white">
                AAPEMS
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                Ambo University
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-5 sm:gap-8">
            <ThemeToggle />
            <button
              type="button"
              onClick={openRolePicker}
              className="rounded-md px-1 py-2 text-base font-semibold text-[#e7e1da] transition hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-lg"
            >
              Login
            </button>
          </div>
        </header>

        <nav
          className="asems-public-subbar flex min-h-[76px] items-center justify-center gap-8 border-b border-white/5 px-4 sm:gap-14"
          aria-label="Main navigation"
        >
          <button
            type="button"
            onClick={() => {
              setActiveNav('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeNav === 'home' ? 'page' : undefined}
            className={`asems-landing-nav-link relative flex min-h-[76px] items-center px-3 text-base font-medium transition sm:px-5 ${
              activeNav === 'home' ? 'is-active' : ''
            }`}
          >
            Home
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveNav('evaluation');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeNav === 'evaluation' ? 'page' : undefined}
            className={`asems-landing-nav-link relative flex min-h-[76px] items-center gap-3 px-3 text-base font-medium transition sm:px-5 ${
              activeNav === 'evaluation' ? 'is-active' : ''
            }`}
          >
            <GraduationCap
              size={22}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Evaluation
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveNav('reports');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-current={activeNav === 'reports' ? 'page' : undefined}
            className={`asems-landing-nav-link relative flex min-h-[76px] items-center px-3 text-base font-medium transition sm:px-5 ${
              activeNav === 'reports' ? 'is-active' : ''
            }`}
          >
            Reports &amp; Workflow
          </button>
        </nav>
      </div>

      {activeNav === 'home' && (
        <section
          id="home"
          className="asems-landing-hero relative isolate overflow-hidden px-5 py-16 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="absolute -left-32 -top-28 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl" />
            <div className="absolute -right-20 top-20 h-[30rem] w-[30rem] rounded-full bg-sky-200/30 blur-3xl" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="asems-landing-pill inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Academic and Administrative Staff Evaluation
              </div>

              <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-700">
                Excellence through accountability
              </p>

              <h1 className="asems-landing-heading mt-4 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Supporting excellence through{' '}
                <span className="text-emerald-500">evaluation.</span>
              </h1>

              <p className="asems-landing-copy mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                AAPEMS brings academic and administrative staff evaluation
                activities together in one secure workspace—from evaluation
                cycles and assignments to progress monitoring and authorized
                reporting.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveNav('evaluation')}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  Explore evaluation
                  <ArrowRight size={17} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveNav('reports')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  Reports &amp; workflow
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="asems-landing-copy inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                  <ShieldCheck
                    size={17}
                    className="text-emerald-600"
                    aria-hidden="true"
                  />
                  Secure, role-based access
                </span>

                <span className="asems-landing-copy inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                  <LockKeyhole
                    size={16}
                    className="text-emerald-600"
                    aria-hidden="true"
                  />
                  Authorized information
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div
                aria-hidden="true"
                className="absolute inset-5 rounded-[2rem] bg-emerald-200/40 blur-2xl"
              />

              <div className="asems-landing-preview relative rounded-[2rem] border border-white bg-white/90 p-5 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.3)] backdrop-blur sm:p-7">
                <div className="asems-landing-preview-top flex items-center justify-between border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-emerald-700">
                      <img
                        src="/mylogo.png"
                        alt="Ambo University Logo"
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    </span>
                    <div>
                      <p className="asems-landing-heading font-bold text-slate-900">
                        AAPEMS workspace
                      </p>
                      <p className="asems-landing-copy mt-1 text-xs text-slate-500">
                        Evaluation overview
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    Organized
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-5">
                  <div className="asems-landing-tile rounded-2xl bg-slate-50 p-4">
                    <p className="asems-landing-copy text-xs font-medium text-slate-500">
                      Evaluation cycles
                    </p>
                    <div className="asems-landing-heading mt-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <ClipboardCheck size={17} className="text-emerald-600" />
                      Structured
                    </div>
                  </div>

                  <div className="asems-landing-tile rounded-2xl bg-slate-50 p-4">
                    <p className="asems-landing-copy text-xs font-medium text-slate-500">
                      Progress reporting
                    </p>
                    <div className="asems-landing-heading mt-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                      <BarChart3 size={17} className="text-sky-600" />
                      Centralized
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    'Evaluation setup and assignments',
                    'Staff performance review',
                    'Authorized reports and records',
                  ].map((item) => (
                    <div
                      key={item}
                      className="asems-landing-row flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                    >
                      <CheckCircle2
                        size={17}
                        className="shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-7xl gap-3 border-t border-slate-200/80 pt-7 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Workflow size={20} />
              </span>
              <div>
                <p className="asems-landing-heading text-sm font-bold">
                  Connected workflows
                </p>
                <p className="asems-landing-copy mt-1 text-xs text-slate-500">
                  From setup through review
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <UsersRound size={20} />
              </span>
              <div>
                <p className="asems-landing-heading text-sm font-bold">
                  Role-aware workspace
                </p>
                <p className="asems-landing-copy mt-1 text-xs text-slate-500">
                  Tasks aligned to responsibilities
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <FileText size={20} />
              </span>
              <div>
                <p className="asems-landing-heading text-sm font-bold">
                  Authorized reporting
                </p>
                <p className="asems-landing-copy mt-1 text-xs text-slate-500">
                  Information based on permissions
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeNav === 'evaluation' && (
        <section
          id="evaluation"
          className="asems-landing-features border-t border-slate-200 bg-white px-5 py-14 sm:px-8 lg:px-12 lg:py-16"
        >
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">
                  Evaluation management
                </p>
                <h2 className="asems-landing-heading mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                  A consistent process for every evaluation cycle
                </h2>
                <p className="asems-landing-copy mt-4 max-w-2xl leading-7 text-slate-600">
                  Bring preparation, assignments, submissions, and review into
                  a clear sequence while keeping access aligned with each
                  person’s responsibilities.
                </p>
              </div>
            </div>

            <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {evaluationSteps.map(
                ({ number, icon: Icon, title, description }) => (
                  <article
                    key={number}
                    className="asems-landing-feature-card group rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold tracking-[0.18em] text-emerald-700">
                        STEP {number}
                      </span>
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="asems-landing-heading mt-5 text-base font-bold text-slate-900">
                      {title}
                    </h3>
                    <p className="asems-landing-copy mt-2 text-sm leading-6 text-slate-600">
                      {description}
                    </p>
                  </article>
                ),
              )}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {highlights.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="asems-landing-feature-card flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="asems-landing-heading text-sm font-bold text-slate-900">
                      {title}
                    </h3>
                    <p className="asems-landing-copy mt-2 text-sm leading-6 text-slate-600">
                      {description}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <p className="asems-landing-copy mt-6 text-xs leading-5 text-slate-500">
              Available activities and information depend on the evaluation
              cycle, published forms, and permissions assigned to your account.
            </p>
          </div>
        </section>
      )}

      {activeNav === 'reports' && (
        <section
          id="reports"
          className="asems-landing-features border-t border-slate-200 bg-slate-50 px-5 py-14 sm:px-8 lg:px-12 lg:py-16"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">
                Reports &amp; workflow
              </p>
              <h2 className="asems-landing-heading mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Clear visibility from assignment to outcome
              </h2>
              <p className="asems-landing-copy mt-4 leading-7 text-slate-600">
                Follow the evaluation lifecycle, understand where work stands,
                and use approved reports to support transparent and responsible
                decisions.
              </p>
            </div>

            <div className="mt-9 grid gap-5 lg:grid-cols-3">
              <article className="asems-landing-feature-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Workflow size={23} aria-hidden="true" />
                </span>
                <h3 className="asems-landing-heading mt-5 text-lg font-bold text-slate-900">
                  Workflow coordination
                </h3>
                <p className="asems-landing-copy mt-2 text-sm leading-6 text-slate-600">
                  Organize cycles, assignments, submissions, reviews, and
                  follow-up in a defined process.
                </p>
                <ul className="asems-landing-copy mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Monitor task status
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Support review hand-offs
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Keep activities organized
                  </li>
                </ul>
              </article>

              <article className="asems-landing-feature-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <BarChart3 size={23} aria-hidden="true" />
                </span>
                <h3 className="asems-landing-heading mt-5 text-lg font-bold text-slate-900">
                  Performance reporting
                </h3>
                <p className="asems-landing-copy mt-2 text-sm leading-6 text-slate-600">
                  Make authorized evaluation information easier to review and
                  use for appropriate follow-up.
                </p>
                <ul className="asems-landing-copy mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Review permitted results
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Support progress discussions
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Inform improvement planning
                  </li>
                </ul>
              </article>

              <article className="asems-landing-feature-card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <ShieldCheck size={23} aria-hidden="true" />
                </span>
                <h3 className="asems-landing-heading mt-5 text-lg font-bold text-slate-900">
                  Records and accountability
                </h3>
                <p className="asems-landing-copy mt-2 text-sm leading-6 text-slate-600">
                  Keep evaluation information within the system’s role-based
                  access and review structure.
                </p>
                <ul className="asems-landing-copy mt-4 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Permission-aware access
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Structured record review
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Responsible information use
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>
      )}

      <footer className="asems-landing-footer border-t border-slate-200 bg-slate-50 px-5 py-9 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_1fr] md:items-start">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-emerald-700">
                <img
                  src="/mylogo.png"
                  alt="Ambo University Logo"
                  className="h-11 w-11 rounded-full object-cover"
                />
              </span>
              <div>
                <p className="asems-landing-heading font-extrabold tracking-wide text-slate-900">
                  AAPEMS
                </p>
                <p className="asems-landing-copy mt-0.5 text-xs text-slate-500">
                  Ambo University
                </p>
              </div>
            </div>

            <p className="asems-landing-copy mt-4 max-w-lg text-sm leading-6 text-slate-500">
              Academic and Administrative Staff Evaluation Management System.
              A role-based workspace for evaluation activities, workflow
              coordination, and authorized reporting.
            </p>

            <a
              href="https://ambou.edu.et/"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
            >
              Visit Ambo University
              <ExternalLink size={15} />
            </a>
          </div>

          <div>
            <h2 className="asems-landing-heading text-sm font-bold text-slate-900">
              Connect with Ambo University
            </h2>
            <p className="asems-landing-copy mt-2 text-xs leading-5 text-slate-500">
              Official university channels and website.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {officialLinks.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  title={label}
                  className="asems-landing-social inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  <Icon size={19} strokeWidth={2} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} AAPEMS · Ambo University</span>
          <span>
            Academic and Administrative Staff Evaluation Management System
          </span>
        </div>
      </footer>

      {rolePickerOpen && (
        <div
          className="asems-role-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRolePickerOpen(false);
            }
          }}
        >
          <section
            className="asems-role-modal flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-picker-title"
          >
            <header className="flex items-start justify-between gap-4 bg-emerald-600 px-6 py-5 text-white sm:px-8 sm:py-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">
                  Ambo University · AAPEMS
                </p>
                <h2
                  id="role-picker-title"
                  className="mt-2 text-2xl font-extrabold sm:text-3xl"
                >
                  Choose your access category
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-emerald-50">
                  Select the role that best describes your university
                  responsibilities to continue to sign in.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRolePickerOpen(false)}
                className="rounded-lg p-2 text-white/90 transition hover:bg-white/15"
                aria-label="Close role selection"
              >
                <X size={22} />
              </button>
            </header>

            <div className="asems-role-modal-body overflow-y-auto p-5 sm:p-7">
              <div className="mb-5">
                <h3 className="asems-role-modal-title text-center text-xl font-bold sm:text-2xl">
                  How will you use AAPEMS?
                </h3>
                <p className="asems-role-modal-copy mt-2 text-center text-sm">
                  Choose a category to continue to the login page.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {accessRoles.map(({ title, description, icon: Icon }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() =>
                      chooseRole({
                        title,
                        role: accessRoles.find(
                          (item) => item.title === title,
                        )?.role,
                      })
                    }
                    className="asems-role-option group flex min-h-[118px] items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-5"
                  >
                    <span className="asems-role-option-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition group-hover:bg-emerald-200">
                      <Icon size={24} aria-hidden="true" />
                    </span>

                    <span className="min-w-0">
                      <span className="asems-role-option-title block text-sm font-bold text-slate-900 sm:text-base">
                        {title}
                      </span>
                      <span className="asems-role-option-copy mt-1.5 block text-xs leading-5 text-slate-600 sm:text-sm">
                        {description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <footer className="asems-role-modal-footer border-t border-slate-200 px-5 py-3 text-center text-xs text-slate-500 sm:px-7">
              Your account permissions are determined by your authorized
              university account.
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
