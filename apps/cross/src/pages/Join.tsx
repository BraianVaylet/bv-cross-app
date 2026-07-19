import { Button, ErrorBanner, Input } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';

/**
 * Pantalla mínima de join — F2-04 la completa (mapeo fino de errores,
 * normalización en vivo, accesos desde el menú).
 */
export function Join() {
  const { refreshMemberships, selectOrg } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { membership } = await api.orgs.join(code.trim().toLowerCase());
      await refreshMemberships();
      selectOrg(membership.orgId);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Unite a tu gimnasio"
      subtitle="Pedile el código a tu box y entrá a su catálogo."
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Input
          label="Código del gimnasio"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="ej: bahia-cross-demo"
          value={code}
          onChange={(e) => { setCode(e.target.value); }}
        />
        <Button type="submit" full size="lg" loading={loading}>
          Unirme
        </Button>
      </form>
    </AuthShell>
  );
}
