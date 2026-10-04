import { InstallPactPrompt, PwaInstallTracker } from './components/pwa/InstallPactPrompt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/auth';
import { ApiError } from './api/client';
import { Loading } from './components/app/States';
import { ThemeProvider } from './theme/ThemeProvider';
import { peekReturnTo } from './pages/app/auth/flow';
import { ActivityScreen } from './pages/app/ActivityScreen';
import { AppShell } from './pages/app/AppShell';
import { CodeScreen, PhoneScreen, ProfileSetupScreen } from './pages/app/auth/AuthScreens';
import { EmailCodeScreen, EmailScreen, AuthenticateScreen, GoogleReturnScreen } from './pages/app/auth/EmailScreens';
import { HomeScreen } from './pages/app/HomeScreen';
import { DemoPactScreen } from './features/demo/DemoPactScreen';
import { JoinWithInviteScreen } from './features/onboarding/JoinWithInviteScreen';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { NotificationDetailScreen } from './pages/app/NotificationDetailScreen';
import { NotificationsScreen } from './pages/app/NotificationsScreen';
import { PactsScreen } from './pages/app/PactsScreen';
import { ProfileScreen } from './pages/app/ProfileScreen';
import { CirclesScreen } from './pages/app/circles/CirclesScreen';
import { WelcomeScreen } from './pages/app/WelcomeScreen';
// The marketing pages (GSAP, scroll choreography) and the style guide load on demand,
// so people opening the app don't download them, and vice versa.
const AskLinkScreen = lazy(() => import('./pages/app/asks/AskLinkScreen').then((m) => ({ default: m.AskLinkScreen })));
const SplitLinkScreen = lazy(() => import('./pages/app/splits/SplitLinkScreen').then((m) => ({ default: m.SplitLinkScreen })));
const RecapLinkScreen = lazy(() => import('./pages/app/recap/RecapLinkScreen').then((m) => ({ default: m.RecapLinkScreen })));
const PlanLinkScreen = lazy(() => import('./pages/app/plans/PlanLinkScreen').then((m) => ({ default: m.PlanLinkScreen })));
const LandingPage = lazy(() => import('./pages/site/LandingPage').then((m) => ({ default: m.LandingPage })));
const DownloadPage = lazy(() => import('./pages/download/DownloadPage').then((m) => ({ default: m.DownloadPage })));
const StyleGuidePage = lazy(() => import('./pages/styleguide/StyleGuidePage').then((m) => ({ default: m.StyleGuidePage })));
const TemplatesPreview = lazy(() => import('./pages/dev/TemplatesPreview').then((m) => ({ default: m.TemplatesPreview })));
const LegalPage = lazy(() => import('./pages/legal/LegalPage').then((m) => ({ default: m.LegalPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      // Retry only what a retry can fix: network blips and server errors.
      retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
    },
    mutations: { retry: false },
  },
});

/** Signed-out visitors are sent to Welcome and brought back after signing in. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signOutReason } = useAuth();
  const location = useLocation();
  // Once someone is signed in and the browser is idle, fetch the feature groups so the first tap into a Pact or a Circle doesn't wait.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => void Promise.all([load_pact(), load_social()]).catch(() => undefined);
    const id = idle ? idle(run) : window.setTimeout(run, 1500);
    return () => (idle ? undefined : window.clearTimeout(id));
  }, [status]);
  // A stable object: a fresh one every render made a page that lingers while it animates away re-fire its redirect without end.
  const from = location.pathname + location.search;
  const state = useMemo(() => (signOutReason === 'explicit' ? undefined : { from }), [signOutReason, from]);
  if (status === 'loading') return <Loading full />;
  // After choosing to sign out, the next person to sign in starts fresh on Home. Already there: nowhere to redirect to.
  if (status === 'signedOut') return location.pathname === '/app' ? null : <Navigate to="/app" replace state={state} />;
  return <>{children}</>;
}

/** Signed-in people skip Welcome and the sign-in steps. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loading full />;
  if (status === 'signedIn') return <Navigate to={peekReturnTo()} replace />;
  return <>{children}</>;
}

/** The old address of a shared Ask. */
function AskLinkRedirect() {
  const { token = '' } = useParams();
  return <Navigate to={`/a/${token}`} replace />;
}

// Feature groups load on first use, one chunk each. The tab roots (Home, Circles, Activity, Me, Pacts) stay in the entry so switching tabs never waits.
const load_social = () => import('./pages/app/groups/social');
const CircleInviteScreen = lazy(() => load_social().then((m) => ({ default: m.CircleInviteScreen })));
const CircleScreen = lazy(() => load_social().then((m) => ({ default: m.CircleScreen })));
const CreateCircleScreen = lazy(() => load_social().then((m) => ({ default: m.CreateCircleScreen })));
const AskScreen = lazy(() => load_social().then((m) => ({ default: m.AskScreen })));
const CreateAskScreen = lazy(() => load_social().then((m) => ({ default: m.CreateAskScreen })));
const PlanScreen = lazy(() => load_social().then((m) => ({ default: m.PlanScreen })));
const CreatePlanScreen = lazy(() => load_social().then((m) => ({ default: m.CreatePlanScreen })));
const SplitScreen = lazy(() => load_social().then((m) => ({ default: m.SplitScreen })));
const CreateSplitScreen = lazy(() => load_social().then((m) => ({ default: m.CreateSplitScreen })));
const RecapScreen = lazy(() => load_social().then((m) => ({ default: m.RecapScreen })));
const load_pact = () => import('./pages/app/groups/pact');
const PactRoute = lazy(() => load_pact().then((m) => ({ default: m.PactRoute })));
const CreatePactScreen = lazy(() => load_pact().then((m) => ({ default: m.CreatePactScreen })));
const ContributeScreen = lazy(() => load_pact().then((m) => ({ default: m.ContributeScreen })));
const InviteScreen = lazy(() => load_pact().then((m) => ({ default: m.InviteScreen })));
const JoinScreen = lazy(() => load_pact().then((m) => ({ default: m.JoinScreen })));
const GuidedStartScreen = lazy(() => load_pact().then((m) => ({ default: m.GuidedStartScreen })));
const load_money = () => import('./pages/app/groups/money');
const CheckoutScreen = lazy(() => load_money().then((m) => ({ default: m.CheckoutScreen })));
const TopupScreen = lazy(() => load_money().then((m) => ({ default: m.TopupScreen })));
const TopupStatusScreen = lazy(() => load_money().then((m) => ({ default: m.TopupStatusScreen })));
const WalletScreen = lazy(() => load_money().then((m) => ({ default: m.WalletScreen })));
const WithdrawScreen = lazy(() => load_money().then((m) => ({ default: m.WithdrawScreen })));
const BankAccountsScreen = lazy(() => load_money().then((m) => ({ default: m.BankAccountsScreen })));
const AccountScreen = lazy(() => load_money().then((m) => ({ default: m.AccountScreen })));
const SecurityScreen = lazy(() => load_money().then((m) => ({ default: m.SecurityScreen })));
const VerifyScreen = lazy(() => load_money().then((m) => ({ default: m.VerifyScreen })));

const authed = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ThemeProvider>
            <Suspense fallback={<Loading full />}>
            <PwaInstallTracker />
            <InstallPactPrompt />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/authenticate" element={<AuthenticateScreen />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/styleguide" element={<StyleGuidePage />} />
              <Route path="/dev/templates" element={<TemplatesPreview />} />
              <Route path="/terms" element={<LegalPage doc="terms" />} />
              <Route path="/privacy" element={<LegalPage doc="privacy" />} />
              <Route path="/refunds" element={<LegalPage doc="refunds" />} />
              <Route path="/cookies" element={<LegalPage doc="cookies" />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<GuestOnly><WelcomeScreen /></GuestOnly>} />
                <Route path="auth/phone" element={<GuestOnly><PhoneScreen /></GuestOnly>} />
                <Route path="auth/code" element={<GuestOnly><CodeScreen /></GuestOnly>} />
                <Route path="auth/profile" element={<GuestOnly><ProfileSetupScreen /></GuestOnly>} />
                <Route path="auth/welcome" element={<GuestOnly><WelcomeScreen /></GuestOnly>} />
                <Route path="auth/email" element={<GuestOnly><EmailScreen /></GuestOnly>} />
                <Route path="auth/email-code" element={<GuestOnly><EmailCodeScreen /></GuestOnly>} />
                <Route path="auth/google" element={<GuestOnly><GoogleReturnScreen /></GuestOnly>} />
                <Route path="join/:code" element={<JoinScreen />} />
                <Route path="c/:token" element={<CircleInviteScreen />} />
                <Route path="ask/:token" element={<AskLinkRedirect />} />

                <Route path="home" element={authed(<HomeScreen />)} />
                <Route path="pacts" element={authed(<PactsScreen />)} />
                <Route path="circles" element={authed(<CirclesScreen />)} />
                <Route path="circles/new" element={authed(<CreateCircleScreen />)} />
                <Route path="circles/:id" element={authed(<CircleScreen />)} />
                <Route path="recap/:kind/:id" element={authed(<RecapScreen />)} />
                <Route path="splits/new" element={authed(<CreateSplitScreen />)} />
                <Route path="splits/:id" element={authed(<SplitScreen />)} />
                <Route path="plans/new" element={authed(<CreatePlanScreen />)} />
                <Route path="plans/:id" element={authed(<PlanScreen />)} />
                <Route path="asks/new" element={authed(<CreateAskScreen />)} />
                <Route path="asks/:id" element={authed(<AskScreen />)} />
                <Route path="wallet" element={authed(<WalletScreen />)} />
                <Route path="profile" element={authed(<ProfileScreen />)} />
                <Route path="activity" element={authed(<ActivityScreen />)} />
                <Route path="onboarding" element={authed(<OnboardingScreen />)} />
                <Route path="start" element={authed(<GuidedStartScreen />)} />
                <Route path="join-invite" element={authed(<JoinWithInviteScreen />)} />
                <Route path="demo/:id" element={authed(<DemoPactScreen />)} />
                <Route path="notifications" element={authed(<NotificationsScreen />)} />
                <Route path="notifications/:id" element={authed(<NotificationDetailScreen />)} />
                <Route path="create" element={authed(<CreatePactScreen />)} />
                <Route path="pact/:id" element={authed(<PactRoute />)} />
                <Route path="pact/:id/invite" element={authed(<InviteScreen />)} />
                <Route path="pact/:id/contribute" element={authed(<ContributeScreen />)} />
                <Route path="wallet/topup" element={authed(<TopupScreen />)} />
                <Route path="wallet/topup/:ref" element={authed(<TopupStatusScreen />)} />
                <Route path="wallet/checkout/:ref" element={authed(<CheckoutScreen />)} />
                <Route path="wallet/withdraw" element={authed(<WithdrawScreen />)} />
                <Route path="profile/verify" element={authed(<VerifyScreen />)} />
                <Route path="profile/account" element={authed(<AccountScreen />)} />
                <Route path="profile/security" element={authed(<SecurityScreen />)} />
                <Route path="profile/banks" element={authed(<BankAccountsScreen />)} />
              </Route>
              {/* A shared Ask: its own short address, inside the app shell but with no navigation of its own. */}
              <Route path="/a" element={<AppShell />}>
                <Route path=":token" element={<AskLinkScreen />} />
              </Route>
              <Route path="/r" element={<AppShell />}>
                <Route path=":token" element={<RecapLinkScreen />} />
              </Route>
              <Route path="/s" element={<AppShell />}>
                <Route path=":token" element={<SplitLinkScreen />} />
              </Route>
              <Route path="/p" element={<AppShell />}>
                <Route path=":token" element={<PlanLinkScreen />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            </ThemeProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
