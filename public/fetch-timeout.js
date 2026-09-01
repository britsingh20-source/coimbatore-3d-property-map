(() => {
  const nativeFetch = window.fetch.bind(window);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const RECENT_LOGIN_KEY = 'crm-recent-login';
  const RECENT_LOGIN_GRACE_MS = 120000;
  let recentLogin = null;

  function readRecentLogin() {
    if (recentLogin) return recentLogin;
    try {
      const raw = sessionStorage.getItem(RECENT_LOGIN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.token || !parsed?.accepted_at || Date.now() - parsed.accepted_at > RECENT_LOGIN_GRACE_MS) {
        sessionStorage.removeItem(RECENT_LOGIN_KEY);
        return null;
      }
      recentLogin = parsed;
      return recentLogin;
    } catch (_) {
      return null;
    }
  }

  function rememberLogin(data) {
    recentLogin = { ...data, accepted_at: Date.now() };
    try { sessionStorage.setItem(RECENT_LOGIN_KEY, JSON.stringify(recentLogin)); } catch (_) {}
  }

  function clearRecentLogin() {
    recentLogin = null;
    try { sessionStorage.removeItem(RECENT_LOGIN_KEY); } catch (_) {}
  }

  async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('CRM server request timed out', 'TimeoutError')), 12000);
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function authToken(init = {}) {
    const headers = new Headers(init.headers || {});
    const value = headers.get('authorization') || '';
    return value.startsWith('Bearer ') ? value.slice(7) : '';
  }

  function canTrustRecentLogin(init = {}) {
    const login = readRecentLogin();
    const token = authToken(init);
    return !!(login && token && token === login.token && Date.now() - login.accepted_at < RECENT_LOGIN_GRACE_MS);
  }

  function syntheticSession(login) {
    const now = new Date().toISOString();
    return new Response(JSON.stringify({
      ok: true,
      employee_id: login.employee_id,
      user_label: login.user_label,
      role: login.role,
      login_at: login.login_at || now,
      last_activity_at: now,
      call_active: false,
      idle_timeout_minutes: login.idle_timeout_minutes || 10,
      verification_grace: true
    }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const apiBase = window.LEAD_API_BASE || '';
    const workBase = window.WORK_HOURS_API_BASE || '';
    const isCrmRequest = (apiBase && url.startsWith(apiBase)) || (workBase && url.startsWith(workBase)) || url.includes('coimbatore-lead-crm-api.') || url.includes('workers.dev/api/');
    if (!isCrmRequest || init.signal) return nativeFetch(input, init);

    const isLogin = /\/api\/session\/login(?:\?|$)/.test(url);
    const isSessionVerify = /\/api\/session\/me(?:\?|$)/.test(url);
    const isLogout = /\/api\/session\/logout(?:\?|$)/.test(url);

    if (isLogin) {
      const response = await fetchWithTimeout(input, init);
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data?.token) rememberLogin(data);
        } catch (_) {}
      }
      return response;
    }

    if (isSessionVerify) {
      let response = null;
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          response = await fetchWithTimeout(input, init);
          if (response.ok) {
            clearRecentLogin();
            return response;
          }
          if (![401, 408, 429, 500, 502, 503, 504].includes(response.status)) return response;
          if (attempt < 3) await sleep([250, 650, 1400][attempt]);
        }
      } catch (error) {
        if (!canTrustRecentLogin(init)) throw error;
      }
      if (canTrustRecentLogin(init)) return syntheticSession(readRecentLogin());
      return response || fetchWithTimeout(input, init);
    }

    if (isLogout) {
      try { return await fetchWithTimeout(input, init); }
      finally { clearRecentLogin(); }
    }

    return fetchWithTimeout(input, init);
  };
})();
