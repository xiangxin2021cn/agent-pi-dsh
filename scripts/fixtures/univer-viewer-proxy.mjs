// Relevant statements from the official 0.3.0 bridge, executable with test sockets.
export const viewerProxyFixture = `
const upstreamUrl = new URL(target, rewriteLoopback(await resolveOrigin()));
const pending = [];
client.on("message", (data) => {
  if (upstream.readyState === 1) upstream.send(data);
  else if (upstream.readyState === 0) pending.push(toBuffer(data));
});
upstream.on("open", () => {
  for (const frame of pending.splice(0)) upstream.send(frame);
});
upstream.on("message", (data) => {
  client.send(data);
});
return upstreamUrl;
`
