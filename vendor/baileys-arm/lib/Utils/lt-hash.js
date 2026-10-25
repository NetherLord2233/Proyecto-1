let LT_HASH_ANTI_TAMPERING;
try {
  const { LTHashAntiTampering } = await import("whatsapp-rust-bridge");
  LT_HASH_ANTI_TAMPERING = new LTHashAntiTampering();
} catch (err) {
  const message = "`whatsapp-rust-bridge` failed to load (no prebuilt binary for this platform/arch). App-state sync (LT hash) is unavailable here. Original error: " + (err?.message || err);
  LT_HASH_ANTI_TAMPERING = new Proxy({}, { get() {
    throw new Error(message);
  } });
}
export {
  LT_HASH_ANTI_TAMPERING
};
