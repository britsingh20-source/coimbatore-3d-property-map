(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const apiBase = window.LEAD_API_BASE || '';
    const workBase = window.WORK_HOURS_API_BASE || '';
    const isCrmRequest = (apiBase && url.startsWith(apiBase)) || (workBase && url.startsWith(workBase)) || url.includes('coimbatore-lead-crm-api.') || url.includes('workers.dev/api/');
    if (!isCrmRequest || init.signal) return nativeFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('CRM server request timed out', 'TimeoutError')), 12000);
    return nativeFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
})();
