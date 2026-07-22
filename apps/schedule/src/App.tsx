import { ToastProvider } from '@bv/ui';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AuthedRoute, ProtectedRoute, PublicOnlyRoute } from './auth/guards';
import { AppLayout } from './components/AppLayout';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Account } from './pages/Account';
import { Credits } from './pages/Credits';
import { Forgot } from './pages/Forgot';
import { Grid } from './pages/Grid';
import { Join } from './pages/Join';
import { Login } from './pages/Login';
import { MyBookings } from './pages/MyBookings';
import { NotFound } from './pages/NotFound';
import { Register } from './pages/Register';
import { Reset } from './pages/Reset';
import { SelectOrg } from './pages/SelectOrg';
import { Verify } from './pages/Verify';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <UpdatePrompt />
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot" element={<Forgot />} />
              <Route path="/reset" element={<Reset />} />
            </Route>
            {/* Verify queda fuera de PublicOnly: un usuario logueado también
                puede abrir el enlace del mail sin ser expulsado a la grilla. */}
            <Route path="/verify" element={<Verify />} />

            <Route element={<AuthedRoute />}>
              <Route path="/join" element={<Join />} />
              <Route path="/select-org" element={<SelectOrg />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Grid />} />
                <Route path="/bookings" element={<MyBookings />} />
                <Route path="/credits" element={<Credits />} />
                <Route path="/account" element={<Account />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
