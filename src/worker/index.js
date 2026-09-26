import { createPm2Service } from "./service.js";

zync.on("ready", async () => {
  await zync.panel.register("pm2.monitor");
});
const handle = createPm2Service(zync);
zync.panel.onMessage((event) => {
  handle(event).catch(() => {
    /* The pane can close while a reply is in flight. */
  });
});
