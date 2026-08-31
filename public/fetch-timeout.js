(() => {
  const nativeFetch = window.fetch.bind(window);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let recentLogin = null;

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
      idle_timeout_minutes: login.idle_timeout_minutes || 10
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

    if (isLogin) {
      const response = await fetchWithTimeout(input, init);
      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (data?.token) recentLogin = { ...data, accepted_at: Date.now() };
        } catch (_) {}
      }
      return response;
    }

    if (isSessionVerify) {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetchWithTimeout(input, init);
        if (response.status !== 401) return response;
        if (attempt < 2) await sleep(attempt === 0 ? 250 : 600);
      }
      const token = authToken(init);
      if (recentLogin && token && token === recentLogin.token && Date.now() - recentLogin.accepted_at < 15000) {
        return syntheticSession(recentLogin);
      }
      return response;
    }

    return fetchWithTimeout(input, init);
  };
})();
