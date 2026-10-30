
import { useState } from 'react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { getAssetUrl } from '../services/api.js';
import { NavLink, Outlet } from 'react-router-dom';
import { LanguageSwitcher } from '../i18n/LanguageLayer.jsx';
import {
  BookOpen,
  Building2,
  CalendarDays,
  Archive,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Share2,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

const adminGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'ORGANIZATION',
    items: [
      { label: 'Users & roles', to: '/users', icon: Users },
      { label: 'Departments', to: '/departments', icon: Building2 },
      { label: 'Academic units', to: '/academic-units', icon: GraduationCap },
      { label: 'Courses & instructors', to: '/academic', icon: BookOpen },
    ],
  },
  {
    label: 'EVALUATIONS',
    items: [
      { label: 'Evaluation cycles', to: '/cycles', icon: CalendarDays },
      { label: 'Official forms', to: '/forms', icon: ClipboardList },
    ],
  },
  {
    label: 'WORKFLOW',
    items: [
      { label: 'Leadership evaluations', to: '/leadership', icon: UserCheck },
      { label: 'Performance improvement', to: '/improvement', icon: Share2 },
      { label: 'Evaluation archives', to: '/archive', icon: Archive },
    ],
  },
  {
    label: 'REPORTING',
    items: [
      { label: 'Audit trail', to: '/audit', icon: ShieldCheck },
    ],
  },
];

const evaluationGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'MY WORK',
    items: [{ label: 'My evaluations', to: '/my-evaluations', icon: FileText }],
  },
];

const instructorGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'MY WORK',
    items: [
      { label: 'My Evaluations', to: '/my-evaluations', icon: FileText },
      {
        label: 'My Results',
        to: '/my-results',
        icon: ChartNoAxesCombined,
      },
    ],
  },
];

const managementGroups = [
  {
    label: 'OVERVIEW',
    items: [
      {
        label: 'Dashboard',
        to: '/',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'EVALUATION',
    items: [
      {
        label: 'My evaluations',
        to: '/my-evaluations',
        icon: FileText,
      },
      {
        label: 'Reports & workflow',
        to: '/reports',
        icon: ChartNoAxesCombined,
      },
      {
        label: 'Final Evaluation Report',
        to: '/final-report',
        icon: FileText,
      },
    ],
  },
];



// Evaluations a dean (of a department head) or an Academic Affairs VP (of a dean) fills in.
const leadershipEvaluatorGroup = {
  label: 'LEADERSHIP EVALUATION',
  items: [
    { label: 'Leadership evaluations', to: '/leadership', icon: UserCheck },
  ],
};

const academicVpGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'REPORTING',
    items: [{ label: 'Reports & workflow', to: '/reports', icon: ChartNoAxesCombined }],
  },
  leadershipEvaluatorGroup,
];

// Committee members and department heads assign evaluators for their own department (enforced by the API).
const participationGroup = {
  label: 'PARTICIPATION',
  items: [
    { label: 'Evaluation tasks', to: '/tasks', icon: ClipboardCheck },
  ],
};

// Referrals of performance gaps to concerned offices (committee, department heads, deans).
const improvementGroup = {
  label: 'IMPROVEMENT',
  items: [
    { label: 'Performance improvement', to: '/improvement', icon: Share2 },
  ],
};

const archivesGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'ARCHIVE',
    items: [{ label: 'Evaluation archives', to: '/archive', icon: Archive }],
  },
];

const concernedOfficeGroups = [
  {
    label: 'OVERVIEW',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    label: 'SUPPORT PLANNING',
    items: [{ label: 'My referrals', to: '/improvement', icon: Share2 }],
  },
];

function getInitials(user) {
  const name = user?.name?.trim();

  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  return user?.email?.[0]?.toUpperCase() || 'U';
}

function formatRole(role) {
  if (!role) return 'Account';

  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getNavigationGroups(role) {
  switch (role) {
    case 'admin':
      return adminGroups;

    case 'teacher':
      return instructorGroups;

    case 'dean':
      return [...managementGroups, leadershipEvaluatorGroup, improvementGroup];

    case 'academic_vp':
      return academicVpGroups;

    case 'archives':
      return archivesGroups;

    case 'concerned_office':
      return concernedOfficeGroups;

    case 'committee':
      return [...managementGroups, participationGroup, improvementGroup];

    case 'department_head':
      return [...managementGroups, participationGroup, improvementGroup];

    case 'management':
      return managementGroups;

    case 'student':
    default:
      return evaluationGroups;
  }
}

export default function AppLayout({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigationGroups = getNavigationGroups(user?.role);

  function closeMenus() {
    setMobileOpen(false);
    setProfileOpen(false);
  }

  function handleLogout() {
    closeMenus();
    onLogout?.();
  }

  return (
    <div className="asems-app-shell min-h-screen bg-slate-50 text-slate-900">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`asems-sidebar fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-navy-950 text-white transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[78px] shrink-0 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20">
            <img
              src="/mylogo.png"
              alt="Ambo University Logo"
              className="h-full w-full rounded-full object-contain"
            />
          </div>

          <div>
            <div className="text-lg font-semibold tracking-wide">AAPEMS</div>
            <div className="text-[11px] text-slate-300">
              AMBO UNIVERSITY
            </div>
          </div>

          <button
            type="button"
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav
          className="scrollbar-thin flex-1 space-y-7 overflow-y-auto px-3 py-6"
          aria-label="Main navigation"
        >
          {navigationGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-400">
                {group.label}
              </h2>

              <div className="space-y-1">
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${
                        isActive
                          ? 'bg-white/10 font-semibold text-white before:absolute before:left-0 before:h-7 before:w-1 before:rounded-r before:bg-gold-400'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-4">
          <NavLink
            to="/settings"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Settings size={17} />
            Settings
          </NavLink>

          <div className="mt-3 rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              AAPEMS workspace
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              Academic evaluation and reporting
            </p>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[264px]">
        <header className="asems-header sticky top-0 z-20 flex h-[78px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="icon-button lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>

            <div className="hidden text-sm text-slate-500 sm:block">
              Academic Affairs
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-800">Workspace</span>
            </div>

            <div className="text-sm font-semibold sm:hidden">AAPEMS</div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            <ThemeToggle />
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium text-slate-500">
                Signed in as
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {formatRole(user?.role)}
              </p>
            </div>

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-label="Open user menu"
                className="flex max-w-[220px] items-center gap-2 rounded-lg p-1.5 transition hover:bg-slate-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-sm font-semibold text-white">
                  {user?.profilePhoto ? (
                    <img
                      src={getAssetUrl(user.profilePhoto)}
                      alt={`${user?.name || 'User'} profile`}
                      className="h-full w-full object-cover"
                    />
                  ) : getInitials(user)}
                </span>

                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-36 truncate text-xs font-semibold text-slate-800">
                    {user?.name || 'ASEMS User'}
                  </span>
                  <span className="block max-w-36 truncate text-[11px] text-slate-500">
                    {formatRole(user?.role)}
                  </span>
                </span>

                <ChevronDown
                  size={14}
                  className={`hidden shrink-0 text-slate-400 transition sm:block ${
                    profileOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {profileOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close user menu"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setProfileOpen(false)}
                  />

                  <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                    <div className="border-b border-slate-100 px-3 py-3">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user?.name || 'ASEMS User'}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {user?.email || ''}
                      </p>
                      <p className="mt-2 text-xs font-medium text-slate-600">
                        {formatRole(user?.role)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="asems-main mx-auto max-w-[1600px] p-4 sm:p-7 lg:p-8">
          <Outlet />
        </main>

        <footer className="asems-footer border-t border-slate-200 px-7 py-4 text-center text-xs text-slate-400">
          AAPEMS · Ambo University
        </footer>
      </div>
    </div>
  );
}
