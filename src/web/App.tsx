// App shell: header, skip link, routing and sign-in gate.
import { useEffect, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth.js';
import { AccountPage } from './pages/AccountPage.js';
import { AuthPage } from './pages/AuthPage.js';
import { NewProjectPage } from './pages/NewProjectPage.js';
import { ProjectPage } from './pages/ProjectPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { Link, matchPath, RouterProvider, useRouter } from './router.js';

function Header() {
  const { user, signOut } = useAuth();
  const { navigate } = useRouter();
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to={user ? '/projects' : '/signin'} className="brand">
          Ink Dimensions
        </Link>
        {user ? (
          <nav aria-label="Account">
            <ul className="nav-list">
              <li>
                <Link to="/projects">Projects</Link>
              </li>
              <li>
                <Link to="/account">Account</Link>
              </li>
              <li>
                <span className="muted">{user.email}</span>
              </li>
              <li>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    void signOut().then(() => navigate('/signin'));
                  }}
                >
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [navigate, to]);
  return null;
}

function Routes() {
  const { path } = useRouter();
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;

  if (path === '/signin' || path === '/signup') {
    return user ? <Redirect to="/projects" /> : <AuthPage mode={path === '/signup' ? 'signup' : 'signin'} />;
  }
  if (!user) return <Redirect to="/signin" />;
  if (path === '/' || path === '/projects') return <ProjectsPage />;
  if (path === '/projects/new') return <NewProjectPage />;
  if (path === '/account') return <AccountPage />;
  const withStep = matchPath('/projects/:id/:step', path);
  const plain = matchPath('/projects/:id', path);
  const params = withStep ?? plain;
  if (params?.id) return <ProjectPage id={params.id} step={withStep?.step ?? 'characters'} />;
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/projects">Go to your projects</Link>
      </p>
    </section>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Layout>
          <Routes />
        </Layout>
      </AuthProvider>
    </RouterProvider>
  );
}
