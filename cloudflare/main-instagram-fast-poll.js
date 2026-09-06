import worker from './main-meta-webhooks.js';

async function runPollCycle(controller, env) {
  let pending = null;
  const pollCtx = {
    waitUntil(promise) {
      pending = pending ? Promise.all([pending, promise]) : promise;
    }
  };
  await worker.scheduled(controller, env, pollCtx);
  if (pending) await pending;
}

export default {
  async fetch(request, env, ctx) {
    return worker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const task = (async () => {
      // Cloudflare Cron starts once per minute. Run immediately, then five
      // additional checks 10 seconds apart so the fallback latency is ~10s.
      for (let i = 0; i < 6; i++) {
        if (i > 0) await scheduler.wait(10000);
        try {
          await runPollCycle(controller, env);
        } catch (error) {
          console.log('Fast Instagram poll cycle failed', error?.message || error);
        }
      }
    })();
    ctx.waitUntil(task);
  }
};
