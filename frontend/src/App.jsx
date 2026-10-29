import { useEffect, useState } from 'react';
import {
  Navigate,
  Route,
  useLocation,
  Routes,
  useNavigate,
} from 'react-router-dom';

import AppLayout from './layouts/AppLayout.jsx';

import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import CyclesPage from './pages/CyclesPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import MyEvaluationsPage from './pages/MyEvaluationsPage.jsx';
import MyResultsPage from './pages/MyResultsPage.jsx';
import ReportsWorkflowPage from './pages/ReportsWorkflowPage.jsx';
import FinalEvaluationReportPage from './pages/FinalEvaluationReportPage.jsx';
import LeadershipFormsPage from './pages/LeadershipFormsPage.jsx';
import LeadershipAssignmentsPage from './pages/LeadershipAssignmentsPage.jsx';
import LeadershipEvaluationsPage from './pages/LeadershipEvaluationsPage.jsx';
import DepartmentsPage from './pages/DepartmentsPage.jsx';
import AcademicUnitsPage from './pages/AcademicUnitsPage.jsx';
import LeadershipHubPage from './pages/LeadershipHubPage.jsx';

import ImprovementPage from './pages/ImprovementPage.jsx';


import OfficesPage from './pages/OfficesPage.jsx';
import ReferralsPage from './pages/ReferralsPage.jsx';
import ArchivePage from './pages/ArchivePage.jsx';
import AuditTrailPage from './pages/AuditTrailPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import FormsPage from './pages/FormsPage.jsx';
import CoursesPage from './pages/CoursesPage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';

import {
  clearToken,
  getCurrentUser,
  getToken,
} from './services/api.js';

/**
 * Pages that have not yet been implemented.
 * Replace these placeholders when their real page components exist.
 */
const placeholderPages = [
  {
    path: 'dashboard',
    title: 'Dashboard',
    description: 'System overview.',
  },
  {
    path: 'reports',
    title: 'Reports',
    description: 'View reports.',
  },
];
  
  


/**
 * All implemented pages.
 * Keep these paths consistent with AppLayout navigation links.
 */
const implementedPages = {
  users: UsersPage,
  cycles: CyclesPage,
  tasks: TasksPage,
  'my-evaluations': MyEvaluationsPage,
  'my-results': MyResultsPage,
  reports: ReportsWorkflowPage,
  'final-report': FinalEvaluationReportPage,
  departments: DepartmentsPage,
  'academic-units': AcademicUnitsPage,
  leadership: LeadershipHubPage,

   improvement: ImprovementPage,
  'leadership-forms': LeadershipFormsPage,
  'leadership-assignments': LeadershipAssignmentsPage,
  'leadership-evaluations': LeadershipEvaluationsPage,
  offices: OfficesPage,
  referrals: ReferralsPage,
  archive: ArchivePage,
  audit: AuditTrailPage,
  settings: SettingsPage,
     forms: FormsPage,
       academic: CoursesPage,
};

function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900"
          aria-hidden="true"
        />
        Checking your session…
      </div>
    </div>
  );
}

function ProtectedWorkspace({ user, loading, onLogout }) {
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    return <Navigate to="/login" replace />;
  }

  return <AppLayout user={user} onLogout={onLogout} />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!getToken()) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const result = await getCurrentUser();

        if (!active) {
          return;
        }

        // Supports the API response shape used by this project.
        const currentUser =
          result?.data?.user ??
          result?.user ??
          null;

        setUser(currentUser);

        // A token without a valid user is not a valid restored session.
        if (!currentUser) {
          clearToken();
        }
      } catch {
        clearToken();

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  function handleLogin(authenticatedUser) {
    if (!authenticatedUser) {
      return;
    }

    setUser(authenticatedUser);
    setLoading(false);
    navigate('/', { replace: true });
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    setLoading(false);
    navigate('/login', { replace: true });
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <LoadingScreen />
          ) : user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage
              user={user}
              onLogin={handleLogin}
            />
          )
        }
      />

      <Route
        element={
          <ProtectedWorkspace
            user={user}
            loading={loading}
            onLogout={handleLogout}
          />
        }
      >

<Route index element={<DashboardPage user={user} />} />

        {Object.entries(implementedPages).map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={<Page user={user} />}
          />
        ))}

        {placeholderPages.map((page) => (
          <Route
            key={page.path}
            path={page.path}
            element={
              <PlaceholderPage
                title={page.title}
                description={page.description}
              />
            }
          />
        ))}

        <Route
          path="*"
          element={
            <PlaceholderPage
              title="Page not found"
              description="The requested page does not exist in this workspace."
            />
          }
        />
      </Route>
    </Routes>
  );
}