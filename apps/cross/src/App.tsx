import { ToastProvider } from '@bv/ui';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AuthedRoute, ProtectedRoute, PublicOnlyRoute } from './auth/guards';
import { AppLayout } from './components/AppLayout';
import { EditExercise } from './pages/EditExercise';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { Forgot } from './pages/Forgot';
import { Home } from './pages/Home';
import { Join } from './pages/Join';
import { Login } from './pages/Login';
import { NewExercise } from './pages/NewExercise';
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
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot" element={<Forgot />} />
              <Route path="/reset" element={<Reset />} />
            </Route>
            {/* Verify queda fuera de PublicOnly: un usuario logueado también
                puede abrir el enlace del mail sin ser expulsado a Home. */}
            <Route path="/verify" element={<Verify />} />

            <Route element={<AuthedRoute />}>
              <Route path="/join" element={<Join />} />
              <Route path="/select-org" element={<SelectOrg />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/exercises/new" element={<NewExercise />} />
                <Route path="/exercises/:id" element={<ExerciseDetail />} />
                <Route path="/exercises/:id/edit" element={<EditExercise />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
