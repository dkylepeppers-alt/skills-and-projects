// Uptime Log: a sandboxed Server Extension (Engine 2.5.2+; needs macOS Seatbelt or
// Linux Bubblewrap on the host). Server code gets log, storage, managed timers and
// onCleanup only: no filesystem, process, network or module loading.

const HOUR = 60 * 60 * 1000;
const saved = await marinara.storage.get();
const starts = (Number(saved.starts) || 0) + 1;
await marinara.storage.patch({ starts, lastStart: new Date().toISOString() });
marinara.log.info(`Uptime Log: start #${starts}`);

let hours = 0;
const timer = marinara.setInterval(() => {
  hours += 1;
  marinara.log.info(`Uptime Log: up ${hours} hour${hours === 1 ? "" : "s"} since start #${starts}`);
}, HOUR);

marinara.onCleanup(() => marinara.clearInterval(timer));
