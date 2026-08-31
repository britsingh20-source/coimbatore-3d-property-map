(() => {
  const nativeFetch = window.fetch.bind(window);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('CRM server request timed out', 'TimeoutError')), 12000);
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const apiBase = window.LEAD_API_BASE || '';
    const workBase = window.WORK_HOURS_API_BASE || '';
    const isCrmRequest = (apiBase && url.startsWith(apiBase)) || (workBase && url.startsWith(workBase)) || url.includes('coimbatore-lead-crm-api.') || url.includes('workers.dev/api/');
    if (!isCrmRequest || init.signal) return nativeFetch(input, init);

    const isSessionVerify = /\/api\/session\/me(?:\?|$)/.test(url);
    const attempts = isSessionVerify ? 3 : 1;
    let response;
    for (let attempt = 0; attempt < attempts; attempt++) {
      response = await fetchWithTimeout(input, init);
      if (response.status !== 401 || !isSessionVerify || attempt === attempts - 1) return response;
      await sleep(attempt === 0 ? 250 : 600);
    }
    return response;
  };
})();
