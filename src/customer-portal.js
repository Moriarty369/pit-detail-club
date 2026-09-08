import { createDemoAuth } from './demo-auth.js';
import { requestReward } from './domain.js';
import { createApiClient } from './api-client.js';

export function createCustomerPortal(storage) {
  if (import.meta.env.VITE_DATA_SOURCE !== 'api') {
    const auth = createDemoAuth(storage);
    return {
      isDemo: true, init: async () => {}, current: auth.current, request: auth.request, confirm: auth.confirm, logout: auth.logout,
      refresh: async () => auth.current(),
      updateProfile: async profile => { const member = auth.current(); const next = { ...member, customer: { ...member.customer, ...profile } }; auth.save(next); return next; },
      requestReward: async id => { const result = requestReward(auth.current(), id); auth.save(result.state); return result; },
    };
  }
  const api = createApiClient();
  let member = null;
  async function refresh() {
    try { const result = await api('/session'); member = result.member; return member; }
    catch (error) { if (error.status === 401) { member = null; return null; } throw error; }
  }
  return {
    isDemo: false, init: refresh, refresh, current: () => member,
    request: async ({ mode, name, email, password, marketing }) => {
      const result = await api(`/auth/${mode}`, { method: 'POST', body: mode === 'register' ? { name, email, password, marketing } : { email, password } });
      member = result.member; return { authenticated: true, member };
    },
    logout: async () => { await api('/auth/logout', { method: 'POST', body: {} }); member = null; },
    updateProfile: async profile => { member = await api('/me', { method: 'PATCH', body: profile }); return member; },
    requestReward: async offerId => { const result = await api('/me/rewards', { method: 'POST', body: { offerId } }); member = result.state; return result; },
  };
}
