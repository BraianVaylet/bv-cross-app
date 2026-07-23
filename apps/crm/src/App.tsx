import { ToastProvider } from '@bv/ui';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AdminRoute, AuthedRoute, PublicOnlyRoute } from './auth/guards';
import { CrmLayout } from './components/CrmLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Account } from './pages/Account';
import { ClientDetail } from './pages/ClientDetail';
import { Clients } from './pages/Clients';
import { Exercises } from './pages/Exercises';
import { Forgot } from './pages/Forgot';
import { Login } from './pages/Login';
import { NoAccess } from './pages/NoAccess';
import { NotFound } from './pages/NotFound';
import { Onboarding } from './pages/Onboarding';
import { Packs } from './pages/Packs';
import { Placeholder } from './pages/Placeholder';
import { Register } from './pages/Register';
import { Reset } from './pages/Reset';
import { Settings } from './pages/Settings';
import { SelectOrg } from './pages/SelectOrg';
import { Verify } from './pages/Verify';

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot" element={<Forgot />} />
                <Route path="/reset" element={<Reset />} />
              </Route>
              <Route path="/verify" element={<Verify />} />

              <Route element={<AuthedRoute />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/select-org" element={<SelectOrg />} />
                <Route path="/sin-acceso" element={<NoAccess />} />
              </Route>

              <Route element={<AdminRoute />}>
                <Route element={<CrmLayout />}>
                  <Route path="/" element={<Placeholder title="Dashboard" task="F3-10" />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/clients/:id" element={<ClientDetail />} />
                  <Route path="/classes" element={<Placeholder title="Clases" task="F3-06" />} />
                  <Route path="/packs" element={<Packs />} />
                  <Route path="/exercises" element={<Exercises />} />
                  <Route path="/stats" element={<Placeholder title="Estadísticas" task="F3-10" />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/account" element={<Account />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
